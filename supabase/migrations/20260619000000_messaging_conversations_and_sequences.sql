-- 1. Create conversations table
CREATE TABLE IF NOT EXISTS public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    user_b_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT check_sorted_participants CHECK (user_a_id < user_b_id),
    UNIQUE (user_a_id, user_b_id)
);

-- 2. Add conversation_id FK, conversation_sequence, and global_sequence to direct_messages
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE;
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS conversation_sequence BIGINT;
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS global_sequence BIGINT;

-- 3. Add conversation_sequence and global_sequence to group_messages
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS conversation_sequence BIGINT;
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS global_sequence BIGINT;

-- 4. Create global sequence generator
CREATE SEQUENCE IF NOT EXISTS public.message_global_seq;

-- 5. Set default global_sequence to use generator
ALTER TABLE public.direct_messages ALTER COLUMN global_sequence SET DEFAULT nextval('public.message_global_seq');
ALTER TABLE public.group_messages ALTER COLUMN global_sequence SET DEFAULT nextval('public.message_global_seq');

-- 6. Generate one conversation row per unique user pair and backfill conversation_id in direct_messages
INSERT INTO public.conversations (user_a_id, user_b_id)
SELECT DISTINCT LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id)
FROM public.direct_messages
ON CONFLICT (user_a_id, user_b_id) DO NOTHING;

UPDATE public.direct_messages dm
SET conversation_id = c.id
FROM public.conversations c
WHERE LEAST(dm.sender_id, dm.receiver_id) = c.user_a_id
  AND GREATEST(dm.sender_id, dm.receiver_id) = c.user_b_id;

-- Drop constraints temporarily to prevent intermediate constraint violations during the backfill update process
ALTER TABLE public.direct_messages DROP CONSTRAINT IF EXISTS uq_direct_messages_conv_seq;
ALTER TABLE public.group_messages DROP CONSTRAINT IF EXISTS uq_group_messages_seq;

-- 7. Backfill conversation_sequence and global_sequence for existing messages
WITH dm_seq AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY created_at ASC) as conv_seq,
         ROW_NUMBER() OVER (ORDER BY created_at ASC) as glob_seq
  FROM public.direct_messages
)
UPDATE public.direct_messages dm
SET conversation_sequence = dm_seq.conv_seq,
    global_sequence = dm_seq.glob_seq
FROM dm_seq
WHERE dm.id = dm_seq.id;

WITH gm_seq AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY group_id ORDER BY created_at ASC) as conv_seq,
         ROW_NUMBER() OVER (ORDER BY created_at ASC) as glob_seq
  FROM public.group_messages
)
UPDATE public.group_messages gm
SET conversation_sequence = gm_seq.conv_seq,
    global_sequence = gm_seq.glob_seq
FROM gm_seq
WHERE gm.id = gm_seq.id;

-- 8. Create BEFORE INSERT triggers to automatically populate conversation_sequence
CREATE OR REPLACE FUNCTION public.set_direct_message_sequence()
RETURNS TRIGGER AS $$
BEGIN
  -- Acquire an advisory transaction lock based on the conversation ID hash to serialize concurrent inserts
  PERFORM pg_advisory_xact_lock(hashtext(NEW.conversation_id::text));

  IF NEW.conversation_sequence IS NULL THEN
    NEW.conversation_sequence := COALESCE(
      (SELECT MAX(conversation_sequence) FROM public.direct_messages WHERE conversation_id = NEW.conversation_id),
      0
    ) + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_direct_messages_seq
BEFORE INSERT ON public.direct_messages
FOR EACH ROW
EXECUTE FUNCTION public.set_direct_message_sequence();

CREATE OR REPLACE FUNCTION public.set_group_message_sequence()
RETURNS TRIGGER AS $$
BEGIN
  -- Acquire an advisory transaction lock based on the group ID hash to serialize concurrent inserts
  PERFORM pg_advisory_xact_lock(hashtext(NEW.group_id::text));

  IF NEW.conversation_sequence IS NULL THEN
    NEW.conversation_sequence := COALESCE(
      (SELECT MAX(conversation_sequence) FROM public.group_messages WHERE group_id = NEW.group_id),
      0
    ) + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_group_messages_seq
BEFORE INSERT ON public.group_messages
FOR EACH ROW
EXECUTE FUNCTION public.set_group_message_sequence();

-- 9. Add Indexes & UNIQUE Constraints
CREATE UNIQUE INDEX IF NOT EXISTS idx_direct_messages_conv_seq ON public.direct_messages (conversation_id, conversation_sequence);
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_messages_seq ON public.group_messages (group_id, conversation_sequence);

-- Enforce database-level uniqueness constraints on sequences
ALTER TABLE public.direct_messages DROP CONSTRAINT IF EXISTS uq_direct_messages_conv_seq;
ALTER TABLE public.direct_messages ADD CONSTRAINT uq_direct_messages_conv_seq UNIQUE USING INDEX idx_direct_messages_conv_seq;

ALTER TABLE public.group_messages DROP CONSTRAINT IF EXISTS uq_group_messages_seq;
ALTER TABLE public.group_messages ADD CONSTRAINT uq_group_messages_seq UNIQUE USING INDEX idx_group_messages_seq;

