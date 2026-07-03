import { supabaseAdmin } from "../supabase-admin";
import { ensureRedisConnection } from "../redis";
import { invalidateMatchingCache } from "./matching-cache";
import { BAN_SOCKET_CHANNEL } from "./constants";

export { BAN_SOCKET_CHANNEL };

export interface EnforceBanSideEffectsOptions {
  userId: string;
  clerkUserId?: string | null;
}

/**
 * Immediate platform-wide session and cache revocation when a user is banned.
 * Clerk session revoke is handled by the caller (admin routes use @clerk/nextjs/server).
 */
export async function enforceBanSideEffects(
  options: EnforceBanSideEffectsOptions,
): Promise<void> {
  const { userId, clerkUserId: clerkUserIdOpt } = options;

  let clerkUserId = clerkUserIdOpt ?? null;
  if (!clerkUserId) {
    const { data } = await supabaseAdmin
      .from("users")
      .select("clerk_user_id")
      .eq("id", userId)
      .maybeSingle();
    clerkUserId = data?.clerk_user_id ?? null;
  }

  await Promise.allSettled([
    revokeRefreshTokens(userId),
    deleteRedisTravelSessions(userId, clerkUserId),
    invalidateMatchingCache(userId),
    unregisterPushTokens(userId),
    cancelPendingOfflineEmails(userId),
    publishBanEvent(userId, clerkUserId),
  ]);
}

async function revokeRefreshTokens(userId: string): Promise<void> {
  try {
    await supabaseAdmin.from("refresh_tokens").delete().eq("user_id", userId);
  } catch (err) {
    console.error("[BanSideEffects] Failed to revoke refresh tokens:", err);
  }
}

async function deleteRedisTravelSessions(
  userId: string,
  clerkUserId: string | null,
): Promise<void> {
  try {
    const isRedisActive =
      !!process.env.REDIS_URL || process.env.NODE_ENV === "development";
    if (!isRedisActive) return;

    const client = await ensureRedisConnection();
    const keysToDelete: string[] = [];

    if (clerkUserId) {
      keysToDelete.push(`session:${clerkUserId}`);
    }
    keysToDelete.push(`session:user:${userId}`);

    for (const key of keysToDelete) {
      const sessionId = key.replace("session:", "");
      await client.del(key);
      await client.sRem("sessions:index", sessionId);
    }
  } catch (err) {
    console.error("[BanSideEffects] Failed to delete Redis travel sessions:", err);
  }
}

async function unregisterPushTokens(userId: string): Promise<void> {
  try {
    await supabaseAdmin.from("fcm_device_tokens").delete().eq("user_id", userId);
    await supabaseAdmin.from("push_subscriptions").delete().eq("user_id", userId);
  } catch (err) {
    console.error("[BanSideEffects] Failed to unregister push tokens:", err);
  }
}

async function cancelPendingOfflineEmails(userId: string): Promise<void> {
  try {
    const isRedisActive =
      !!process.env.REDIS_URL || process.env.NODE_ENV === "development";
    if (!isRedisActive) return;

    const client = await ensureRedisConnection();
    await client.zRem("offline_emails:queue", userId);
  } catch (err) {
    console.error("[BanSideEffects] Failed to cancel offline emails:", err);
  }
}

async function publishBanEvent(
  userId: string,
  clerkUserId: string | null,
): Promise<void> {
  try {
    const isRedisActive =
      !!process.env.REDIS_URL || process.env.NODE_ENV === "development";
    if (!isRedisActive) return;

    const client = await ensureRedisConnection();
    const payload = JSON.stringify({
      userId,
      clerkUserId,
      at: new Date().toISOString(),
    });
    await client.publish(BAN_SOCKET_CHANNEL, payload);
  } catch (err) {
    console.error("[BanSideEffects] Failed to publish ban event:", err);
  }
}
