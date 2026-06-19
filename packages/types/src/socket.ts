export interface ServerToClientEvents {
  receive_message: (message: any) => void;
  user_online: (payload: { chatId: string; userId: string; supabaseId?: string | null }) => void;
  user_offline: (payload: { chatId: string; userId: string; supabaseId?: string | null; lastSeen?: string | null }) => void;
  message_persisted: (payload: { 
    tempId: string; 
    messageId: string; 
    chatId: string;
    conversationSequence: number;
    serverSequence: number;
  }) => void;
  
  // UX Features (Server -> Client)
  user_typing: (payload: { chatId: string; userId: string }) => void;
  user_stopped_typing: (payload: { chatId: string; userId: string }) => void;
  messages_seen: (payload: { 
    chatId: string; 
    messageIds: string[]; 
    userId?: string; 
    isFullySeen?: boolean;
    lastSeenSequence?: number;
  }) => void;
  message_delivered_ack: (payload: { chatId: string; messageId: string; userId: string; conversationSequence?: number }) => void;
  user_last_seen: (payload: { userId: string; lastSeen: string | null }) => void;

  // Gap Recovery
  gap_found: (payload: { chatId: string; fromSequence: number; toSequence: number }) => void;

  // Notifications
  new_notification: (payload: {
    type: string;
    title: string;
    message: string;
    chatId: string;
    created_at: string;
    image_url?: string;
  }) => void;
  unread_update: (payload: { count: number }) => void;
  error: (payload: { message: string; code?: string }) => void;
}

export interface ClientToServerEvents {
  join_chat: (payload: { chatId: string; lastKnownSequence?: number }) => void;
  leave_chat: (payload: { chatId: string }) => void;
  send_message: (
    payload: { chatId: string; message: any },
    callback?: (response: { 
      status: string; 
      error?: string;
      messageId?: string;
      conversationSequence?: number;
      serverSequence?: number;
    }) => void
  ) => void;

  // UX Features (Client -> Server)
  typing_start: (payload: { chatId: string }) => void;
  typing_stop: (payload: { chatId: string }) => void;
  mark_seen: (payload: { chatId: string; messageIds: string[]; lastSeenSequence?: number }) => void;
  message_delivered: (payload: { chatId: string; messageId: string }) => void;
  get_last_seen: (payload: { userId: string }, callback: (lastSeen: string | null) => void) => void;
  
  // Recovery
  request_gap_fill: (
    payload: { chatId: string; fromSequence: number; toSequence: number },
    callback?: (response: {
      status: string;
      messages?: any[];
      error?: string;
    }) => void
  ) => void;
}

export interface InterServerEvents {}

export interface SocketData {
  userId: string;
  supabaseId?: string | null;
  deviceId?: string;
  sessionId?: string;
}

