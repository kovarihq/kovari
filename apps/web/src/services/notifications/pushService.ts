import { createAdminSupabaseClient } from "@kovari/api";
import { firebaseAdmin } from "./firebaseAdmin";
import { shouldSendPush } from "./shouldSendPush";
import { NotificationPayloadBuilder, getChannelId, PushPayload } from "./payloadBuilder";
import { NotificationType, EntityType } from "@kovari/types";

export interface PushMessageParams {
  supabaseId: string;
  clerkId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType?: EntityType;
  entityId?: string | null;
  data?: Record<string, string>;
}

export type PushStatus =
  | "delivered"
  | "suppressed"
  | "no_token"
  | "failed"
  | "skipped_low_priority";

export interface PushResult {
  success: boolean;
  deliveredCount: number;
  pushStatus: PushStatus;
  error?: string;
}

export class PushService {
  /**
   * Core push dispatch method.
   * Returns a typed PushResult that createNotification.ts writes back to the DB
   * for delivery observability.
   */
  static async sendPush(params: PushMessageParams): Promise<PushResult> {
    const {
      supabaseId,
      clerkId,
      type,
      title,
      body,
      entityType = null,
      entityId = null,
      data = {},
    } = params;

    if (!firebaseAdmin) {
      console.warn("[PushService] Firebase Admin SDK not initialized.");
      return { success: false, deliveredCount: 0, pushStatus: "failed", error: "Firebase SDK not initialized" };
    }

    try {
      // 1. Run suppression decision engine
      const isEligible = await shouldSendPush({ userId: clerkId, type, entityType, entityId });

      if (!isEligible) {
        console.log(`[PushService] Suppressed for ${clerkId} (type: ${type})`);
        return { success: true, deliveredCount: 0, pushStatus: "suppressed" };
      }

      // 2. Fetch active device tokens
      const supabase = createAdminSupabaseClient();
      const { data: devices, error: dbError } = await supabase
        .from("fcm_device_tokens")
        .select("fcm_token, device_id, platform")
        .eq("user_id", supabaseId);

      if (dbError) {
        console.error("[PushService] DB error fetching tokens:", dbError);
        return { success: false, deliveredCount: 0, pushStatus: "failed", error: dbError.message };
      }

      if (!devices || devices.length === 0) {
        return { success: true, deliveredCount: 0, pushStatus: "no_token" };
      }

      let deliveredCount = 0;

      // 3. Dispatch to each device token
      for (const device of devices) {
        try {
          const messagePayload = {
            token: device.fcm_token,
            notification: { title, body },
            data: {
              ...data,
              type,
              entity_type: entityType ?? "",
              entity_id: entityId ?? "",
              url: data.url || getNotificationLink(entityType, entityId),
            },
            android: {
              priority: "high" as const,
              notification: {
                sound: "default",
                // Route to the correct Android notification channel
                channelId: getChannelId(entityType),
                clickAction: "FLUTTER_NOTIFICATION_CLICK",
                visibility: "public" as const,
              },
            },
            apns: {
              payload: {
                aps: { sound: "default", badge: 1 },
              },
            },
          };

          await firebaseAdmin.messaging().send(messagePayload);
          deliveredCount++;

          // Update last_active_at
          await supabase
            .from("fcm_device_tokens")
            .update({ last_active_at: new Date().toISOString() })
            .eq("user_id", supabaseId)
            .eq("device_id", device.device_id);

        } catch (fcmError: any) {
          console.error(`[PushService] FCM failure for device ${device.device_id}:`, fcmError);

          // Auto-cleanup stale tokens
          const isStale =
            fcmError.code === "messaging/registration-token-not-registered" ||
            fcmError.code === "messaging/invalid-argument" ||
            (fcmError.message && fcmError.message.includes("not registered"));

          if (isStale) {
            console.log(`[PushService] Removing stale token: ${device.device_id}`);
            await supabase
              .from("fcm_device_tokens")
              .delete()
              .eq("user_id", supabaseId)
              .eq("device_id", device.device_id);
          }
        }
      }

      const pushStatus: PushStatus = deliveredCount > 0 ? "delivered" : "failed";
      return { success: true, deliveredCount, pushStatus };

    } catch (err: any) {
      console.error("[PushService] General delivery error:", err);
      return { success: false, deliveredCount: 0, pushStatus: "failed", error: err.message };
    }
  }

  // ---------------------------------------------------------------------------
  // Typed helpers — built using NotificationPayloadBuilder
  // ---------------------------------------------------------------------------

  /** DM or group chat message — E2EE privacy mode (no content preview) */
  static async sendMessageNotification(
    recipientSupabaseId: string,
    recipientClerkId: string,
    chatId: string,
  ): Promise<PushResult> {
    const payload = NotificationPayloadBuilder.message(chatId);
    return this.sendPush({
      supabaseId: recipientSupabaseId,
      clerkId: recipientClerkId,
      type: NotificationType.NEW_MESSAGE,
      ...payload,
    });
  }

  /** Mutual match accepted */
  static async sendMatchNotification(
    recipientSupabaseId: string,
    recipientClerkId: string,
    partnerName: string,
    chatId: string,
  ): Promise<PushResult> {
    const payload = NotificationPayloadBuilder.match(partnerName, chatId);
    return this.sendPush({
      supabaseId: recipientSupabaseId,
      clerkId: recipientClerkId,
      type: NotificationType.MATCH_ACCEPTED,
      ...payload,
    });
  }

  /** Group invitation received */
  static async sendGroupNotification(
    recipientSupabaseId: string,
    recipientClerkId: string,
    groupName: string,
    groupId: string,
  ): Promise<PushResult> {
    const payload = NotificationPayloadBuilder.groupInvite(groupName, groupId);
    return this.sendPush({
      supabaseId: recipientSupabaseId,
      clerkId: recipientClerkId,
      type: NotificationType.GROUP_INVITE_RECEIVED,
      ...payload,
    });
  }

  /** New connection request */
  static async sendMatchRequestNotification(
    recipientSupabaseId: string,
    recipientClerkId: string,
  ): Promise<PushResult> {
    const payload = NotificationPayloadBuilder.matchRequest();
    return this.sendPush({
      supabaseId: recipientSupabaseId,
      clerkId: recipientClerkId,
      type: NotificationType.MATCH_INTEREST_RECEIVED,
      ...payload,
    });
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function getNotificationLink(entityType: EntityType | null, entityId: string | null): string {
  if (entityType === "chat" && entityId) return `/chat/${entityId}`;
  if (entityType === "group" && entityId) return `/groups/${entityId}`;
  return "/notifications";
}
