import { useEffect, useState, useRef, useCallback } from "react";
import { hydrateMessageContent } from "@/services/messaging/messageHydrator";
import { MESSAGE_MIGRATION_VERSION } from "@kovari/types";
import { useUser } from "@clerk/nextjs";
import { getSocket } from "@/lib/socket";

export interface Conversation {
  userId: string; // Supabase UUID
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  lastMediaType?: "image" | "video" | "init";
}

interface UseDirectInboxResult {
  conversations: Conversation[];
  loading: boolean;
  markConversationRead: (userId: string) => void;
}

export const useDirectInbox = (
  currentUserUuid: string,
  activeConversationUserId?: string,
): UseDirectInboxResult => {
  const { user } = useUser();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Dedup set — tracks socket message IDs we've already counted to prevent double-increments
  const processedMsgIds = useRef<Set<string>>(new Set());
  // Ref to track active conversation so socket handler always has the latest value
  const activeConvRef = useRef<string | undefined>(activeConversationUserId);
  useEffect(() => {
    activeConvRef.current = activeConversationUserId;
  }, [activeConversationUserId]);

  // ─── Mark conversation as read ──────────────────────────────────────────────
  const markConversationRead = useCallback((userId: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.userId === userId ? { ...c, unreadCount: 0 } : c)),
    );
  }, []);

  // ─── Auto-mark active conversation as read whenever it changes ───────────────
  useEffect(() => {
    if (activeConversationUserId) {
      markConversationRead(activeConversationUserId);
    }
  }, [activeConversationUserId, markConversationRead]);

  // ─── Socket: listen for real-time incoming messages ──────────────────────────
  useEffect(() => {
    if (!user?.id || !currentUserUuid) return;

    const socket = getSocket(user.id);
    if (!socket.connected) socket.connect();

    const handleReceiveMessage = (incomingMsg: any) => {
      // Deduplicate by message ID so re-renders don't double-count
      const msgId = incomingMsg.id || incomingMsg.tempId || incomingMsg.client_id;
      if (msgId) {
        if (processedMsgIds.current.has(msgId)) return;
        processedMsgIds.current.add(msgId);
      }

      const senderId = incomingMsg.senderId || incomingMsg.sender_id;
      const receiverId = incomingMsg.receiverId || incomingMsg.receiver_id;
      if (!senderId || !receiverId) return;

      // senderId from socket payload is the Supabase UUID (set by server after middleware resolution)
      const isMe = senderId === currentUserUuid;
      const partnerId = isMe ? receiverId : senderId;

      const hydration = hydrateMessageContent(
        {
          message_content: incomingMsg.text ?? incomingMsg.message_content ?? incomingMsg.plain_content,
          migration_version: incomingMsg.migration_version ?? incomingMsg.migrationVersion,
        }
      );

      let messageText = hydration.content || "[Empty message]";

      // Emit delivery ack for messages from others
      if (!isMe && msgId) {
        const chatId =
          currentUserUuid < partnerId
            ? `${currentUserUuid}_${partnerId}`
            : `${partnerId}_${currentUserUuid}`;
        socket.emit("message_delivered", { chatId, messageId: msgId });
      }

      const mediaType =
        incomingMsg.mediaType || incomingMsg.media_type || undefined;
      const createdAt =
        incomingMsg.createdAt ||
        incomingMsg.created_at ||
        new Date().toISOString();

      setConversations((prev) => {
        const isActiveChat = activeConvRef.current === partnerId;
        // Increment unread only if this is an incoming message and user is NOT in that chat
        const shouldIncrement = !isMe && !isActiveChat;

        const exists = prev.some((c) => c.userId === partnerId);

        if (exists) {
          return prev
            .map((c) => {
              if (c.userId !== partnerId) return c;
              if (new Date(createdAt) < new Date(c.lastMessageAt)) return c;
              return {
                ...c,
                lastMessage: messageText,
                lastMessageAt: createdAt,
                lastMediaType: mediaType,
                unreadCount: shouldIncrement ? c.unreadCount + 1 : c.unreadCount,
              };
            })
            .sort(
              (a, b) =>
                new Date(b.lastMessageAt).getTime() -
                new Date(a.lastMessageAt).getTime(),
            );
        }

        // New conversation not yet in list — add it at the top
        const newConv: Conversation = {
          userId: partnerId,
          lastMessage: messageText,
          lastMessageAt: createdAt,
          unreadCount: shouldIncrement ? 1 : 0,
          lastMediaType: mediaType,
        };
        return [newConv, ...prev];
      });
    };

    socket.on("receive_message", handleReceiveMessage);
    return () => {
      socket.off("receive_message", handleReceiveMessage);
    };
  }, [user?.id, currentUserUuid]);

  // ─── Fetch inbox from DB (source of truth for initial unread counts) ─────────
  const fetchInbox = useCallback(async () => {
    if (!currentUserUuid) return;

    try {
      const response = await fetch("/api/direct-chat/inbox", {
        method: "GET",
        credentials: "include",
      });
      if (!response.ok) {
        setConversations([]);
        return;
      }
      const payload = await response.json();
      const data: any[] = Array.isArray(payload?.messages) ? payload.messages : [];

      const map = new Map<string, Conversation>();
      const latestMsgAt: Record<string, string> = {};
      const unreadCountMap: Record<string, number> = {};

      data.forEach((msg: any) => {
        const partnerId =
          msg.sender_id === currentUserUuid ? msg.receiver_id : msg.sender_id;
        if (!partnerId) return;

        // Count DB-confirmed unread messages (receiver is me, not yet marked read)
        if (msg.receiver_id === currentUserUuid && !msg.read_at) {
          unreadCountMap[partnerId] = (unreadCountMap[partnerId] || 0) + 1;
        }

        // Track latest message per partner for inbox preview
        if (!latestMsgAt[partnerId] || msg.created_at > latestMsgAt[partnerId]) {
          latestMsgAt[partnerId] = msg.created_at;
          let lastMessage = "";
          let lastMediaType: "image" | "video" | "init" | undefined = undefined;

          if (msg.media_url && msg.media_type) {
            lastMessage = "";
            lastMediaType = msg.media_type;
          } else {
            const hydration = hydrateMessageContent(
              {
                message_content: msg.message_content,
                migration_version: msg.migration_version,
              }
            );
            lastMessage = hydration.content || "[Empty message]";
          }

          map.set(partnerId, {
            userId: partnerId,
            lastMessage,
            lastMessageAt: msg.created_at,
            unreadCount: unreadCountMap[partnerId] || 0,
            lastMediaType,
          });
        }
      });

      // Second pass: apply final unread counts (previous pass may have been incomplete)
      map.forEach((conv, partnerId) => {
        map.set(partnerId, {
          ...conv,
          unreadCount: unreadCountMap[partnerId] || 0,
        });
      });

      const freshConversations = Array.from(map.values()).sort(
        (a, b) =>
          new Date(b.lastMessageAt).getTime() -
          new Date(a.lastMessageAt).getTime(),
      );

      setConversations((prev) => {
        // Merge: preserve any in-flight unread increments from socket state that
        // arrived since the last fetch, taking the MAX to avoid going backwards
        if (prev.length === 0) return freshConversations;
        return freshConversations.map((fresh) => {
          const existing = prev.find((p) => p.userId === fresh.userId);
          if (!existing) return fresh;
          return {
            ...fresh,
            // Keep the higher count: DB may lag behind socket real-time increments
            unreadCount: Math.max(fresh.unreadCount, existing.unreadCount),
          };
        });
      });
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [currentUserUuid, user?.id]);

  useEffect(() => {
    if (!currentUserUuid) {
      setConversations([]);
      setLoading(true);
      return;
    }
    setLoading(true);
    fetchInbox();
    // Poll every 30s instead of 8s — real-time is handled by socket
    const interval = window.setInterval(fetchInbox, 30_000);
    return () => window.clearInterval(interval);
  }, [currentUserUuid, fetchInbox]);

  if (!currentUserUuid) {
    return {
      conversations: [],
      loading: true,
      markConversationRead: () => {},
    };
  }

  return { conversations, loading, markConversationRead };
};

