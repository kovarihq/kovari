import { useEffect, useState, useCallback } from "react";
import { createClient } from "@kovari/api/client";
import { hydrateMessageContent } from "@/services/messaging/messageHydrator";

export interface DirectMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  encrypted_content?: string;
  encryption_iv?: string;
  encryption_salt?: string;
  is_encrypted?: boolean;
  created_at: string;
}

interface UseDirectMessagesResult {
  messages: DirectMessage[];
  loading: boolean;
  refetch: () => Promise<void>;
}

export const useDirectMessages = (
  currentUserUuid: string,
  partnerUuid: string
): UseDirectMessagesResult => {
  // Always call all hooks
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const supabase = createClient();

  // For demo: derive a shared secret from both UUIDs (in production, use a secure key exchange)
  const sharedSecret =
    currentUserUuid < partnerUuid
      ? `${currentUserUuid}:${partnerUuid}`
      : `${partnerUuid}:${currentUserUuid}`;

  const fetchMessages = useCallback(async () => {
    if (!currentUserUuid || !partnerUuid) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const orFilter = `and(sender_id.eq.${currentUserUuid},receiver_id.eq.${partnerUuid}),and(sender_id.eq.${partnerUuid},receiver_id.eq.${currentUserUuid})`;
    try {
      const { data, error } = await supabase
        .from("direct_messages")
        .select("*")
        .or(orFilter)
        .order("created_at", { ascending: true });
      if (error) {
        console.error("[useDirectMessages] Supabase error:", error);
      }
      if (!error && data) {
        const decrypted = data.map((msg: any) => {
          const hydration = hydrateMessageContent(
            {
              message_content: msg.message_content,
              migration_version: msg.migration_version,
            }
          );

          return {
            ...msg,
            plain_content: hydration.content,
          };
        });
        setMessages(decrypted);
      }
    } catch (err) {
      console.error("[useDirectMessages] Exception during fetch:", err);
    } finally {
      setLoading(false);
    }
  }, [currentUserUuid, partnerUuid, supabase, sharedSecret]);

  useEffect(() => {
    if (!currentUserUuid || !partnerUuid) return;
    fetchMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserUuid, partnerUuid]);

  useEffect(() => {
    if (!currentUserUuid || !partnerUuid) return;
    const channel = supabase
      .channel("direct_messages")
      .on(
        "postgres_changes" as any,
        { event: "INSERT", schema: "public", table: "direct_messages" },
        (payload: any) => {
          const msg = payload.new as DirectMessage;
          // Only add if it's for this chat
          const isRelevant =
            (msg.sender_id === currentUserUuid &&
              msg.receiver_id === partnerUuid) ||
            (msg.sender_id === partnerUuid &&
              msg.receiver_id === currentUserUuid);
          if (!isRelevant) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            // Ensure all are DirectMessage
            return [...prev, msg] as DirectMessage[];
          });
        }
      )
      .on(
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "direct_messages" },
        fetchMessages
      )
      .on(
        "postgres_changes" as any,
        { event: "DELETE", schema: "public", table: "direct_messages" },
        fetchMessages
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserUuid, partnerUuid, fetchMessages, supabase]);

  // Return empty state if UUIDs are not set
  if (!currentUserUuid || !partnerUuid) {
    return {
      messages: [],
      loading: true,
      refetch: async () => {},
    };
  }

  return {
    messages,
    loading,
    refetch: fetchMessages,
  };
};

