import { pubClient } from "../socket/redis";
import { 
  NotificationType, 
} from "@kovari/types";
import { createNotification } from "@/lib/notifications/createNotification";

/**
 * Buffers notifications to avoid spamming the user with multiple alerts
 */
export async function bufferNotification(
  userId: string,
  chatId: string,
  senderName: string,
  senderAvatar: string,
  messagePreview: string,
  senderId: string
) {
  const bufferKey = `chat:notify:buffer:${userId}:${chatId}`;
  const timerKey = `chat:notify:timer:${userId}:${chatId}`;

  try {
    // Add message to buffer
    await pubClient.rPush(bufferKey, messagePreview);
    
    // Check if timer is already running
    const timerExists = await pubClient.get(timerKey);
    if (timerExists) return;

    // Start timer (10 seconds)
    await pubClient.set(timerKey, "true", { EX: 15 }); // 15s safety expiry

    setTimeout(async () => {
      try {
        await processBuffer(userId, chatId, senderName, senderAvatar, senderId);
      } catch (err) {
        console.error("[Batching] Error in setTimeout processBuffer:", err);
      }
    }, 10000);

  } catch (err) {
    console.error("[Batching] Error buffering notification:", err);
  }
}

async function processBuffer(userId: string, chatId: string, senderName: string, senderAvatar: string, senderId: string) {
  const bufferKey = `chat:notify:buffer:${userId}:${chatId}`;
  const timerKey = `chat:notify:timer:${userId}:${chatId}`;

  // Get and clear buffer atomically
  const messages = await pubClient.lRange(bufferKey, 0, -1);
  if (!messages || messages.length === 0) {
    await pubClient.del(timerKey);
    return;
  }

  // Clear buffer and timer
  await pubClient.del(bufferKey);
  await pubClient.del(timerKey);

  console.log(`[Batching] Processing buffer for user: ${userId}, chat: ${chatId}. Messages: ${messages.length}, senderName: ${senderName}, senderId: ${senderId}`);

  const count = messages.length;
  // 🔒 E2EE Privacy: never include sender name or message content in push payloads.
  // The notification tray is not an E2EE channel.
  const title = count > 1 ? `${count} new messages` : "New message";
  const body = "Open Kovari to view message";

  // For direct chats, chatId is "uuid1_uuid2" which is NOT a valid PostgreSQL UUID.
  // Use senderId (a real UUID) so the notifications.entity_id column accepts it.
  // The notification link becomes /chat/<senderId> which routes to the sender's chat.
  // For group chats, chatId IS a plain UUID so we can use it directly.
  const isDirectChat = chatId.includes("_");
  const entityId = isDirectChat ? senderId : chatId;

  // 1. Create DB Notification (This now automatically handles push evaluation and priority)
  const result = await createNotification({
    userId,
    type: NotificationType.NEW_MESSAGE,
    title,
    message: body,
    entityType: "chat",
    entityId,
    imageUrl: senderAvatar || undefined,
    data: {
      chat_type: isDirectChat ? "direct" : "group",
    },
  });

  if (!result.success) {
    console.error("[Batching] Error creating notification:", result.error);
  }
}

