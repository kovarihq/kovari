import { after } from "next/server";
import {
  CreateNotificationParams,
  NotificationType,
  NotificationPriorityMap,
  NotificationPriority,
  EntityType,
} from "@kovari/types";
import { shouldSendPush } from "@/services/notifications/shouldSendPush";
import {
  getPushSubscriptions,
  deletePushSubscription,
} from "@/services/notifications/subscriptions";
import { sendPushNotification } from "@/services/notifications/push";
import { pubClient, connectRedis } from "@/services/socket/redis";
import { NotificationEventDispatcher } from "@/services/notifications/dispatcher";
import { createAdminSupabaseClient, canUserReceiveNotifications } from "@kovari/api";
import { PushService } from "@/services/notifications/pushService";

/**
 * Server-only function to create a notification.
 * Handles DB persistence, priority derivation, and async push delivery.
 */
export async function createNotification(
  params: CreateNotificationParams,
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
  try {
    const {
      userId,
      type,
      title,
      message,
      entityType = null,
      entityId = null,
      imageUrl = null,
      priority: priorityOverride,
    } = params;

    if (!userId || !type || !title || !message) {
      return { success: false, error: "Missing required fields" };
    }

    // 1. Derive Priority
    const priority =
      priorityOverride ||
      NotificationPriorityMap[type] ||
      NotificationPriority.LOW;

    // 2. Resolve User (Handle both Clerk ID and Supabase UUID)
    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    const isUuid = uuidRegex.test(userId);

    let supabaseId: string | null = null;
    let clerkId: string | null = null;
    let isRecipientInternal = false;

    const supabaseAdmin = createAdminSupabaseClient();

    if (isUuid) {
      supabaseId = userId;
      // Fetch clerk_id for push/socket logic that might need it
      const { data: userRow } = await supabaseAdmin
        .from("users")
        .select("clerk_user_id, is_internal")
        .eq("id", userId)
        .single();
      clerkId = userRow?.clerk_user_id || null;
      isRecipientInternal = userRow?.is_internal || false;
    } else {
      clerkId = userId;
      const { data: userRow } = await supabaseAdmin
        .from("users")
        .select("id, is_internal")
        .eq("clerk_user_id", userId)
        .single();
      supabaseId = userRow?.id || null;
      isRecipientInternal = userRow?.is_internal || false;
    }

    if (!supabaseId) {
      console.error("[Notification] Could not resolve user:", userId);
      return { success: false, error: "User not found" };
    }

    // Enforce notification safety & isolation rules
    const senderId = params.data?.senderId || params.data?.sender_id || params.data?.fromUserId || params.data?.actorId;
    if (senderId) {
      const { data: senderRow } = await supabaseAdmin
        .from("users")
        .select("is_internal")
        .eq(senderId.includes("-") ? "id" : "clerk_user_id", senderId)
        .maybeSingle();
      
      const isSenderInternal = senderRow?.is_internal || false;

      // 1. Public recipients cannot receive notifications from internal accounts
      if (!isRecipientInternal && isSenderInternal) {
        console.log(`[Notification Suppressed] Blocked notification to public user ${supabaseId} from internal sender ${senderId}`);
        return { success: false, error: "Recipient unavailable" };
      }
    }

    // 2. Internal recipients should not receive non-transactional/discovery notifications (e.g. only chat, groups, and reports allowed)
    const allowedInternalTypes = [
      NotificationType.NEW_MESSAGE,
      NotificationType.GROUP_INVITE_RECEIVED,
      NotificationType.GROUP_JOIN_APPROVED,
      NotificationType.GROUP_JOIN_REQUEST_RECEIVED,
      NotificationType.REPORT_SUBMITTED,
      NotificationType.MATCH_ACCEPTED,
      NotificationType.MATCH_INTEREST_RECEIVED
    ];
    if (isRecipientInternal && !allowedInternalTypes.includes(type)) {
      console.log(`[Notification Suppressed] Suppressed discovery notification type ${type} for internal test account ${supabaseId}`);
      return { success: false, error: "Recipient unavailable" };
    }

    const canReceive = await canUserReceiveNotifications(supabaseId);
    if (!canReceive) {
      console.log(`[Notification] Suppressed for banned user: ${supabaseId}`);
      return { success: false, error: "Recipient unavailable" };
    }

    // 3. Insert into Database (Source of Truth)
    const { data: notifData, error } = await supabaseAdmin
      .from("notifications")
      .insert({
        user_id: supabaseId,
        type,
        title,
        message,
        entity_type: entityType,
        entity_id: entityId,
        image_url: imageUrl,
        is_read: false,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[Notification] DB Insert Error:", error);
      return { success: false, error: error.message };
    }

    const notificationId = notifData.id;

    // Side effects must complete via after() on Vercel — fire-and-forget is frozen when the route returns.
    after(async () => {
      try {
        await NotificationEventDispatcher.dispatch(params, notificationId);
      } catch (err) {
        console.error("[Notification] Dispatcher Error:", err);
      }

      if (clerkId && supabaseId) {
        try {
          await evaluatePushNotifications(
            clerkId,
            supabaseId,
            type,
            entityId,
            entityType as EntityType,
            title,
            message,
            imageUrl,
            notificationId,
            priority,
            params.data,
          );
        } catch (err) {
          console.error("[Notification] Async Push Error:", err);
        }
      }
    });

    return { success: true, notificationId };
  } catch (err: any) {
    console.error("[Notification] Exception:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Handles the logic for deciding and sending push notifications.
 */
async function evaluatePushNotifications(
  clerkId: string,
  supabaseId: string,
  type: NotificationType,
  entityId: string | null,
  entityType: EntityType,
  title: string,
  message: string,
  imageUrl: string | null,
  notificationId: string,
  priority: NotificationPriority,
  extraData?: Record<string, string>,
) {
  // 0. Ensure Redis is connected (important for Next.js API routes)
  await connectRedis();

  // Note: shouldSendPush() is called internally by PushService.sendPush().
  // We run it here first only to gate the web-push subscription path below.
  const eligible = await shouldSendPush({
    userId: clerkId,
    type,
    entityId,
    entityType,
  });
  if (!eligible) return;

  // 2. Redis Deduplication (Step 7)
  const dedupeKey = `chat:push:dedupe:${notificationId}`;
  const isDuplicate = await pubClient.set(dedupeKey, "true", {
    NX: true,
    EX: 3600,
  }); // 1 hour expiry
  if (!isDuplicate) {
    console.log(`[Push] Deduplicated notification: ${notificationId}`);
    return;
  }

  // 3. Dispatch FCM Mobile Push Notification (Android/iOS)
  try {
    const fcmBody =
      type === NotificationType.NEW_MESSAGE
        ? "Open Kovari to view message"
        : message;
    const pushResult = await PushService.sendPush({
      supabaseId,
      clerkId,
      type,
      title,
      body: fcmBody,
      entityType,
      entityId,
      data: {
        ...extraData,
        notificationId,
      },
    });

    // 📊 [Observability] Write push delivery outcome back to the notification row
    // This enables beta debugging: "why didn't they get the push?"
    const supabaseAdmin = createAdminSupabaseClient();
    await supabaseAdmin
      .from("notifications")
      .update({
        push_attempted_at: new Date().toISOString(),
        push_status: pushResult.pushStatus,
      })
      .eq("id", notificationId);
  } catch (fcmErr) {
    console.error(
      "[Notification] Mobile FCM Push Dispatch failed (best-effort):",
      fcmErr,
    );
  }

  // 3. Fetch Subs and Send (Uses Supabase UUID)
  const subs = await getPushSubscriptions(supabaseId);
  if (subs.length === 0) return;

  console.log(
    `[Push] Sending ${priority} priority push to user ${clerkId} (${supabaseId})`,
  );

  const payload = {
    title,
    body: message,
    icon: imageUrl || "/logo.png",
    data: {
      notificationId,
      url: getNotificationLink(entityType, entityId),
    },
  };

  const results = await Promise.all(
    subs.map((sub: any) => {
      const webpushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.keys_p256dh,
          auth: sub.keys_auth,
        },
      };
      return sendPushNotification(webpushSubscription, payload);
    }),
  );

  // 4. Cleanup failed/expired subscriptions
  for (let i = 0; i < results.length; i++) {
    if (!results[i].success && results[i].error === "expired") {
      await deletePushSubscription(supabaseId, subs[i].endpoint);
    }
  }
}

function getNotificationLink(
  entityType: EntityType,
  entityId: string | null,
): string {
  if (entityType === "chat" && entityId) return `/chat/${entityId}`;
  if (entityType === "group" && entityId) return `/groups/${entityId}`;
  return "/notifications";
}
