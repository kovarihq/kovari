import { getUserUuidByClerkId , getGroupChatId } from "@kovari/api/client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { getSocket } from "@/lib/socket";
import { buildOutgoingMessage } from "@kovari/types";
import { useGroupEncryption } from "./useGroupEncryption";
import { hydrateMessageContent } from "@/services/messaging/messageHydrator";

export interface ChatMessage {
  id: string;
  tempId?: string;
  content: string;
  timestamp: string;
  sender: string;
  senderUsername?: string;
  senderId?: string;
  avatar?: string;
  isCurrentUser: boolean;
  createdAt: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  status?: "sending" | "sent" | "delivered" | "seen";
  isEncrypted?: boolean;
  encryptionIv?: string;
  encryptionSalt?: string;
}

export interface GroupInfo {
  id: string;
  name: string;
  destination?: string;
  description?: string;
  members_count?: number;
  cover_image?: string;
  status?: "active" | "pending" | "removed";
}

export const useGroupChat = (groupId: string) => {
  const { user } = useUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const cursorRef = useRef<string | null>(null);

  // Keep ref in sync with state for fetchMessages
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  const [groupInfo, setGroupInfo] = useState<GroupInfo | null>(null);
  const [currentUserUuid, setCurrentUserUuid] = useState<string>("");

  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Online member tracking (Supabase UUIDs)
  const [onlineMembers, setOnlineMembers] = useState<Set<string>>(new Set());
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | undefined>(undefined);

  const chatId = (groupId);

  // Resolve current user UUID and Supabase profile photo
  useEffect(() => {
    if (user?.id) {
      getUserUuidByClerkId (user.id).then((uuid) => {
        setCurrentUserUuid(uuid || "");
        if (uuid) {
          // Fetch Supabase profile_photo (not Clerk imageUrl)
          fetch(`/api/groups/${groupId}/members`)
            .then((r) => r.json())
            .then((members: any[]) => {
              const me = members.find((m: any) => m.userId === uuid || m.user_id === uuid);
              if (me?.avatar) setCurrentUserAvatar(me.avatar);
            })
            .catch(() => {});
        }
      });
    }
  }, [user?.id, groupId]);

  const {
    encryptMessage,
    isEncryptionAvailable,
  } = useGroupEncryption(groupId);

  const seenIdsRef = useRef(new Set<string>());
  // Gap detection: track the highest conversation sequence seen
  const lastKnownSequenceRef = useRef<number>(0);
  // Typing throttle: only emit typing_start once per 3s window
  const lastTypingEmitRef = useRef<number>(0);


  // Fetch initial messages
  const fetchMessages = useCallback(async (loadMore = false) => {
    if (!user) return;

    if (loadMore) {
      setLoadingMore(true);
    }

    try {
      if (!loadMore) {
        setLoading(true);
      }
      setError(null);

      const queryParams = new URLSearchParams({
        limit: "30",
      });
      if (loadMore && cursorRef.current) {
        queryParams.append("cursor", cursorRef.current);
      }

      const response = await fetch(`/api/groups/${groupId}/messages?${queryParams.toString()}`);
      if (!response.ok) {
        if (response.status === 403) throw new Error("Not a member of this group");
        if (response.status === 404) throw new Error("Group not found");
        throw new Error("Failed to fetch messages");
      }

      const data = await response.json();

      const mappedData = data.map((msg: any) => ({
        ...msg,
        isEncrypted: msg.isEncrypted ?? msg.is_encrypted,
        encryptedContent: msg.encryptedContent ?? msg.encrypted_content,
        encryptionIv: msg.encryptionIv ?? msg.encryption_iv,
        encryptionSalt: msg.encryptionSalt ?? msg.encryption_salt,
        mediaUrl: msg.mediaUrl ?? msg.media_url ?? undefined,
        mediaType: msg.mediaType ?? msg.media_type ?? undefined,
      }));

      const decryptedMessages = await Promise.all(
        mappedData.map(async (message: any) => {
          const hydration = hydrateMessageContent(
            {
              message_content: message.message_content,
              migration_version: message.migration_version,
            }
          );

          return {
            ...message,
            content: hydration.content || "[Empty message]",
            isEncrypted: false,
          };
        }),
      );

      setMessages((prev) => {
        // Build a map of existing messages for quick lookup
        const existingMessages = new Map(prev.map((m) => [m.id, m]));
        const existingTempMessages = new Map(
          prev.filter((m) => m.tempId).map((m) => [m.tempId!, m])
        );

        const mergedMessages = decryptedMessages.map((msg) => {
          const existing = existingMessages.get(msg.id) || existingTempMessages.get(msg.id);
          
          let status = msg.status;
          if (!status) {
             if (existing?.status) {
                status = existing.status;
             } else {
                status = msg.senderId === user?.id ? "sent" : "delivered";
             }
          }
          
          return { ...msg, status };
        });

        if (loadMore) {
          const newMessages = mergedMessages.filter(
            (msg) => !existingMessages.has(msg.id)
          );
          
          const combined = [...newMessages, ...prev];
          if (combined.length > 0) {
            setCursor(combined[0].createdAt || combined[0].timestamp);
          }
          return combined;
        } else {
          // Combine new messages with existing ones that are still in-flight or delivered but not yet seen in the DB list
          const pendingMessages = prev.filter(
            (m) =>
              m.tempId && // Is an optimistic message
              (m.status === "sending" || m.status === "sent" || m.status === "delivered") &&
              !decryptedMessages.some((dm) => dm.id === m.id || dm.id === m.tempId)
          );

          const combined = [...mergedMessages, ...pendingMessages];
          const sorted = combined.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          
          if (!cursorRef.current && sorted.length > 0) {
            setCursor(sorted[0].createdAt);
          }
          return sorted;
        }
      });
      
      setHasMoreMessages(data.length === 30);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch messages");
    } finally {
      if (loadMore) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  }, [groupId, user?.id]);

  // Load more messages function
  const loadMoreMessages = useCallback(async () => {
    if (loadingMore || !hasMoreMessages) return;
    await fetchMessages(true);
  }, [fetchMessages, loadingMore, hasMoreMessages]);

  // Fetch group information
  const fetchGroupInfo = useCallback(async () => {
    try {
      const response = await fetch(`/api/groups/${groupId}`);
      if (!response.ok) throw new Error("Failed to fetch group info");
      const data = await response.json();
      setGroupInfo(data);
    } catch (err) {
      console.error("Error fetching group info:", err);
    }
  }, [groupId]);

  const stopTyping = useCallback(() => {
    if (user?.id && chatId) {
      const socket = getSocket(user.id);
      if (socket.connected) socket.emit("typing_stop", { chatId });
    }
  }, [user?.id, chatId]);

  const sendTypingEvent = useCallback(() => {
    if (user?.id && chatId) {
      const socket = getSocket(user.id);
      if (socket.connected) {
        const now = Date.now();
        // Rate-limit typing_start to once per 3 seconds
        if (now - lastTypingEmitRef.current >= 3000) {
          socket.emit("typing_start", { chatId });
          lastTypingEmitRef.current = now;
        }
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        // Debounce typing_stop by 1.5s
        typingTimeoutRef.current = setTimeout(stopTyping, 1500);
      }
    }
  }, [user?.id, chatId, stopTyping]);

  // Send a message
  const sendMessage = useCallback(
    async (content: string, mediaUrl?: string, mediaType?: "image" | "video") => {
      if (!user || (!content.trim() && !mediaUrl)) return;

      try {
        setSending(true);
        setError(null);

        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        stopTyping();

        // build the outgoing message using buildOutgoingMessage
        // In plaintext mode sharedSecret is ignored; groupKey is passed through
        // for legacy/dual fallback if the mode is ever reverted.
        const outgoing = await buildOutgoingMessage(
          { text: content.trim(), mediaUrl, mediaType }
        );

        // Socket.IO optimistic send
        if (user?.id && chatId) {
          const socket = getSocket(user.id);
          if (socket.connected) {
            const tempId = crypto.randomUUID();

            const incomingMsg = {
              id: tempId,
              tempId,
              senderId: user.id,
              messageContent: outgoing.messageContent,
              encryptedContent: outgoing.encryptedContent,
              iv: outgoing.iv,
              salt: outgoing.salt,
              mediaUrl: mediaUrl || null,
              mediaType: mediaType || null,
              createdAt: new Date().toISOString(),
              isEncrypted: outgoing.isEncrypted,
              senderName: user.fullName || user.firstName || "Unknown User",
              senderUsername: user.username || undefined,
              avatar: currentUserAvatar || undefined,
              migrationVersion: outgoing.migrationVersion,
            };

            // Add optimistic message with "sending" status
            const optimisticMessage: ChatMessage = {
              id: tempId,
              tempId,
              content: content.trim(),
              timestamp: new Date(incomingMsg.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "Asia/Kolkata",
              }),
              sender: incomingMsg.senderName,
              senderUsername: incomingMsg.senderUsername,
              avatar: incomingMsg.avatar,
              isCurrentUser: true,
              createdAt: incomingMsg.createdAt,
              mediaUrl,
              mediaType,
              status: "sending",
            };

            seenIdsRef.current.add(tempId);
            setMessages((prev) => [...prev, optimisticMessage]);

            socket.emit("send_message", { chatId, message: incomingMsg }, (ack) => {
              // Level 1 ack: server received it, upgrade to "sent"
              setMessages((prev) =>
                prev.map((m) =>
                  m.tempId === tempId || m.id === tempId
                    ? { ...m, status: "sent" }
                    : m
                )
              );
            });

            setSending(false);
            return optimisticMessage;
          }
        }

        // Fallback: HTTP send
        const response = await fetch(`/api/groups/${groupId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: content.trim(),
            encryptedContent: outgoing.encryptedContent,
            encryptionIv: outgoing.iv,
            encryptionSalt: outgoing.salt,
            isEncrypted: outgoing.isEncrypted,
            mediaUrl,
            mediaType,
            text: content.trim() || null,
            migrationVersion: outgoing.migrationVersion,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
          if (response.status === 403) throw new Error("Not a member of this group");
          if (response.status === 404) throw new Error("Group not found");
          throw new Error(`Failed to send message: ${errorData.error || response.statusText}`);
        }

        const newMessage = await response.json();
        const decryptedMessage: ChatMessage = {
          id: newMessage.id,
          content: content.trim(),
          timestamp: new Date(newMessage.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Kolkata",
          }),
          sender: newMessage.sender,
          senderUsername: newMessage.senderUsername,
          avatar: newMessage.avatar,
          isCurrentUser: true,
          createdAt: newMessage.createdAt,
          mediaUrl,
          mediaType,
          status: "sent",
        };

        setMessages((prev) => [...prev, decryptedMessage]);
        return decryptedMessage;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send message");
        throw err;
      } finally {
        setSending(false);
      }
    },
    [groupId, user, encryptMessage, chatId, stopTyping, currentUserAvatar],
  );

  const notifyMessagesSeen = useCallback(
    (messageIds: string[]) => {
      if (!user?.id || !chatId) return;
      const socket = getSocket(user.id);
      if (socket && socket.connected && messageIds.length > 0) {
        socket.emit("mark_seen", { chatId, messageIds });
      }
    },
    [chatId, user?.id],
  );

  const handleMessagesSeen = useCallback(({ messageIds, isFullySeen }: any) => {
    setMessages((prev) =>
      prev.map((m) =>
        messageIds.includes(m.id) || messageIds.includes(m.tempId || "")
          ? { ...m, status: isFullySeen ? "seen" : m.status }
          : m
      )
    );
  }, []);

  const handleReceiveMessage = useCallback(async (incomingMsg: any) => {
    const msgId = incomingMsg.id || incomingMsg.tempId;
    if (msgId && seenIdsRef.current.has(msgId)) return;
    if (msgId) seenIdsRef.current.add(msgId);
    if (incomingMsg.tempId) seenIdsRef.current.add(incomingMsg.tempId);

    // --- Gap Detection ---
    const incomingSeq: number | undefined = (incomingMsg as any).conversationSequence;
    if (incomingSeq && incomingSeq > 0) {
      const lastSeq = lastKnownSequenceRef.current;
      if (lastSeq > 0 && incomingSeq > lastSeq + 1) {
        const fromSeq = lastSeq + 1;
        const toSeq = incomingSeq - 1;
        console.warn(`[useGroupChat] Gap detected: missing CSN ${fromSeq}–${toSeq}`);
        const socket = getSocket(user?.id || "");
        if (socket.connected) {
          socket.emit("request_gap_fill", {
            chatId,
            fromSequence: fromSeq,
            toSequence: toSeq,
          }, async (response: any) => {
            if (response?.status === "success" && Array.isArray(response.messages)) {
              const decryptedGap = response.messages.map((m: any) => {
                const hydration = hydrateMessageContent({
                  message_content: m.text ?? m.message_content ?? m.plain_content,
                  migration_version: m.migration_version ?? m.migrationVersion,
                });
                const decryptedContent = hydration.content || "[Empty message]";
                return {
                  id: m.id,
                  content: decryptedContent,
                  sender: m.senderName || "Unknown",
                  senderUsername: m.senderUsername,
                  avatar: m.avatar,
                  isCurrentUser: m.senderId === user?.id,
                  createdAt: m.createdAt || m.created_at || new Date().toISOString(),
                  timestamp: new Date(m.createdAt || m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: "Asia/Kolkata" }),
                  status: "delivered" as const,
                };
              });
              setMessages((prev) => {
                const existingIds = new Set(prev.map((m: ChatMessage) => m.id));
                const newGap = decryptedGap.filter((m: ChatMessage) => !existingIds.has(m.id));
                return [...prev, ...newGap].sort(
                  (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                );
              });
            } else if (response?.status === "GAP_TOO_LARGE") {
              fetchMessages();
            }
          });
        }
      }
      if (incomingSeq > lastKnownSequenceRef.current) {
        lastKnownSequenceRef.current = incomingSeq;
      }
    }

    setMessages((prev) => {
      const exists = prev.some(
        (m) =>
          m.id === incomingMsg.id ||
          m.id === incomingMsg.tempId ||
          (m.tempId && m.tempId === incomingMsg.tempId) ||
          (m.tempId && m.tempId === incomingMsg.id)
      );
      if (exists) return prev;

       const hydration = hydrateMessageContent(
        {
          message_content: incomingMsg.text ?? incomingMsg.message_content ?? incomingMsg.plain_content,
          migration_version: incomingMsg.migration_version ?? incomingMsg.migrationVersion,
        }
      );

      const decryptedContent = hydration.content || "[Empty message]";

      const isFromMe = incomingMsg.senderId === user?.id;

      // Emit delivery ack for messages from others
      if (!isFromMe && incomingMsg.id) {
        const socket = getSocket(user?.id || "");
        socket.emit("message_delivered", { chatId, messageId: incomingMsg.id });
      }

      const newMessage: ChatMessage = { // Changed from GroupChatMessage to ChatMessage
        id: incomingMsg.id,
        tempId: incomingMsg.tempId,
        content: decryptedContent,
        senderId: incomingMsg.senderId,
        sender: incomingMsg.senderName || "Unknown",
        avatar: incomingMsg.avatar,
        status: isFromMe ? "sent" : "delivered",
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: "Asia/Kolkata" }), // Added timeZone
        createdAt: incomingMsg.createdAt || new Date().toISOString(),
        isCurrentUser: isFromMe,
        isEncrypted: incomingMsg.isEncrypted,
        mediaUrl: incomingMsg.mediaUrl,
        mediaType: incomingMsg.mediaType,
        senderUsername: incomingMsg.senderUsername, // Added senderUsername
        encryptionIv: incomingMsg.iv || incomingMsg.encryptionIv || incomingMsg.encryption_iv,
        encryptionSalt: incomingMsg.salt || incomingMsg.encryptionSalt || incomingMsg.encryption_salt,
      };

      const merged = [...prev, newMessage];
      return merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    });
  }, [user?.id, chatId, seenIdsRef, fetchMessages]);

  // Socket.IO Integration Setup
  useEffect(() => {
    if (!user?.id || !chatId) return;

    const socket = getSocket(user.id);
    if (!socket.connected) socket.connect();

    const onConnect = () => {
      socket.emit("join_chat", { chatId });
      fetchMessages();
    };

    socket.on("connect", onConnect);
    if (socket.connected) {
      socket.emit("join_chat", { chatId });
      // Don't call fetchMessages here — it runs via the initial useEffect.
      // Only re-sync on a genuine reconnect (onConnect).
    }

    const handleMessagePersisted = (ack: { tempId: string; messageId: string; chatId: string }) => {
      if (ack.chatId === chatId) {
        seenIdsRef.current.add(ack.messageId);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === ack.tempId || m.tempId === ack.tempId
              ? { ...m, id: ack.messageId, status: m.status === "sending" ? "sent" : m.status }
              : m
          )
        );
      }
    };

    const handleMessageDeliveredAck = ({ messageId, chatId: targetChat }: any) => {
      if (targetChat === chatId) {
        setMessages((prev) =>
          prev.map((m) =>
            (m.id === messageId || m.tempId === messageId) &&
            (m.status === "sent" || m.status === "sending")
              ? { ...m, status: "delivered" }
              : m
          )
        );
      }
    };

    const handleUserTyping = ({ chatId: targetChat, userId: typingUserId }: any) => {
      if (targetChat === chatId && typingUserId !== user.id) {
        setTypingUsers((prev) => new Set(prev).add(typingUserId));
      }
    };

    const handleUserStoppedTyping = ({ chatId: targetChat, userId: typingUserId }: any) => {
      if (targetChat === chatId) {
        setTypingUsers((prev) => {
          const next = new Set(prev);
          next.delete(typingUserId);
          return next;
        });
      }
    };

    const handleUserOnline = ({ supabaseId }: any) => {
      if (supabaseId) setOnlineMembers((prev) => new Set(prev).add(supabaseId));
    };

    const handleUserOffline = ({ supabaseId }: any) => {
      if (supabaseId) {
        setOnlineMembers((prev) => {
          const next = new Set(prev);
          next.delete(supabaseId);
          return next;
        });
      }
    };

    // Workstream 7: Gap fill response from server
    const handleGapFound = (data: { fromSequence: number; toSequence: number; chatId: string }) => {
      if (data.chatId !== chatId) return;
      console.warn(`[useGroupChat] Server reported gap: ${data.fromSequence}–${data.toSequence}. Resyncing.`);
      fetchMessages();
    };

    socket.on("messages_seen", handleMessagesSeen);
    socket.on("receive_message", handleReceiveMessage);
    socket.on("message_persisted", handleMessagePersisted);
    socket.on("message_delivered_ack", handleMessageDeliveredAck);
    socket.on("user_typing", handleUserTyping);
    socket.on("user_stopped_typing", handleUserStoppedTyping);
    socket.on("user_online", handleUserOnline);
    socket.on("user_offline", handleUserOffline);
    socket.on("gap_found", handleGapFound);

    return () => {
      socket.off("connect", onConnect);
      socket.off("messages_seen", handleMessagesSeen);
      socket.off("receive_message", handleReceiveMessage);
      socket.off("message_persisted", handleMessagePersisted);
      socket.off("message_delivered_ack", handleMessageDeliveredAck);
      socket.off("user_typing", handleUserTyping);
      socket.off("user_stopped_typing", handleUserStoppedTyping);
      socket.off("user_online", handleUserOnline);
      socket.off("user_offline", handleUserOffline);
      socket.off("gap_found", handleGapFound);
      socket.emit("leave_chat", { chatId });
    };
  }, [groupId, user?.id, handleReceiveMessage, handleMessagesSeen, fetchMessages, chatId, isEncryptionAvailable]); // Added chatId, isEncryptionAvailable to deps

  // Initial data fetch
  useEffect(() => {
    if (isEncryptionAvailable) {
      fetchMessages();
      fetchGroupInfo();
    }
  }, [fetchMessages, fetchGroupInfo, isEncryptionAvailable]);

  return {
    messages,
    loading,
    sending,
    error,
    groupInfo,
    sendMessage,
    refetch: fetchMessages,
    typingUsers,
    sendTypingEvent,
    onlineMembers,
    currentUserUuid,
    notifyMessagesSeen,
    hasMoreMessages,
    loadingMore,
    loadMoreMessages,
  };
};

