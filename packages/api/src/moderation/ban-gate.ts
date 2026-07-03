import type { SupabaseClient } from "@supabase/supabase-js";

/** Ban fields sourced exclusively from the users table (single source of truth). */
export interface BanStatusRow {
  banned: boolean;
  ban_reason: string | null;
  ban_expires_at: string | null;
}

export const BAN_ERROR_MESSAGE = "Account has been banned";

/**
 * Returns true when the user has an active ban or suspension.
 * Expired suspensions are treated as not banned (does not mutate DB).
 */
export function isActiveBan(user: Pick<BanStatusRow, "banned" | "ban_expires_at">): boolean {
  if (!user.banned) return false;
  if (user.ban_expires_at) {
    return new Date(user.ban_expires_at) > new Date();
  }
  return true;
}

export class BanEnforcementError extends Error {
  readonly code = "BANNED_USER" as const;

  constructor(
    message: string = BAN_ERROR_MESSAGE,
    public readonly banReason: string | null = null,
    public readonly banExpiresAt: string | null = null,
  ) {
    super(message);
    this.name = "BanEnforcementError";
  }
}

export async function getBanStatus(
  supabase: SupabaseClient,
  userId: string,
): Promise<(BanStatusRow & { id: string }) | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id, banned, ban_reason, ban_expires_at")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as BanStatusRow & { id: string };
}

/**
 * Central ban gate — fail closed when user is actively banned.
 * Optionally auto-lifts expired suspensions in the database.
 */
export async function assertNotBanned(
  supabase: SupabaseClient,
  userId: string,
  options: { autoLiftExpired?: boolean } = { autoLiftExpired: true },
): Promise<void> {
  const status = await getBanStatus(supabase, userId);
  if (!status) {
    throw new BanEnforcementError("Account unavailable");
  }

  if (!status.banned) return;

  if (status.ban_expires_at && new Date(status.ban_expires_at) <= new Date()) {
    if (options.autoLiftExpired) {
      await supabase
        .from("users")
        .update({ banned: false, ban_reason: null, ban_expires_at: null })
        .eq("id", userId);
    }
    return;
  }

  throw new BanEnforcementError(
    BAN_ERROR_MESSAGE,
    status.ban_reason,
    status.ban_expires_at,
  );
}

/** Returns ban status for auth responses without throwing. */
export function resolveActiveBanFields(
  user: Pick<BanStatusRow, "banned" | "ban_reason" | "ban_expires_at">,
): {
  banned: boolean;
  banReason: string | null;
  banExpiresAt: string | null;
} {
  const active = isActiveBan(user);
  return {
    banned: active,
    banReason: active ? user.ban_reason : null,
    banExpiresAt: active ? user.ban_expires_at : null,
  };
}
