import { NotificationType, CreateNotificationParams } from "@kovari/types";
import { createAdminSupabaseClient, getDirectChatId } from "@kovari/api";
import { pubClient, connectRedis } from "../socket/redis";
import * as Sentry from "@sentry/nextjs";
import {
  sendMatchInterestEmail,
  sendMatchAcceptedEmail,
} from "@kovari/api";
import { scheduleOfflineReminder } from "../messaging/chatNotificationService";

/**
 * Standard base URL helper mapping environments automatically.
 */
export function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://kovari.in");
}

// Idempotency TTL Constants
const MATCH_INTEREST_EMAIL_TTL = 86400; // 24 hours
const MATCH_ACCEPTED_EMAIL_TTL = 604800; // 7 days

/**
 * Checks if a user has enabled email notifications for a specific type.
 * Currently defaults to true for all users/types in V1.
 */
export function canReceiveEmailNotification(userId: string, type: NotificationType): boolean {
  // Abstraction for future preference checks
  return true;
}

export class NotificationEventDispatcher {
  /**
   * Main dispatch entrypoint. Should remain channel-agnostic.
   * Isolates channel deliveries so failures never throw to the caller.
   */
  static async dispatch(params: CreateNotificationParams, notificationId: string): Promise<void> {
    try {
      await connectRedis();

      // Run channel deliveries in parallel with error isolation
      await Promise.allSettled([
        this.dispatchEmail(params, notificationId),
        this.dispatchPush(params, notificationId),
      ]);
    } catch (err: any) {
      console.error("[Dispatcher] Unexpected error in dispatch:", err);
      Sentry.captureException(err);
    }
  }

  /**
   * Evaluates and routes email notifications based on type and preferences.
   */
  private static async dispatchEmail(params: CreateNotificationParams, notificationId: string): Promise<void> {
    const { userId, type, entityId } = params;

    if (!canReceiveEmailNotification(userId, type)) {
      console.log(`[Dispatcher] Email notifications suppressed by preferences for user: ${userId}`);
      return;
    }

    const supabaseAdmin = createAdminSupabaseClient();
    
    // Resolve Supabase UUID if Clerk ID was passed
    const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    let recipientId = userId;
    if (!uuidRegex.test(userId)) {
      const { data: userRow } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("clerk_user_id", userId)
        .single();
      if (userRow) {
        recipientId = userRow.id;
      } else {
        console.error(`[Dispatcher] Could not resolve recipient user details for: ${userId}`);
        return;
      }
    }

    switch (type) {
      case NotificationType.MATCH_INTEREST_RECEIVED: {
        const fromUuid = entityId;
        if (!fromUuid) return;

        // Idempotency: Prevent duplicate match interest emails within 24h
        const idempotencyKey = `email_sent:match_interest:${fromUuid}:${recipientId}`;
        const isNew = await pubClient.set(idempotencyKey, "true", { NX: true, EX: MATCH_INTEREST_EMAIL_TTL });
        if (!isNew) {
          console.log("EMAIL_MATCH_SKIPPED", {
            recipient: recipientId,
            reason: "Match interest email already sent within 24h",
          });
          return;
        }

        try {
          // Fetch profiles, emails, and destinations
          const [recipientUserRes, senderProfileRes, interestRes] = await Promise.all([
            supabaseAdmin.from("users").select("email").eq("id", recipientId).single(),
            supabaseAdmin.from("profiles").select("name").eq("user_id", fromUuid).single(),
            supabaseAdmin
              .from("match_interests")
              .select("destination_id, destinations(name)")
              .eq("from_user_id", fromUuid)
              .eq("to_user_id", recipientId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
          ]);

          const recipientEmail = recipientUserRes.data?.email;
          if (!recipientEmail) {
            console.error(`[Dispatcher] Recipient email not found for: ${recipientId}`);
            return;
          }

          const senderName = senderProfileRes.data?.name || "Someone";
          // @ts-ignore
          const destinationName = interestRes.data?.destinations?.name || "your destination";

          const ctaLink = `${getAppUrl()}/requests`;

          await sendMatchInterestEmail({
            to: recipientEmail,
            fromName: senderName,
            destinationName,
            ctaLink,
          });
        } catch (e: any) {
          console.error("[Dispatcher] Failed to process MATCH_INTEREST_RECEIVED email:", e);
          Sentry.captureException(e);
        }
        break;
      }

      case NotificationType.MATCH_ACCEPTED: {
        const partnerId = entityId;
        if (!partnerId) return;

        // Idempotency: Prevent duplicate match accepted emails within 7 days
        const idempotencyKey = `email_sent:match_accepted:${recipientId}:${partnerId}`;
        const isNew = await pubClient.set(idempotencyKey, "true", { NX: true, EX: MATCH_ACCEPTED_EMAIL_TTL });
        if (!isNew) {
          console.log("EMAIL_MATCH_SKIPPED", {
            recipient: recipientId,
            reason: "Match accepted email already sent within 7 days",
          });
          return;
        }

        try {
          const [recipientUserRes, partnerProfileRes] = await Promise.all([
            supabaseAdmin.from("users").select("email").eq("id", recipientId).single(),
            supabaseAdmin.from("profiles").select("name").eq("user_id", partnerId).single(),
          ]);

          const recipientEmail = recipientUserRes.data?.email;
          if (!recipientEmail) {
            console.error(`[Dispatcher] Recipient email not found for: ${recipientId}`);
            return;
          }

          const partnerName = partnerProfileRes.data?.name || "Someone";
          const ctaLink = `${getAppUrl()}/chat/${partnerId}`;

          await sendMatchAcceptedEmail({
            to: recipientEmail,
            partnerName,
            ctaLink,
          });
        } catch (e: any) {
          console.error("[Dispatcher] Failed to process MATCH_ACCEPTED email:", e);
          Sentry.captureException(e);
        }
        break;
      }

      case NotificationType.NEW_MESSAGE: {
        const senderId = entityId;
        if (!senderId) return;

        // Delegate to the chatNotificationService to handle offline cooldown logic
        try {
          await scheduleOfflineReminder({
            recipientId,
            conversationId: params.data?.chatId || senderId, // fallback to senderId if direct
            senderId,
            messageId: notificationId,
            createdAt: new Date().toISOString(),
          });
        } catch (e: any) {
          console.error("[Dispatcher] Failed to schedule offline message reminder:", e);
          Sentry.captureException(e);
        }
        break;
      }

      default:
        // Other types do not trigger emails in V1
        break;
    }
  }

  /**
   * Reserved integration point for future push notification channels.
   */
  private static async dispatchPush(params: CreateNotificationParams, notificationId: string): Promise<void> {
    // Currently, FCM / Web Push is handled inside evaluatePushNotifications in createNotification.ts.
    // In future phases, that code can be refactored directly here to keep dispatcher channel-agnostic.
  }
}
