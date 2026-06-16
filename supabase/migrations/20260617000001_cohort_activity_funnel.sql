-- ============================================================
-- Cohort Tracking & Activity Monitoring
-- Adds beta_batch to waitlist + users, last_seen_at to users
-- ============================================================

-- 1. Cohort tracking on waitlist
-- waitlist.beta_batch = SOURCE OF TRUTH — set when admin sends invites
ALTER TABLE public.waitlist
  ADD COLUMN IF NOT EXISTS beta_batch VARCHAR(100);

-- 2. Cohort tracking on users
-- users.beta_batch = CACHED COPY — propagated from waitlist on activation (sync-user)
-- Exists separately to enable fast admin queries without joining waitlist every time
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS beta_batch VARCHAR(100);

-- 3. Activity tracking on users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE;

-- 4. Performance indexes
CREATE INDEX IF NOT EXISTS idx_waitlist_beta_batch ON public.waitlist(beta_batch);
CREATE INDEX IF NOT EXISTS idx_users_beta_batch ON public.users(beta_batch);
CREATE INDEX IF NOT EXISTS idx_users_last_seen_at ON public.users(last_seen_at DESC);
