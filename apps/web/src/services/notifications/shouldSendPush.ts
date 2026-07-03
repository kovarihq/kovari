import { 
  NotificationPriority, 
  NotificationPriorityMap, 
  NotificationType, 
  EntityType 
} from "@kovari/types";
import { pubClient, connectRedis } from "../socket/redis";
import { createAdminSupabaseClient, isActiveBan } from "@kovari/api";

interface ShouldSendPushParams {
  userId: string;       // Clerk ID
  type: NotificationType;
  entityId?: string | null;
  entityType?: EntityType;
}

/**
 * Room-aware push suppression engine.
 *
 * Decision tree:
 *   LOW priority            → suppress always
 *   User offline            → send
 *   User online + in chat   → suppress (already looking at the conversation)
 *   User online + elsewhere → send    (user won't see the message otherwise)
 *   Match/request online    → suppress (real-time socket event already fired)
 */
export async function shouldSendPush({
  userId,
  type,
  entityId,
  entityType,
}: ShouldSendPushParams): Promise<boolean> {
  await connectRedis();

  const supabase = createAdminSupabaseClient();
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  const { data: userRow } = uuidRegex.test(userId)
    ? await supabase.from("users").select("banned, ban_expires_at").eq("id", userId).maybeSingle()
    : await supabase.from("users").select("banned, ban_expires_at").eq("clerk_user_id", userId).maybeSingle();

  if (userRow && isActiveBan(userRow)) {
    return false;
  }

  const priority = NotificationPriorityMap[type] || NotificationPriority.LOW;

  // 1. Low priority — never push regardless of presence
  if (priority === NotificationPriority.LOW) return false;

  // 2. Check online presence
  const userSocketsKey = `user_socket:${userId}`;
  const isOnlineCount = await pubClient.sCard(userSocketsKey);
  const isOnline = isOnlineCount > 0;

  if (!isOnline) {
    // User is fully offline → eligible for push (proceed to priority check below)
  } else {
    // User is online. Apply room-aware suppression for chat/group messages.
    if ((entityType === "chat" || entityType === "group") && entityId) {
      const activeChatsKey = `user_chats:${userId}`;
      const isViewingTargetRoom = await pubClient.sIsMember(activeChatsKey, entityId);

      if (isViewingTargetRoom) {
        // User is actively looking at this exact conversation — suppress push.
        // The socket layer already delivered a real-time `receive_message` event.
        return false;
      }

      // User is online but NOT in this room (e.g. on Explore, Groups, Profile).
      // Fall through → send push so they see the unread indicator.
    } else {
      // For match / request / system notifications: the socket layer already
      // fired a `new_notification` event in real-time. Suppress FCM to avoid
      // double-alerting (one in-app banner + one system notification).
      return false;
    }
  }

  // 3. HIGH priority — always eligible if we reached here
  if (priority === NotificationPriority.HIGH) return true;

  // 4. MEDIUM priority — apply entity-specific rules
  if (priority === NotificationPriority.MEDIUM) {
    // Group join requests: only notify group admins
    if (
      type === NotificationType.GROUP_JOIN_REQUEST_RECEIVED &&
      entityType === "group" &&
      entityId
    ) {
      return isUserGroupAdmin(userId, entityId);
    }

    // Default: send for medium priority
    return true;
  }

  return false;
}

/**
 * Checks if a Clerk user is an admin of a group (used for GROUP_JOIN_REQUEST_RECEIVED).
 */
async function isUserGroupAdmin(clerkId: string, groupId: string): Promise<boolean> {
  const supabase = createAdminSupabaseClient();

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_user_id", clerkId)
    .single();

  if (!user) return false;

  const { data: membership } = await supabase
    .from("group_memberships")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();

  return membership?.role === "admin" || membership?.role === "owner";
}
