import { getDirectChatId } from "@kovari/api/client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { buildOutgoingMessage } from "@kovari/types";
import { hydrateMessageContent } from "@/services/messaging/messageHydrator";
import { diagLog } from "@/lib/observability/performance";
import { getSocket } from "@/lib/socket";
import { v4 as uuidv4 } from "uuid";

export interface DirectChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  encrypted_content?: string;
  encryption_iv?: string;
  encryption_salt?: string;
  is_encrypted?: boolean;
  created_at: string;
  status?: "sending" | "failed" | "sent" | "persisted" | "delivered" | "seen";
  tempId?: string;
  plain_content?: string; // for optimistic UI
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
          // Transform messages to include sender profile information and normalize media fields
          const transformedMessages = data.map((msg: any) => {
            const sId = msg.sender_id;
            const rId = msg.receiver_id;
            const hydration = hydrateMessageContent(
              {
                message_content: msg.message_content,
                migration_version: msg.migration_version,
              }
            );

            return {
              ...msg,
              plain_content: hydration.content,
              sender_profile: msg.sender?.profiles?.[0] || undefined,
              mediaUrl: (msg as any)["media_url"] || msg.mediaUrl,
              mediaType: (msg as any)["media_type"] || msg.mediaType,
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
              const existingIds = new Set(prev.map((m) => m.id));
              const existingClientIds = new Set(prev.map((m) => m.client_id || m.tempId).filter(Boolean));
              
              const newMessages = chronologicalMessages.filter(
                (msg: DirectChatMessage) => !existingIds.has(msg.id) && !existingClientIds.has(msg.client_id),
              );
              
              const combined = [...newMessages, ...prev];
              if (combined.length > 0) {
                setCursor(combined[0].created_at); // oldest is at index 0
              }
              return combined;
            });
          } else {
            // For regular polling refresh, we merge gracefully to preserve temp messages and avoid duplicates
            setMessages((prev) => {
              const existingClientIds = new Set(prev.map((m) => m.client_id || m.tempId).filter(Boolean));
              const prevMap = new Map(prev.map(m => [m.id, m]));
              
              const merged = [...prev];
              chronologicalMessages.forEach((msg: any) => {
                 if (prevMap.has(msg.id)) return;
                 // If the message has a client_id matching a tempId of a local optimistic message, update the local message
                 const localTempIndex = merged.findIndex(m => m.tempId && m.tempId === msg.client_id);
                 if (localTempIndex > -1) {
                    merged[localTempIndex] = { ...merged[localTempIndex], ...msg, status: "sent" };
                 } else if (!existingClientIds.has(msg.client_id)) {
                    merged.push(msg); // Add new completed message from polling
                 }
              });
              // Sort by created_at 
              const sorted = merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
              
              // Only update cursor if we don't have one, or if we completely replaced messages (which shouldn't happen here)
              // Actually, since this is polling the *latest* messages, the oldest message shouldn't change unless we fetched the very first batch.
              if (!cursor && sorted.length > 0) {
                setCursor(sorted[0].created_at);
              }
              return sorted;
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
    [currentUserUuid, partnerUuid, sharedSecret],
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
        setMessages(prev => prev.map(m => messageIds.includes(m.id) ? { ...m, status: "seen" } : m));
     }
  }, [user?.id, currentUserUuid, partnerUuid]);

  // Send a message (optimistic)
  const sendMessage = useCallback(
    async (value: string, mediaUrl?: string, mediaType?: "image" | "video") => {
      if ((!value.trim() && !mediaUrl) || !currentUserUuid || !partnerUuid)
        return;
      setError(null);
      const tempId = uuidv4();
      const clientId = uuidv4();

      // build the outgoing message using buildOutgoingMessage
      const outgoing = await buildOutgoingMessage(
        { text: value.trim(), mediaUrl, mediaType }
      );

      const optimisticMsg: DirectChatMessage = {
        id: tempId,
        tempId,
        sender_id: currentUserUuid,
        receiver_id: partnerUuid,
        encrypted_content: outgoing.encryptedContent || "",
        encryption_iv: outgoing.iv || "",
        encryption_salt: outgoing.salt || "",
        is_encrypted: outgoing.isEncrypted,
        created_at: new Date().toISOString(),
        status: "sending",
        plain_content: value.trim() || undefined,
        client_id: clientId,
        mediaUrl,
        mediaType,
      };

      setSending(true);
      seenIdsRef.current.add(tempId); // Add tempId to seenIdsRef
      setMessages((prev) => [...prev, optimisticMsg]);
      
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
                    id: tempId, // Use tempId as id for optimistic socket message
                    tempId,
                    senderId: currentUserUuid,
                    receiverId: partnerUuid,
                    messageContent: outgoing.messageContent,
                    encryptedContent: outgoing.encryptedContent,
                    iv: outgoing.iv,
                    salt: outgoing.salt,
                    mediaUrl: mediaUrl || null,
                    mediaType: mediaType || null,
                    isEncrypted: outgoing.isEncrypted,
                    migrationVersion: outgoing.migrationVersion,
                 }
              }, (ack: any) => {
                 if (ack?.status === "sent") {
                    // This ack is for the socket server receiving the message, not persisted
                    // The message_persisted event will handle the final status update
                    setMessages((prev) => prev.map((m) => m.tempId === tempId ? { ...m, status: "sent" } : m));
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
            encrypted_content: outgoing.encryptedContent,
            encryption_iv: outgoing.iv,
            encryption_salt: outgoing.salt,
            is_encrypted: outgoing.isEncrypted,
            clientId,
            media_url: mediaUrl ?? null,
            media_type: mediaType ?? null,
            text: value.trim() || null,
            migrationVersion: outgoing.migrationVersion,
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
          prev.map((msg) => (msg.tempId === tempId ? serverMessage : msg)),
        );
      } catch (err: any) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.tempId === tempId ? { ...msg, status: "failed" } : msg,
          ),
        );
        setError(err.message || "Failed to send message");
      } finally {
        setSending(false);
      }
    },
    [currentUserUuid, partnerUuid, sharedSecret, user?.id],
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
      setMessages((prev) =>
        prev.map((msg) =>
          msg.receiver_id === currentUserUuid &&
          msg.sender_id === partnerUuid &&
          !msg.read_at
            ? { ...msg, read_at: new Date().toISOString() }
            : msg,
        ),
      );
    } catch (err) {
      // Optionally handle error
    }
  }, [currentUserUuid, partnerUuid]);

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
      const hasId = incomingMsg.id && seenIdsRef.current.has(incomingMsg.id);
      const hasTempId = incomingMsg.tempId && seenIdsRef.current.has(incomingMsg.tempId);
      const hasClientId = incomingMsg.client_id && seenIdsRef.current.has(incomingMsg.client_id);

      if (hasId || hasTempId || hasClientId) {
        // If we've already seen this message (e.g., from optimistic send or initial fetch),
        // update its status and ID so it matches the server's persisted ID.
        if (incomingMsg.id) seenIdsRef.current.add(incomingMsg.id);
        if (incomingMsg.tempId) seenIdsRef.current.add(incomingMsg.tempId);
        if (incomingMsg.client_id) seenIdsRef.current.add(incomingMsg.client_id);

        setMessages((prev) => prev.map(m => 
          (m.tempId === incomingMsg.tempId || m.id === incomingMsg.id || m.client_id === incomingMsg.client_id)
          ? { 
              ...m, 
              id: incomingMsg.id || m.id, 
              status: m.status === 'sending' ? "sent" : m.status 
            }
          : m
        ));
        return;
      }
      if (incomingMsg.id) seenIdsRef.current.add(incomingMsg.id);
      if (incomingMsg.tempId) seenIdsRef.current.add(incomingMsg.tempId);
      if (incomingMsg.client_id) seenIdsRef.current.add(incomingMsg.client_id);

      // We handle decryption inside state update to use the latest keys
      setMessages((prev) => {
        const exists = prev.some(
          (m) =>
            (incomingMsg.id && m.id === incomingMsg.id) ||
            (incomingMsg.tempId && m.tempId === incomingMsg.tempId) ||
            (incomingMsg.client_id && m.client_id === incomingMsg.client_id)
        );
        if (exists) {
          return prev.map(m => 
            (m.tempId === incomingMsg.tempId || m.id === incomingMsg.id || m.client_id === incomingMsg.client_id)
            ? { 
                ...m, 
                id: incomingMsg.id || m.id, 
                status: m.status === 'sending' ? "sent" : m.status 
              }
            : m
          );
        }
        const hydration = hydrateMessageContent(
          {
            message_content: incomingMsg.text ?? incomingMsg.message_content ?? incomingMsg.plain_content,
            migration_version: incomingMsg.migration_version ?? incomingMsg.migrationVersion,
          }
        );

        let finalContent = hydration.content;
        let finalIsEncrypted = false;

        // --- Workstream 7: Sequence Gap Detection & Idempotent Merge ---
        const incomingSeq: number | undefined = (incomingMsg as any).conversationSequence;
        if (incomingSeq && incomingSeq > 0) {
          const lastSeq = lastKnownSequenceRef.current;
          if (lastSeq > 0 && incomingSeq > lastSeq + 1) {
            // Gap detected — request missing messages from server
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
                  const existingIds = new Set(prev.map((m) => m.id));
                  const gapMessages: DirectChatMessage[] = response.messages
                    .filter((m: any) => !existingIds.has(m.id))
                    .map((m: any) => ({
                      id: m.id,
                      sender_id: m.senderId || m.sender_id,
                      receiver_id: m.receiverId || m.receiver_id,
                      encrypted_content: m.encryptedContent || m.encrypted_content,
                      encryption_iv: m.iv || m.encryption_iv,
                      encryption_salt: m.salt || m.encryption_salt,
                      is_encrypted: m.isEncrypted ?? m.is_encrypted ?? false,
                      created_at: m.createdAt || m.created_at || new Date().toISOString(),
                      plain_content: m.text || m.plain_content || "",
                      status: "delivered" as const,
                    }));
                  return [...prev, ...gapMessages].sort(
                    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                  );
                });
              } else if (response?.status === "GAP_TOO_LARGE") {
                // Fall back to full REST fetch
                fetchMessages();
              }
            });
          }
          // Update highest known sequence — idempotent: only move forward
          if (incomingSeq > lastKnownSequenceRef.current) {
            lastKnownSequenceRef.current = incomingSeq;
          }
        }

        const senderId = incomingMsg.senderId || incomingMsg.sender_id;
        const receiverId = incomingMsg.receiverId || incomingMsg.receiver_id || (senderId === currentUserUuid ? partnerUuid : currentUserUuid);

        // Constructing a DirectChatMessage, not ChatMessage as per the original type
        const newMessage: DirectChatMessage = {
          id: incomingMsg.id || incomingMsg.tempId,
          sender_id: senderId,
          receiver_id: receiverId,
          encrypted_content: incomingMsg.encryptedContent,
          encryption_iv: incomingMsg.iv,
          encryption_salt: incomingMsg.salt,
          is_encrypted: incomingMsg.isEncrypted,
          created_at: incomingMsg.created_at || incomingMsg.createdAt || new Date().toISOString(),
          plain_content: finalContent, // Store decrypted content here
          mediaUrl: incomingMsg.mediaUrl,
          mediaType: incomingMsg.mediaType,
          client_id: incomingMsg.tempId, // from optimism
          status: "delivered", // Explicitly received by us, so delivered
          sender_profile: incomingMsg.senderName ? {
            name: incomingMsg.senderName,
            username: incomingMsg.senderUsername,
          } : undefined,
        };
        
        // Let the sender know we got it
        if (newMessage.sender_id !== currentUserUuid) {
           socket.emit("message_delivered", { chatId, messageId: newMessage.id });
        }
        
        const merged = [...prev, newMessage];
        return merged.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      });
    };

    const handleMessagePersisted = (ack: { tempId: string, messageId: string, chatId: string, conversationSequence?: number }) => {
       if (ack.chatId === chatId) {
          seenIdsRef.current.add(ack.messageId);
          // FINDING-3 FIX: Advance the gap detector's sequence cursor on the sender's own messages.
          // Without this, the sender's side would not know their own message's sequence, causing
          // false gap detections when the next receive_message arrives.
          if (ack.conversationSequence && ack.conversationSequence > lastKnownSequenceRef.current) {
            lastKnownSequenceRef.current = ack.conversationSequence;
          }
          // Only upgrade status if it was stuck on 'sending', don't override delivery states
          setMessages((prev) => prev.map(m => m.tempId === ack.tempId ? { ...m, id: ack.messageId, status: m.status === 'sending' ? "sent" : m.status } : m));
       }
    };

    const handleMessageDeliveredAck = ({ messageId, chatId: targetChat }: any) => {
       if (targetChat === chatId) {
          setMessages((prev) => prev.map((m) => 
               (m.id === messageId || m.tempId === messageId || m.client_id === messageId) && 
               (m.status === 'sent' || m.status === 'sending') 
                  ? { ...m, status: "delivered" } 
                  : m
          ));
       }
    };

    const handleMessagesSeen = ({ chatId: targetChat, messageIds }: any) => {
       if (targetChat === chatId) {
          setMessages(prev => prev.map(m => messageIds.includes(m.id) || messageIds.includes(m.tempId) || messageIds.includes(m.client_id) ? { ...m, status: "seen" } : m));
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

