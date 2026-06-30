-- Additive schema migration for Phase 1 of E2EE removal
-- Safety profile: Non-breaking, purely additive. Does not drop or modify constraints, triggers, indexes, or RLS policies.

-- 1. Expand direct_messages table
ALTER TABLE public.direct_messages 
ADD COLUMN IF NOT EXISTS message_content TEXT NULL,
ADD COLUMN IF NOT EXISTS migration_version SMALLINT NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.direct_messages.message_content IS 
'Plaintext message body introduced during the E2EE migration process.';

COMMENT ON COLUMN public.direct_messages.migration_version IS 
'Migration phase code. 1 = Legacy Encrypted, 2 = Dual Read/Write, 3 = Plaintext Only.';

-- 2. Expand group_messages table
ALTER TABLE public.group_messages 
ADD COLUMN IF NOT EXISTS message_content TEXT NULL,
ADD COLUMN IF NOT EXISTS migration_version SMALLINT NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.group_messages.message_content IS 
'Plaintext message body introduced during the E2EE migration process.';

COMMENT ON COLUMN public.group_messages.migration_version IS 
'Migration phase code. 1 = Legacy Encrypted, 2 = Dual Read/Write, 3 = Plaintext Only.';

-- 3. Extend latest_conversations view preserving its exact original query structure, filters, and sorts
-- NOTE: New columns (message_content, migration_version) MUST be appended AFTER all existing columns.
-- PostgreSQL's CREATE OR REPLACE VIEW cannot reorder or insert into the middle of the column list.
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
  read_at,
  message_content,
  migration_version
FROM public.direct_messages
ORDER BY
  LEAST(sender_id, receiver_id),
  GREATEST(sender_id, receiver_id),
  created_at DESC;
