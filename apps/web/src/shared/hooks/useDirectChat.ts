import { getDirectChatId } from "@kovari/api/client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { buildOutgoingMessage } from "@kovari/types";
import { diagLog } from "@/lib/observability/performance";
import { getSocket } from "@/lib/socket";
import { v4 as uuidv4 } from "uuid";
import { MessageStatusReconciler } from "@/services/messaging/messageStatusReconciler";

export interface DirectChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  created_at: string;
  message_content?: string | null;
  status?: "sending" | "failed" | "sent" | "persisted" | "delivered" | "seen";
  tempId?: string;
  client_id?: string;
  read_at?: string; // Added for read_at
  // Sender profile information
  sender_profile?: {
    name?: string;
    username?: string;
    profile_photo?: string;
    deleted?: boolean;
  };
  mediaUrl?: string;
  mediaType?: "image" | "video";
  conversationSequence?: number;
  serverSequence?: number;
}

export interface UseDirectChatResult {
  messages: DirectChatMessage[];
  loading: boolean;
  sending: boolean;
  error: string | null;
  sendMessage: (
    value: string,
    mediaUrl?: string,
    mediaType?: "image" | "video",
  ) => Promise<void>;
  markMessagesRead: () => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  hasMoreMessages: boolean;
  loadingMore: boolean;
  // UX Features
  isPartnerTyping: boolean;
  sendTypingEvent: () => void;
  notifyMessagesSeen: (messageIds: string[]) => void;
  lastSeenPartner: string | null;
}

export const useDirectChat = (
  currentUserUuid: string,
  partnerUuid: string,
  myClerkId?: string,
  partnerClerkId?: string,
): UseDirectChatResult => {
  const { user } = useUser();
  const reconciler = useMemo(() => new MessageStatusReconciler(), []);
  const [messages, setMessages] = useState<DirectChatMessage[]>([]);
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

  // UX Feature States
  const [isPartnerTyping, setIsPartnerTyping] = useState<boolean>(false);
  const [lastSeenPartner, setLastSeenPartner] = useState<string | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const seenIdsRef = useRef(new Set<string>());
  // Gap detection: track the highest conversation sequence seen
  const lastKnownSequenceRef = useRef<number>(0);
  // Typing throttle: only emit typing_start once per 3s window
  const lastTypingEmitRef = useRef<number>(0);

  // Shared secret for encryption - standardizing on UUIDs for cross-platform parity
  const sharedSecret = useMemo(() => {
    if (!currentUserUuid || !partnerUuid) return "";
    // Standard: Sort UUIDs alphabetically and join with colon
    return currentUserUuid < partnerUuid 
      ? `${currentUserUuid}:${partnerUuid}` 
      : `${partnerUuid}:${currentUserUuid}`;
  }, [currentUserUuid, partnerUuid]);

  // Fetch initial messages with sender profile information
  const fetchMessages = useCallback(
    async (loadMore = false) => {
      if (!currentUserUuid || !partnerUuid) {
        setMessages([]);
        setLoading(false);
        return;
      }

      if (loadMore) {
        setLoadingMore(true);
      }

      diagLog("useDirectChat fetchMessages triggered");
      const start = performance.now();

      try {
        const queryParams = new URLSearchParams({
          partnerId: partnerUuid,
          limit: "30",
        });
        if (loadMore && cursorRef.current) {
          queryParams.append("cursor", cursorRef.current);
        }

        const response = await fetch(
          `/api/direct-chat/messages?${queryParams.toString()}`,
          { method: "GET", credentials: "include" },
        );
        diagLog(`useDirectChat fetchMessages completed in ${Math.round(performance.now() - start)}ms`);
        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          setError(errorBody?.error || "Failed to fetch messages");
        } else {
          const payload = await response.json();
          const data = Array.isArray(payload?.messages) ? payload.messages : [];
          const transformedMessages = data.map((msg: any) => {
            return {
              ...msg,
              sender_profile: msg.sender?.profiles?.[0] || undefined,
              mediaUrl: (msg as any)["media_url"] || msg.mediaUrl,
              mediaType: (msg as any)["media_type"] || msg.mediaType,
              status: msg.status || (msg.read_at ? "seen" : "delivered"),
              conversationSequence: msg.conversation_sequence ?? msg.conversationSequence,
              serverSequence: msg.server_sequence ?? msg.serverSequence,
            };
          });

          // Always reverse to chronological order (oldest at top)
          const chronologicalMessages = transformedMessages.reverse();

          // Populate seenIdsRef with fetched message IDs
          chronologicalMessages.forEach((msg: DirectChatMessage) => {
            if (msg.id) seenIdsRef.current.add(msg.id);
            if (msg.tempId) seenIdsRef.current.add(msg.tempId);
            if (msg.client_id) seenIdsRef.current.add(msg.client_id);
          });

          if (loadMore) {
            setMessages((prev) => {
              const combined = reconciler.reconcileList(prev, chronologicalMessages);
              if (combined.length > 0) {
                setCursor(combined[0].created_at); // oldest is at index 0
              }
              return combined;
            });
          } else {
            // For regular polling refresh, we merge gracefully to preserve temp messages and avoid duplicates
            setMessages((prev) => {
              const combined = reconciler.reconcileList(prev, chronologicalMessages);
              if (!cursor && combined.length > 0) {
                setCursor(combined[0].created_at);
              }
              return combined;
            });
          }

          setHasMoreMessages(transformedMessages.length === 30);
        }
      } catch (err: any) {
        setError(err.message || "Failed to fetch messages");
        // DO NOT clear messages on transient errors (like rate limiting)
      } finally {
        if (loadMore) {
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
      }
    },
    [currentUserUuid, partnerUuid, sharedSecret, reconciler],
  );

  // Load more messages function
  const loadMoreMessages = useCallback(async () => {
    if (loadingMore || !hasMoreMessages) return;
    await fetchMessages(true);
  }, [fetchMessages, loadingMore, hasMoreMessages]);

  const stopTyping = useCallback(() => {
     const chatId = currentUserUuid && partnerUuid ? getDirectChatId(currentUserUuid, partnerUuid) : null;
     if (user?.id && chatId) {
        const socket = getSocket(user.id);
        socket.emit("typing_stop", { chatId });
     }
  }, [user?.id, currentUserUuid, partnerUuid]);

  const sendTypingEvent = useCallback(() => {
     const chatId = currentUserUuid && partnerUuid ? getDirectChatId(currentUserUuid, partnerUuid) : null;
     if (user?.id && chatId) {
        const socket = getSocket(user.id);
        const now = Date.now();
        // Workstream 5: Rate-limit typing_start to once per 3 seconds
        if (now - lastTypingEmitRef.current >= 3000) {
          socket.emit("typing_start", { chatId });
          lastTypingEmitRef.current = now;
        }
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        // Debounce typing_stop by 1.5s
        typingTimeoutRef.current = setTimeout(stopTyping, 1500);
     }
  }, [user?.id, currentUserUuid, partnerUuid, stopTyping]);

  const notifyMessagesSeen = useCallback((messageIds: string[]) => {
     if (messageIds.length === 0) return;
     const chatId = currentUserUuid && partnerUuid ? getDirectChatId(currentUserUuid, partnerUuid) : null;
     if (user?.id && chatId) {
        const socket = getSocket(user.id);
        socket.emit("mark_seen", { chatId, messageIds });
        setMessages(prev => reconciler.reconcileList(prev, messageIds.map(id => ({ id, status: "seen" }))));
     }
  }, [user?.id, currentUserUuid, partnerUuid, reconciler]);

  // Send a message (optimistic)
  const sendMessage = useCallback(
    async (value: string, mediaUrl?: string, mediaType?: "image" | "video") => {
      if ((!value.trim() && !mediaUrl) || !currentUserUuid || !partnerUuid)
        return;
      setError(null);
      const tempId = uuidv4();
      const clientId = tempId;

      // build the outgoing message using buildOutgoingMessage
      const outgoing = await buildOutgoingMessage(
        { text: value.trim(), mediaUrl, mediaType }
      );

      const optimisticMsg: DirectChatMessage = {
        id: tempId,
        tempId,
        sender_id: currentUserUuid,
        receiver_id: partnerUuid,
        created_at: new Date().toISOString(),
        status: "sending",
        message_content: value.trim() || undefined,
        client_id: clientId,
        mediaUrl,
        mediaType,
      };

      setSending(true);
      seenIdsRef.current.add(tempId); // Add tempId to seenIdsRef
      setMessages((prev) => reconciler.reconcileList(prev, [optimisticMsg]));
      
      // Stop typing immediately when a message is sent
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      stopTyping();
      try {
        // [SOCKET INTEGRATION - Optimistic send via Socket]
        const chatId = getDirectChatId(currentUserUuid, partnerUuid);
        if (user?.id && chatId) {
           const socket = getSocket(user.id);
           if (socket.connected) {
              socket.emit("send_message", {
                 chatId,
                 message: {
                     ...buildOutgoingMessage({ text: outgoing.messageContent, mediaUrl: mediaUrl || null, mediaType: mediaType || null }),
                     id: tempId,
                     tempId,
                     senderId: currentUserUuid,
                     receiverId: partnerUuid,
                  }
              }, (ack: any) => {
                 if (ack?.status === "sent") {
                    setMessages((prev) => reconciler.reconcileList(prev, [{
                      tempId,
                      client_id: clientId,
                      status: "sent"
                    }]));
                 }
              });
              setSending(false);
              return; // Socket handled this and will persist.
            }
         }

        const response = await fetch("/api/direct-chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            partnerId: partnerUuid,
            clientId,
            media_url: mediaUrl ?? null,
            media_type: mediaType ?? null,
            text: value.trim() || null,
          }),
        });
        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}));
          throw new Error(errorBody?.error || "Failed to send message");
        }
        const payload = await response.json();
        const data = payload?.message;
        const serverMessage: DirectChatMessage = {
          ...data,
          sender_profile: data?.sender?.profiles?.[0] || undefined,
          mediaUrl: data?.media_url || data?.mediaUrl,
          mediaType: data?.media_type || data?.mediaType,
          status: "sent",
        };
        setMessages((prev) =>
          reconciler.reconcileList(prev, [serverMessage]),
        );
      } catch (err: any) {
        setMessages((prev) =>
          reconciler.reconcileList(prev, [{
            tempId,
            client_id: clientId,
            status: "failed"
          }]),
        );
        setError(err.message || "Failed to send message");
      } finally {
        setSending(false);
      }
    },
    [currentUserUuid, partnerUuid, sharedSecret, user?.id, reconciler],
  );

  // Add markMessagesRead function
  const markMessagesRead = useCallback(async () => {
    if (!currentUserUuid || !partnerUuid) return;
    try {
      await fetch("/api/direct-chat/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ partnerId: partnerUuid }),
      });
      setMessages((prev) => reconciler.reconcileList(
        prev,
        prev
          .filter(msg => msg.receiver_id === currentUserUuid && msg.sender_id === partnerUuid && !msg.read_at)
          .map(msg => ({ id: msg.id, status: "seen", read_at: new Date().toISOString() }))
      ));
    } catch (err) {
      // Optionally handle error
    }
  }, [currentUserUuid, partnerUuid, reconciler]);

  // Initial fetch
  useEffect(() => {
    diagLog("useDirectChat mounted");
    setLoading(true);
    fetchMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserUuid, partnerUuid]);

  // Socket.IO Integration Setup
  useEffect(() => {
    const chatId = currentUserUuid && partnerUuid ? getDirectChatId(currentUserUuid, partnerUuid) : null;
    if (!user?.id || !chatId) return;

    const socket = getSocket(user.id);
    if (!socket.connected) socket.connect();

    const onConnect = () => {
      socket.emit("join_chat", { chatId });
      socket.emit("get_last_seen", { userId: partnerUuid }, (lastSeen: string | null) => {
          setLastSeenPartner(lastSeen);
      });
      fetchMessages(); // re-sync any missed messages from the DB
    };

    socket.on("connect", onConnect);
    if (socket.connected) {
      socket.emit("join_chat", { chatId });
      socket.emit("get_last_seen", { userId: partnerUuid }, (lastSeen: string | null) => {
          setLastSeenPartner(lastSeen);
      });
      fetchMessages();
    }

    const handleReceiveMessage = async (incomingMsg: any) => {
      const incomingContent = incomingMsg.messageContent ?? incomingMsg.message_content ?? incomingMsg.text;
      
      const senderId = incomingMsg.senderId || incomingMsg.sender_id;
      const receiverId = incomingMsg.receiverId || incomingMsg.receiver_id || (senderId === currentUserUuid ? partnerUuid : currentUserUuid);

      const incomingDirectMsg: DirectChatMessage = {
        id: incomingMsg.id || incomingMsg.tempId,
        sender_id: senderId,
        receiver_id: receiverId,
        created_at: incomingMsg.created_at || incomingMsg.createdAt || new Date().toISOString(),
        message_content: incomingContent || "",
        mediaUrl: incomingMsg.mediaUrl,
        mediaType: incomingMsg.mediaType,
        client_id: incomingMsg.tempId,
        tempId: incomingMsg.tempId,
        status: incomingMsg.senderId === currentUserUuid ? "sent" : "delivered",
        sender_profile: incomingMsg.senderName ? {
          name: incomingMsg.senderName,
          username: incomingMsg.senderUsername,
        } : undefined,
        conversationSequence: incomingMsg.conversationSequence ?? incomingMsg.conversation_sequence,
        serverSequence: incomingMsg.serverSequence ?? incomingMsg.server_sequence,
      };

      if (incomingMsg.id) seenIdsRef.current.add(incomingMsg.id);
      if (incomingMsg.tempId) seenIdsRef.current.add(incomingMsg.tempId);
      if (incomingMsg.client_id) seenIdsRef.current.add(incomingMsg.client_id);

      const incomingSeq: number | undefined = (incomingMsg as any).conversationSequence;
      if (incomingSeq && incomingSeq > 0) {
        const lastSeq = lastKnownSequenceRef.current;
        if (lastSeq > 0 && incomingSeq > lastSeq + 1) {
          const fromSeq = lastSeq + 1;
          const toSeq = incomingSeq - 1;
          console.warn(`[useDirectChat] Gap detected: missing CSN ${fromSeq}–${toSeq}`);
          socket.emit("request_gap_fill", {
            chatId,
            fromSequence: fromSeq,
            toSequence: toSeq,
          }, (response: any) => {
            if (response?.status === "success" && Array.isArray(response.messages)) {
              setMessages((prev) => {
                const gapMessages = response.messages.map((m: any) => ({
                  id: m.id,
                  sender_id: m.senderId || m.sender_id,
                  receiver_id: m.receiverId || m.receiver_id,
                  created_at: m.createdAt || m.created_at || new Date().toISOString(),
                  message_content: m.text || m.message_content || "",
                  status: "delivered" as const,
                }));
                return reconciler.reconcileList(prev, gapMessages);
              });
            } else if (response?.status === "GAP_TOO_LARGE") {
              fetchMessages();
            }
          });
        }
        if (incomingSeq > lastKnownSequenceRef.current) {
          lastKnownSequenceRef.current = incomingSeq;
        }
      }

      if (incomingDirectMsg.sender_id !== currentUserUuid) {
        socket.emit("message_delivered", { chatId, messageId: incomingDirectMsg.id });
      }

      setMessages((prev) => reconciler.reconcileList(prev, [incomingDirectMsg]));
    };

    const handleMessagePersisted = (ack: { tempId: string, messageId: string, chatId: string, conversationSequence?: number }) => {
       if (ack.chatId === chatId) {
          seenIdsRef.current.add(ack.messageId);
          if (ack.conversationSequence && ack.conversationSequence > lastKnownSequenceRef.current) {
            lastKnownSequenceRef.current = ack.conversationSequence;
          }
          reconciler.registerMapping(ack.tempId, ack.messageId);
          setMessages((prev) => reconciler.reconcileList(prev, [{
            tempId: ack.tempId,
            id: ack.messageId,
            status: "sent",
            conversationSequence: ack.conversationSequence,
          }]));
       }
    };

    const handleMessageDeliveredAck = ({ messageId, chatId: targetChat, conversationSequence }: any) => {
       if (targetChat === chatId) {
          setMessages((prev) => reconciler.reconcileList(prev, [{
            id: messageId,
            status: "delivered",
            conversationSequence,
          }]));
       }
    };

    const handleMessagesSeen = ({ chatId: targetChat, messageIds, lastSeenSequence }: any) => {
       if (targetChat === chatId) {
          setMessages(prev => {
             const updates = (messageIds || []).map((id: string) => ({
                id,
                status: "seen" as const,
                conversationSequence: lastSeenSequence,
                read_at: new Date().toISOString(),
             }));
             if (lastSeenSequence != null) {
                for (const msg of prev) {
                   if (msg.conversationSequence != null && msg.conversationSequence <= lastSeenSequence && msg.status !== "seen") {
                      updates.push({
                         id: msg.id,
                         status: "seen" as const,
                         conversationSequence: msg.conversationSequence,
                         read_at: new Date().toISOString(),
                      });
                   }
                }
             }
             return reconciler.reconcileList(prev, updates);
          });
       }
    };

    const handleUserTyping = ({ chatId: targetChat, userId: typingUserId }: any) => {
       if (targetChat === chatId && typingUserId !== user?.id) {
           setIsPartnerTyping(true);
       }
    };

    const handleUserStoppedTyping = ({ chatId: targetChat, userId: typingUserId }: any) => {
       if (targetChat === chatId && typingUserId !== user?.id) {
           setIsPartnerTyping(false);
       }
    };

    const handleUserOnline = ({ supabaseId }: any) => {
       if (supabaseId === partnerUuid) {
           setLastSeenPartner("online");
       }
    };

    const handleUserOffline = ({ supabaseId, lastSeen }: any) => {
       if (supabaseId === partnerUuid) {
           setLastSeenPartner(lastSeen);
       }
    };

    socket.on("receive_message", handleReceiveMessage);
    socket.on("message_persisted", handleMessagePersisted);
    socket.on("message_delivered_ack", handleMessageDeliveredAck);
    socket.on("messages_seen", handleMessagesSeen);
    socket.on("user_typing", handleUserTyping);
    socket.on("user_stopped_typing", handleUserStoppedTyping);
    socket.on("user_online", handleUserOnline);
    socket.on("user_offline", handleUserOffline);

    // Workstream 7: Gap fill response from server
    const handleGapFound = (data: { fromSequence: number; toSequence: number; chatId: string }) => {
      if (data.chatId !== chatId) return;
      console.warn(`[useDirectChat] Server reported gap: ${data.fromSequence}–${data.toSequence}. Resyncing.`);
      fetchMessages();
    };
    socket.on("gap_found", handleGapFound);

    return () => {
      socket.off("connect", onConnect);
      socket.off("receive_message", handleReceiveMessage);
      socket.off("message_persisted", handleMessagePersisted);
      socket.off("message_delivered_ack", handleMessageDeliveredAck);
      socket.off("messages_seen", handleMessagesSeen);
      socket.off("user_typing", handleUserTyping);
      socket.off("user_stopped_typing", handleUserStoppedTyping);
      socket.off("user_online", handleUserOnline);
      socket.off("user_offline", handleUserOffline);
      socket.off("gap_found", handleGapFound);
      socket.emit("leave_chat", { chatId });
    };
  }, [user?.id, currentUserUuid, partnerUuid, fetchMessages]);

  // Poll messages only as a backup when the WebSocket connection is offline
  useEffect(() => {
    if (!currentUserUuid || !partnerUuid) return;

    const handleVisibilityAndPoll = () => {
      // Do not poll if the page is hidden in background
      if (typeof document !== "undefined" && document.hidden) return;

      const socket = getSocket(user?.id || "");
      // Poll only if the WebSocket is disconnected/offline
      if (!socket || !socket.connected) {
        fetchMessages(false);
      }
    };

    // Immediate check on visibility focus
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        handleVisibilityAndPoll();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    const interval = window.setInterval(handleVisibilityAndPoll, 15000); // Check socket health & fallback every 15s instead of 5s

    return () => {
      window.clearInterval(interval);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [currentUserUuid, partnerUuid, fetchMessages, user?.id]);

  // Reset cursor when chat changes
  useEffect(() => {
    setCursor(null);
    setHasMoreMessages(true);
    setMessages([]);
  }, [partnerUuid]);

  return {
    messages,
    loading,
    sending,
    error,
    sendMessage,
    markMessagesRead,
    loadMoreMessages,
    hasMoreMessages,
    loadingMore,
    isPartnerTyping,
    sendTypingEvent,
    notifyMessagesSeen,
    lastSeenPartner,
  };
};

