-- 1. Create the Inbox Deduplication View
CREATE OR REPLACE VIEW public.latest_conversations AS
SELECT DISTINCT ON (
  LEAST(sender_id, receiver_id),
  GREATEST(sender_id, receiver_id)
)
  id,
  sender_id,
  receiver_id,
  encrypted_content,
  encryption_iv,
  encryption_salt,
  is_encrypted,
  created_at,
  client_id,
  media_url,
  media_type,
  read_at
FROM public.direct_messages
ORDER BY
  LEAST(sender_id, receiver_id),
  GREATEST(sender_id, receiver_id),
  created_at DESC;

-- 2. Add Functional Index to optimize the Inbox Deduplication View
CREATE INDEX IF NOT EXISTS idx_direct_messages_least_greatest
ON public.direct_messages (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id), created_at DESC);

-- 3. Add Composite Index on direct_messages for conversation searches between Me and Partner
CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation 
ON public.direct_messages (sender_id, receiver_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_direct_messages_conversation_reverse 
ON public.direct_messages (receiver_id, sender_id, created_at DESC);

-- 4. Add Index on users table for Clerk ID mapping speedups
CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id 
ON public.users (clerk_user_id);

-- 5. Add Composite Index on user_follows to speed up joins/counts
CREATE INDEX IF NOT EXISTS idx_user_follows_following_follower 
ON public.user_follows (following_id, follower_id);

CREATE INDEX IF NOT EXISTS idx_user_follows_follower_following 
ON public.user_follows (follower_id, following_id);

-- 6. Add Index on notifications for unread queries
CREATE INDEX IF NOT EXISTS idx_notifications_unread 
ON public.notifications (user_id, is_read, created_at DESC);
