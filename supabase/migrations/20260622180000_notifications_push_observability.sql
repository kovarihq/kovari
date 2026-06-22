-- ============================================================
-- Phase 11.6.3 — Push Delivery Observability
-- Adds push_attempted_at and push_status to the notifications
-- table for beta debugging visibility.
-- ============================================================

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS push_attempted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS push_status TEXT NULL
    CONSTRAINT chk_push_status CHECK (
      push_status IN (
        'delivered',
        'suppressed',
        'no_token',
        'failed',
        'skipped_low_priority'
      )
    );

COMMENT ON COLUMN public.notifications.push_attempted_at IS
  'Timestamp when FCM push dispatch was attempted. NULL means push was never attempted (e.g. notification created before FCM integration, or evaluatePushNotifications was skipped for low priority).';

COMMENT ON COLUMN public.notifications.push_status IS
  'FCM push delivery outcome for beta observability.
   delivered           = FCM accepted ≥1 token — notification reached the device
   suppressed          = user was online and in the target chat room — push correctly skipped
   no_token            = user has no registered FCM device token
   failed              = FCM returned an error on all registered tokens
   skipped_low_priority = notification priority too low to warrant a push';

-- Index for quick observability queries:
--   "show me all failed pushes in the last 24h"
--   "show me suppressed notifications for user X"
CREATE INDEX IF NOT EXISTS idx_notifications_push_status
  ON public.notifications (push_status, push_attempted_at DESC)
  WHERE push_status IS NOT NULL;
