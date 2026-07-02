import { createAdminSupabaseClient, getDirectChatId } from "@kovari/api";
import { pubClient, connectRedis } from "../socket/redis";
import { sendOfflineMessagesEmail, OfflineConversationGroup } from "@kovari/api";
import * as Sentry from "@sentry/nextjs";
import { getAppUrl } from "../notifications/dispatcher";

const OFFLINE_COOLDOWN_MS = 300000; // 5 minutes
const BATCH_SIZE_LIMIT = 100;
const CRON_LOCK_KEY = "cron:send-offline-emails:lock";
const CRON_LOCK_TTL_SECONDS = 60;

export interface OfflineMessageReminderParams {
  recipientId: string;
  conversationId: string;
  senderId: string;
  messageId: string;
  createdAt: string;
}

export async function scheduleOfflineReminder(params: OfflineMessageReminderParams): Promise<void> {
  await connectRedis();
  const { recipientId } = params;

  const supabaseAdmin = createAdminSupabaseClient();
  
  // Resolve Clerk ID to check online status
  const { data: userRow } = await supabaseAdmin
    .from("users")
    .select("clerk_user_id")
    .eq("id", recipientId)
    .single();

  const clerkId = userRow?.clerk_user_id;
  if (!clerkId) {
    console.warn(`[chatNotificationService] Could not resolve clerkId for recipient ${recipientId}`);
    return;
  }

  // Check online presence
  const userSocketsKey = `user_socket:${clerkId}`;
  const isOnlineCount = await pubClient.sCard(userSocketsKey);
  const isOnline = isOnlineCount > 0;

  if (isOnline) {
    console.log(`[chatNotificationService] Recipient ${recipientId} is online. Skipping email schedule.`);
    return;
  }

  // Add to Redis ZSET. The score is the ready_at timestamp.
  // Every message received resets the score to now + 5 minutes.
  const queueKey = "offline_emails:queue";
  const readyAt = Date.now() + OFFLINE_COOLDOWN_MS;

  const startTime = performance.now();
  await pubClient.zAdd(queueKey, { score: readyAt, value: recipientId });
  const duration = performance.now() - startTime;

  console.log("EMAIL_OFFLINE_SCHEDULED", {
    duration: `${duration.toFixed(2)}ms`,
    recipient: recipientId,
    readyAt: new Date(readyAt).toISOString(),
    notification_type: "offline-messages",
    status: "scheduled",
  });
}

export async function cancelOfflineReminder(recipientId: string): Promise<void> {
  await connectRedis();
  const queueKey = "offline_emails:queue";
  const startTime = performance.now();
  await pubClient.zRem(queueKey, recipientId);
  const duration = performance.now() - startTime;

  console.log("EMAIL_OFFLINE_CANCELLED", {
    duration: `${duration.toFixed(2)}ms`,
    recipient: recipientId,
    notification_type: "offline-messages",
    status: "cancelled",
  });
}

export async function processPendingOfflineEmails(): Promise<{ processed: number; sent: number }> {
  await connectRedis();

  // 1. Acquire lightweight cron processing lock
  const hasLock = await pubClient.set(CRON_LOCK_KEY, "true", { NX: true, EX: CRON_LOCK_TTL_SECONDS });
  if (!hasLock) {
    console.log("[chatNotificationService] Cron lock is active. Skipping execution to prevent duplicates.");
    return { processed: 0, sent: 0 };
  }

  try {
    const queueKey = "offline_emails:queue";
    const now = Date.now();
    
    // Find expired users with a batch size limit (e.g. 100) to prevent memory issues
    const expiredUsers = await pubClient.zRangeByScore(queueKey, 0, now, { LIMIT: { offset: 0, count: BATCH_SIZE_LIMIT } });
    if (!expiredUsers || expiredUsers.length === 0) {
      return { processed: 0, sent: 0 };
    }

    const supabaseAdmin = createAdminSupabaseClient();
    let sentCount = 0;

    for (const recipientId of expiredUsers) {
      // Remove from queue first to prevent double-processing in case of subsequent runs
      await pubClient.zRem(queueKey, recipientId);

      const startTime = performance.now();
      try {
        // Fetch recipient profile details and email
        const { data: recipientUser } = await supabaseAdmin
          .from("users")
          .select("email, profiles(name)")
          .eq("id", recipientId)
          .single();

        if (!recipientUser?.email) {
          console.error(`[chatNotificationService] Email not found for recipient ${recipientId}`);
          continue;
        }

        const recipientProfile = Array.isArray(recipientUser.profiles)
          ? recipientUser.profiles[0]
          : recipientUser.profiles;
        const recipientName = (recipientProfile as any)?.name || "";

        // Fetch unread messages from Postgres
        const { data: unreadMessages } = await supabaseAdmin
          .from("direct_messages")
          .select(`
            id,
            message_content,
            sender_id,
            sender:users!direct_messages_sender_id_fkey(
              profiles(name)
            )
          `)
          .eq("receiver_id", recipientId)
          .is("read_at", null)
          .order("created_at", { ascending: true });

        if (!unreadMessages || unreadMessages.length === 0) {
          // All messages read/cleared in the meantime
          console.log("EMAIL_OFFLINE_CANCELLED", {
            recipient: recipientId,
            reason: "No unread messages found in database",
            notification_type: "offline-messages",
            status: "cancelled",
          });
          continue;
        }

        // Group unread messages by sender/conversation
        const groupsMap: Record<string, { senderName: string; messages: string[] }> = {};
        for (const msg of unreadMessages) {
          const senderObj = Array.isArray(msg.sender) ? msg.sender[0] : msg.sender;
          const senderProfile = Array.isArray(senderObj?.profiles)
            ? senderObj.profiles[0]
            : senderObj?.profiles;
          const senderName = (senderProfile as any)?.name || "Someone";
          
          if (!groupsMap[msg.sender_id]) {
            groupsMap[msg.sender_id] = { senderName, messages: [] };
          }
          groupsMap[msg.sender_id].messages.push(msg.message_content || "Sent an attachment");
        }

        const conversations: OfflineConversationGroup[] = Object.values(groupsMap);
        const totalMessages = conversations.reduce((acc, c) => acc + c.messages.length, 0);

        // If only one sender, deep link directly to the chat room; otherwise link to the chat list
        let ctaLink = `${getAppUrl()}/chat`;
        if (conversations.length === 1) {
          const senderId = Object.keys(groupsMap)[0];
          ctaLink = `${getAppUrl()}/chat/${senderId}`;
        }

        const result = await sendOfflineMessagesEmail({
          to: recipientUser.email,
          recipientName,
          conversations,
          ctaLink,
        });

        const duration = performance.now() - startTime;
        if (result.success) {
          sentCount++;
          console.log("EMAIL_OFFLINE_SENT", {
            duration: `${duration.toFixed(2)}ms`,
            recipient: recipientId,
            messagesCount: totalMessages,
            conversationsCount: conversations.length,
            template: "offline-messages",
            provider: "brevo",
            notification_type: "offline-messages",
            status: "sent",
            retry_count: 0, // Brevo retry handled internally
          });
        } else {
          console.error("EMAIL_FAILED", {
            duration: `${duration.toFixed(2)}ms`,
            recipient: recipientId,
            template: "offline-messages",
            provider: "brevo",
            error: result.error,
            notification_type: "offline-messages",
            status: "failed",
            retry_count: 3,
          });
        }
      } catch (err: any) {
        console.error(`[chatNotificationService] Error processing offline email for ${recipientId}:`, err);
        Sentry.captureException(err);
      }
    }

    return { processed: expiredUsers.length, sent: sentCount };
  } finally {
    // Release processing lock
    await pubClient.del(CRON_LOCK_KEY);
  }
}
