import { Server, Socket } from "socket.io";
import {
  InterServerEvents,
  SocketData,
  ClientToServerEvents,
  ServerToClientEvents,
} from "@kovari/types";
import { pubClient } from "./redis";
import { createAdminSupabaseClient } from "@kovari/api";
import { PresenceManager } from "./presence";
import { RateLimiter } from "./rateLimiter";
import { bufferNotification } from "../notifications/batching";
import {
  presenceKeyForSupabaseUserId,
  resolveSupabaseUserIdFromAuthId,
} from "./resolveSocketUser";

import { sequenceManager } from "./sequences";

export const registerSocketEvents = (
  io: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >,
  socket: Socket<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >,
) => {
  const userId = socket.data.userId;

  socket.on("join_chat", async ({ chatId }) => {
    const supabaseId = socket.data.supabaseId || null;
    
    // SECURITY: Authorize room join to prevent users from listening to other users' private chats
    let isAuthorized = false;
    
    try {
      if (chatId.includes("_")) {
        // Direct chat format: {idA}_{idB}
        const [id1, id2] = chatId.split("_");
        
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (UUID_REGEX.test(id1) && UUID_REGEX.test(id2) && supabaseId && (supabaseId === id1 || supabaseId === id2)) {
          const partnerId = supabaseId === id1 ? id2 : id1;
          const supabase = createAdminSupabaseClient();
          
          // 1. Check if they have an active message history
          const { data } = await supabase
            .from("direct_messages")
            .select("id")
            .or(`and(sender_id.eq.${supabaseId},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${supabaseId})`)
            .limit(1)
            .maybeSingle();
            
          if (data) {
            isAuthorized = true;
          } else {
            // 2. Check if they are matched (allowed to start a chat)
            const { data: matchData } = await supabase
              .from("matches")
              .select("id")
              .or(`and(user_a_id.eq.${supabaseId},user_b_id.eq.${partnerId}),and(user_a_id.eq.${partnerId},user_b_id.eq.${supabaseId})`)
              .eq("status", "active")
              .limit(1)
              .maybeSingle();
              
            if (matchData) isAuthorized = true;
          }

          // 3. Strict block validation: prevent connection if either user has blocked the other
          if (isAuthorized) {
            const { data: blockRow } = await supabase
              .from("blocked_users")
              .select("id")
              .or(`and(blocker_id.eq.${supabaseId},blocked_id.eq.${partnerId}),and(blocker_id.eq.${partnerId},blocked_id.eq.${supabaseId})`)
              .limit(1)
              .maybeSingle();

            if (blockRow) {
              console.warn(`[Socket Auth] Blocked connection attempt between ${supabaseId} and ${partnerId}`);
              isAuthorized = false;
            }
          }
        }
      } else {
        // Group chat: check membership or creator status in DB
        if (supabaseId) {
          const supabase = createAdminSupabaseClient();
          const { data: membership } = await supabase
            .from("group_memberships")
            .select("id")
            .eq("group_id", chatId)
            .eq("user_id", supabaseId)
            .maybeSingle();
          
          if (membership) {
            isAuthorized = true;
          } else {
            // Check if the user is the creator of the group
            const { data: group } = await supabase
              .from("groups")
              .select("id")
              .eq("id", chatId)
              .eq("creator_id", supabaseId)
              .maybeSingle();
            if (group) isAuthorized = true;
          }
        }
      }
    } catch (err) {
      console.warn(`[Socket Auth] Room auth error for user ${userId}, chat ${chatId}:`, err);
    }

    if (!isAuthorized) {
      console.warn(`[Socket Auth] User ${userId} unauthorized to join chat ${chatId}`);
      socket.emit("error", { message: "Unauthorized to join this chat" });
      return;
    }

    socket.join(chatId);
    console.log(`[Socket] User ${userId} joined chat ${chatId}`);
    PresenceManager.userJoinedChat(userId, chatId, (cId, uId) => {
      socket.to(cId).emit("user_online", { chatId: cId, userId: uId, supabaseId });
    });
  });

  socket.on("leave_chat", ({ chatId }) => {
    socket.leave(chatId);
    console.log(`[Socket] User ${userId} left chat ${chatId}`);
    PresenceManager.userLeftChat(userId, chatId);
  });

  socket.on("send_message", async ({ chatId, message }, callback) => {
    // Level 0: Basic spam protection
    const isAllowed = await RateLimiter.checkRateLimit(userId, 15, 5); // Max 15 messages per 5s
    if (!isAllowed) {
      if (callback)
        callback({ status: "error", error: "Rate limit exceeded globally" });
      return;
    }

    try {
      console.log(`[Socket] Message sent to ${chatId} by ${userId}`);

      const isDirectChat = chatId.includes("_");
      const supabaseId = socket.data.supabaseId;

      if (isDirectChat && supabaseId) {
        const [id1, id2] = chatId.split("_");
        const partnerId = supabaseId === id1 ? id2 : id1;
        const supabase = createAdminSupabaseClient();

        // Validate that neither user has blocked the other before broadcasting or saving
        const { data: blockRow } = await supabase
          .from("blocked_users")
          .select("id")
          .or(`and(blocker_id.eq.${supabaseId},blocked_id.eq.${partnerId}),and(blocker_id.eq.${partnerId},blocked_id.eq.${supabaseId})`)
          .limit(1)
          .maybeSingle();

        if (blockRow) {
          console.warn(`[Socket Message] Rejected send_message from blocked user: ${supabaseId} to ${partnerId}`);
          if (callback) {
            callback({ status: "error", error: "You cannot message this user" });
          }
          return;
        }
      }

      // 1. Persist message to DB first to generate database sequence values
      const persistedMessage = await persistMessageToDb(
        chatId,
        message,
        userId,
      );

      const conversationSequence = persistedMessage.conversation_sequence;
      const serverSequence = persistedMessage.global_sequence;

      // 2. Override avatar with the Supabase profile_photo cached at connection time
      // FINDING-1 FIX: Inject senderClerkId so receivers can derive the correct E2EE shared secret
      // FINDING-2 FIX: Inject chatId explicitly so the payload is self-describing for all consumers
      const enrichedMessage = {
        ...message,
        id: persistedMessage.id,
        chatId,
        avatar: (socket.data as any).profilePhoto || message.avatar,
        senderClerkId: userId, // userId is the verified Clerk ID on this socket
        senderId: socket.data.supabaseId, // Inject Supabase UUID so clients can map sender names/profiles
        senderName: (socket.data as any).fullName || message.senderName || "Unknown User",
        senderUsername: (socket.data as any).username || message.senderUsername,
        conversationSequence,
        serverSequence,
        createdAt: persistedMessage.created_at || new Date().toISOString(),
      };

      // 3. Immediately broadcast to all users in the room
      io.to(chatId).emit("receive_message", enrichedMessage);

      // 4. Return ACK containing the generated sequence values to the sender
      if (callback) {
        callback({
          status: "sent",
          messageId: persistedMessage.id,
          conversationSequence,
          serverSequence,
        });
      }

      // Level 2: PERSISTENCE ACK
      io.to(chatId).emit("message_persisted", {
        tempId: message.tempId || message.id || "",
        messageId: persistedMessage.id,
        chatId,
        conversationSequence,
        serverSequence,
      });

      // ========== PHASE 4: NOTIFICATIONS ==========
      const senderName = (socket.data as any).fullName || "Someone";
      const senderAvatar = (socket.data as any).profilePhoto || null;

      if (isDirectChat) {
        // Direct Chat: Recipient is message.receiverId (Supabase users.id)
        const recipientId = message.receiverId;
        if (recipientId) {
          const notifyTargetId =
            await presenceKeyForSupabaseUserId(recipientId);
          await handleNotificationForUser(
            io,
            notifyTargetId,
            chatId,
            senderName,
            senderAvatar,
            message.text || "Sent a message",
          );
        }
      } else {
        // Group Chat: Get all members except sender
        const supabase = createAdminSupabaseClient();
        const { data: members } = await supabase
          .from("group_memberships")
          .select("user_id")
          .eq("group_id", chatId)
          .eq("status", "accepted")
          .neq("user_id", socket.data.supabaseId); // Use Supabase ID for DB lookup

        if (members) {
          for (const member of members) {
            // Need to map Supabase UUID back to Clerk ID for socket/presence checks
            const { data: userRow } = await supabase
              .from("users")
              .select("clerk_user_id")
              .eq("id", member.user_id)
              .single();

            if (userRow?.clerk_user_id) {
              await handleNotificationForUser(
                io,
                userRow.clerk_user_id,
                chatId,
                senderName,
                senderAvatar,
                message.text || "Sent a message to the group",
              );
            }
          }
        }
      }
    } catch (error) {
      console.error(
        "[Socket] Failed to send/persist message or send notification:",
        error,
      );
    }
  });

  /**
   * Helper to handle notification logic for a single user
   */
  async function handleNotificationForUser(
    io: Server,
    targetClerkUserId: string,
    chatId: string,
    senderName: string,
    senderAvatar: string | null,
    text: string,
  ) {
    // 1. Check if user is in the active chat room
    const targetSockets = io.sockets.adapter.rooms.get(chatId);
    const userSocketsKey = `user_socket:${targetClerkUserId}`;
    const userSocketIds = await pubClient.sMembers(userSocketsKey);

    let isUserInChat = false;
    if (targetSockets && userSocketIds) {
      for (const sId of userSocketIds) {
        if (targetSockets.has(sId)) {
          isUserInChat = true;
          break;
        }
      }
    }

    if (isUserInChat) {
      // User is already looking at the chat, no notification needed
      return;
    }

    // 2. User is NOT in chat. Trigger real-time socket notification if online
    const isOnline = userSocketIds && userSocketIds.length > 0;

    if (isOnline) {
      // Emit to user's private room
      io.to(`user_socket:${targetClerkUserId}`).emit("new_notification", {
        type: "NEW_MESSAGE",
        title: `New message`,
        message: text || `New message from ${senderName}`,
        chatId,
        image_url: senderAvatar, // Include avatar for UI
        created_at: new Date().toISOString(),
      });

      // Also emit unread count update if we want to be fancy
      // io.to(`user_socket:${targetClerkUserId}`).emit("unread_update", { chatId });
    }

    // 3. Trigger Batching/Push for offline OR not-in-chat users
    // (Requirement 3: trigger push if offline, Requirement 4: buffer if not in chat)
    const senderSupabaseId = socket.data.supabaseId || "";
    await bufferNotification(
      targetClerkUserId,
      chatId,
      senderName,
      senderAvatar || "",
      text,
      senderSupabaseId,
    );
  }

  // ========== ADVANCED UX EVENTS ==========

  socket.on("typing_start", ({ chatId }) => {
    socket.to(chatId).emit("user_typing", { chatId, userId });
  });

  socket.on("typing_stop", ({ chatId }) => {
    socket.to(chatId).emit("user_stopped_typing", { chatId, userId });
  });

  socket.on("message_delivered", async ({ chatId, messageId }) => {
    // FINDING-4 FIX: Include conversationSequence so mobile can advance the delivered watermark.
    // Look up the sequence from DB — use a non-throwing path to avoid breaking the ack on errors.
    let conversationSequence: number | undefined;
    try {
      const supabase = createAdminSupabaseClient();
      const isDirectChat = chatId.includes("_");
      const table = isDirectChat ? "direct_messages" : "group_messages";
      const { data: row } = await supabase
        .from(table)
        .select("conversation_sequence")
        .eq("id", messageId)
        .maybeSingle();
      if (row?.conversation_sequence != null) {
        conversationSequence = row.conversation_sequence;
      }
    } catch (_) {
      // Non-fatal: ack still relayed without sequence
    }
    // Relay to sender immediately
    socket
      .to(chatId)
      .emit("message_delivered_ack", { chatId, messageId, userId, conversationSequence });
  });

  socket.on("mark_seen", async ({ chatId, messageIds, lastSeenSequence }) => {
    try {
      const supabase = createAdminSupabaseClient();
      const isDirectChat = chatId.includes("_");
      const supabaseId = socket.data.supabaseId;

      const table = isDirectChat ? "direct_messages" : "group_messages";

      // FINDING-5 FIX: Resolve lastSeenSequence if not provided by client.
      // We need this to advance the delivered/seen watermarks on all mobile clients.
      let resolvedLastSeenSequence = lastSeenSequence;
      if (resolvedLastSeenSequence == null && messageIds.length > 0) {
        try {
          const { data: seqRow } = await supabase
            .from(table)
            .select("conversation_sequence")
            .in("id", messageIds)
            .order("conversation_sequence", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (seqRow?.conversation_sequence != null) {
            resolvedLastSeenSequence = seqRow.conversation_sequence;
          }
        } catch (_) {
          // Non-fatal: watermark ommitted from this ack
        }
      }

      if (messageIds.length > 0) {
        if (isDirectChat) {
          await supabase
            .from(table)
            .update({ read_at: new Date().toISOString() })
            .in("id", messageIds)
            .is("read_at", null);
        } else if (supabaseId) {
          // Group chat: track per-user, per-message progress in Redis for accurate "all members seen" status
          const countKey = `group_member_count:${chatId}`;
          const cachedCount = await pubClient.get(countKey);
          let memberCount = cachedCount ? parseInt(cachedCount) : 0;

          if (!memberCount) {
            const { count } = await supabase
              .from("group_memberships")
              .select("*", { count: "exact", head: true })
              .eq("group_id", chatId)
              .eq("status", "accepted");
            memberCount = count || 0;
            await pubClient.set(countKey, memberCount.toString(), { EX: 300 });
          }

          // Mark each message as seen by THIS user in Redis Sets
          for (const msgId of messageIds) {
            const setKey = `group_msg_seen:${chatId}:${msgId}`;
            await pubClient.sAdd(setKey, supabaseId);

            // Check if all members (excluding sender) have now seen it
            const seenCount = await pubClient.sCard(setKey);
            if (seenCount >= memberCount - 1 && memberCount > 1) {
              // BLUE TICK TRIGGER: Emit to the room that this message is now fully seen
              io.to(chatId).emit("messages_seen", {
                chatId,
                messageIds: [msgId],
                userId,
                isFullySeen: true, // This flag triggers the blue check in the UI
                lastSeenSequence: resolvedLastSeenSequence,
              });
              // Once fully seen, we can optionally cleanup the set (after a short delay or now)
              await pubClient.expire(setKey, 3600); // Keep for an hour just in case of race conditions
            }
          }
        }
      }

      // Individual feedback (grey ticks still, but tells sender SOMEONE saw it)
      socket.to(chatId).emit("messages_seen", { chatId, messageIds, userId, lastSeenSequence: resolvedLastSeenSequence });
    } catch (error) {
      console.error("[Socket] Failed to mark messages seen:", error);
    }
  });

  socket.on("get_last_seen", async ({ userId: targetUserId }, callback) => {
    try {
      const presenceKey = await presenceKeyForSupabaseUserId(targetUserId);
      const lastSeen = await PresenceManager.getLastSeen(presenceKey);
      callback(lastSeen);
    } catch (e) {
      console.error("[Socket] Failed to get last seen:", e);
      callback(null);
    }
  });

  socket.on(
    "request_gap_fill",
    async ({ chatId, fromSequence, toSequence }, callback) => {
      console.log(
        `[Socket] User ${userId} requested gap fill for ${chatId} from ${fromSequence} to ${toSequence}`,
      );

      // Rate limit check: Max 10 requests per 10s
      const isAllowed = await RateLimiter.checkRateLimit(userId, 10, 10);
      if (!isAllowed) {
        if (callback) callback({ status: "RATE_LIMIT_EXCEEDED" });
        return;
      }

      if (toSequence - fromSequence > 500) {
        if (callback) callback({ status: "GAP_TOO_LARGE" });
        return;
      }

      try {
        const supabase = createAdminSupabaseClient();
        const isDirectChat = chatId.includes("_");

        let messages: any[] = [];
        if (isDirectChat) {
          const supabaseId = socket.data.supabaseId;
          if (supabaseId) {
            const [id1, id2] = chatId.split("_");
            const partnerId = supabaseId === id1 ? id2 : id1;
            const userA = supabaseId < partnerId ? supabaseId : partnerId;
            const userB = supabaseId < partnerId ? partnerId : supabaseId;

            const { data: conv } = await supabase
              .from("conversations")
              .select("id")
              .eq("user_a_id", userA)
              .eq("user_b_id", userB)
              .maybeSingle();

            if (conv) {
              const { data, error } = await supabase
                .from("direct_messages")
                .select("*")
                .eq("conversation_id", conv.id)
                .gte("conversation_sequence", fromSequence)
                .lte("conversation_sequence", toSequence)
                .order("conversation_sequence", { ascending: true });

              if (error) throw error;
              messages = data || [];
            }
          }
        } else {
          const { data, error } = await supabase
            .from("group_messages")
            .select("*")
            .eq("group_id", chatId)
            .gte("conversation_sequence", fromSequence)
            .lte("conversation_sequence", toSequence)
            .order("conversation_sequence", { ascending: true });

          if (error) throw error;
          messages = data || [];
        }

        if (callback) {
          callback({
            status: "success",
            // FINDING-6 FIX: Include full E2EE fields so gap-recovered messages can be decrypted.
            messages: messages.map((m: any) => ({
              id: m.id,
              senderId: m.sender_id || m.user_id,
              // text is kept for backward compat, but clients should use encryptedContent for decryption
              text: m.encrypted_content || "",
              encryptedContent: m.encrypted_content || null,
              iv: m.encryption_iv || null,
              salt: m.encryption_salt || null,
              isEncrypted: m.is_encrypted ?? false,
              mediaUrl: m.media_url || null,
              mediaType: m.media_type || null,
              conversationSequence: m.conversation_sequence,
              serverSequence: m.global_sequence,
              createdAt: m.created_at,
            })),
          });
        }
      } catch (err) {
        console.error("[Socket] request_gap_fill failed:", err);
        if (callback) callback({ status: "error", error: String(err) });
      }
    },
  );
};

/**
 * Persists message to DB
 * This uses the admin client securely on the server-side logic since the socket has already verified the Clerk user ID.
 * It's generalized for both group and direct chat.
 */
async function persistMessageToDb(
  chatId: string,
  message: any,
  socketAuthUserId: string,
) {
  const supabase = createAdminSupabaseClient();

  const userUuid = await resolveSupabaseUserIdFromAuthId(socketAuthUserId);
  if (!userUuid) throw new Error("User not found: " + socketAuthUserId);

  // Determine if group chat or direct chat
  const isDirectChat = chatId.includes("_");

  if (isDirectChat) {
    const [id1, id2] = chatId.split("_");
    const partnerId = message.receiverId;
    const userA = userUuid < partnerId ? userUuid : partnerId;
    const userB = userUuid < partnerId ? partnerId : userUuid;

    // Find or create conversation
    let { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("user_a_id", userA)
      .eq("user_b_id", userB)
      .maybeSingle();

    if (!conv) {
      const { data: newConv, error: newConvError } = await supabase
        .from("conversations")
        .insert({ user_a_id: userA, user_b_id: userB })
        .select("id")
        .single();
      if (newConvError) {
        console.error("[Socket DB Persist] Failed to create conversation:", newConvError);
        throw newConvError;
      }
      conv = newConv;
    }

    const { data, error } = await supabase
      .from("direct_messages")
      .insert({
        conversation_id: conv.id,
        sender_id: userUuid,
        receiver_id: message.receiverId,
        encrypted_content: message.encryptedContent || null,
        encryption_iv: message.iv || null,
        encryption_salt: message.salt || null,
        media_url: message.mediaUrl || null,
        media_type: message.mediaType || null,
        client_id: message.tempId || null,
        is_encrypted: message.isEncrypted || false,
      })
      .select("*")
      .single();

    if (error) {
      console.error("[Socket DB Persist] Direct message error:", error);
      throw error;
    }
    return data;
  } else {
    // It's a group chat, the chatId is the groupId
    const { data, error } = await supabase
      .from("group_messages")
      .insert({
        group_id: chatId,
        user_id: userUuid,
        encrypted_content: message.encryptedContent || null,
        encryption_iv: message.iv || null,
        encryption_salt: message.salt || null,
        media_url: message.mediaUrl || null,
        media_type: message.mediaType || null,
        is_encrypted: message.isEncrypted ?? true,
      })
      .select("*")
      .single();

    if (error) {
      console.error("[Socket] Failed to persist group message:", error);
      throw error;
    }
    return data;
  }
}
