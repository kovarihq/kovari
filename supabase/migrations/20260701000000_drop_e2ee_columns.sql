-- Migration: Drop E2EE columns and group encryption keys table
-- Phase 8B: Destructive Database Cleanup

-- 1. Drop existing view and recreate it without E2EE columns
DROP VIEW IF EXISTS public.latest_conversations;

CREATE VIEW public.latest_conversations AS
SELECT DISTINCT ON (
  LEAST(sender_id, receiver_id),
  GREATEST(sender_id, receiver_id)
)
  id,
  sender_id,
  receiver_id,
  created_at,
  client_id,
  media_url,
  media_type,
  read_at,
  message_content,
  migration_version
FROM public.direct_messages
ORDER BY
  LEAST(sender_id, receiver_id),
  GREATEST(sender_id, receiver_id),
  created_at DESC;

-- 2. Drop columns from direct_messages
ALTER TABLE direct_messages 
  DROP COLUMN IF EXISTS encrypted_content,
  DROP COLUMN IF EXISTS encryption_iv,
  DROP COLUMN IF EXISTS encryption_salt,
  DROP COLUMN IF EXISTS is_encrypted;

-- 3. Drop columns from group_messages
ALTER TABLE group_messages 
  DROP COLUMN IF EXISTS encrypted_content,
  DROP COLUMN IF EXISTS encryption_iv,
  DROP COLUMN IF EXISTS encryption_salt,
  DROP COLUMN IF EXISTS is_encrypted;

-- 4. Drop group_encryption_keys table
DROP TABLE IF EXISTS group_encryption_keys CASCADE;

