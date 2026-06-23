-- ==============================================================================
-- KOVARI BETA ANALYTICS V1 - PRODUCTION SQL QUERIES (PostgreSQL)
-- ==============================================================================
-- This file contains all queries for the admin.kovari.in dashboard.
-- Default display timezone for all time-based metrics is IST (UTC+05:30).
-- All queries filter out developer/admin accounts (Priyansh, Navneet, Kanav)
-- via anti-joins against public.admins to reflect only organic beta users.
-- ==============================================================================

-- ==============================================================================
-- 🚨 CRITICAL TELEMETRY WARNING: RETENTION METRICS NON-FUNCTIONAL
-- ==============================================================================
-- Codebase audit reveals that last_seen_at is ONLY set once during signup sync
-- and is never updated on subsequent app sessions. Therefore, DAU, WAU, 
-- Returned Users, and Cohort Retention queries will return 0 (or decline to 0) 
-- until a backend patch is applied to update last_seen_at on user activity.
-- ==============================================================================


-- ==============================================================================
-- 1. ACTIVATION FUNNEL
-- ==============================================================================

-- Funnel Stage 1: Invited Users (Excluding Admins/Founders)
SELECT COUNT(DISTINCT email) AS count
FROM public.waitlist
WHERE status IN ('beta_invited', 'beta_active')
  AND LOWER(email) NOT IN (
    SELECT LOWER(email) FROM public.admins
  );

-- Funnel Stage 2: Activated Users (Excluding Admins/Founders)
SELECT COUNT(DISTINCT u.id) AS count
FROM public.users u
WHERE u.beta_status = 'activated' 
  AND u."isDeleted" = false
  AND u.id NOT IN (
    SELECT DISTINCT usr.id
    FROM public.users usr
    JOIN public.profiles prf ON usr.id = prf.user_id
    JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
  );

-- Funnel Stage 3: Onboarding Completed (Excluding Admins/Founders)
SELECT COUNT(DISTINCT u.id) AS count
FROM public.users u
WHERE u.onboarding_completed = true 
  AND u.beta_status = 'activated'
  AND u."isDeleted" = false
  AND u.id NOT IN (
    SELECT DISTINCT usr.id
    FROM public.users usr
    JOIN public.profiles prf ON usr.id = prf.user_id
    JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
  );

-- Funnel Stage 4: Travel Intent Added (Excluding Admins/Founders)
SELECT COUNT(DISTINCT p.user_id) AS count
FROM public.profiles p
JOIN public.users u ON p.user_id = u.id
WHERE u.beta_status = 'activated'
  AND u."isDeleted" = false
  AND p.travel_intentions IS NOT NULL 
  AND jsonb_array_length(p.travel_intentions) > 0
  AND u.id NOT IN (
    SELECT DISTINCT usr.id
    FROM public.users usr
    JOIN public.profiles prf ON usr.id = prf.user_id
    JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
  );

-- Funnel Stage 5: Explore Viewed (🔴 Missing Data: Requires Instrumentation)
-- Recommended query structure tracking organic views in audit logs:
SELECT COUNT(DISTINCT actor_id) AS count
FROM public.audit_logs
WHERE action = 'EXPLORE_VIEWED'
  AND actor_id NOT IN (
    SELECT DISTINCT usr.id
    FROM public.users usr
    JOIN public.profiles prf ON usr.id = prf.user_id
    JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
  );

-- Funnel Stage 6: Interest Sent (Excluding Admins/Founders)
SELECT COUNT(DISTINCT from_user_id) AS count
FROM public.match_interests
WHERE from_user_id NOT IN (
  SELECT DISTINCT usr.id
  FROM public.users usr
  JOIN public.profiles prf ON usr.id = prf.user_id
  JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
);

-- Funnel Stage 7: Interest Accepted (Excluding Admins/Founders)
SELECT COUNT(*) AS count
FROM public.match_interests m
WHERE m.status = 'accepted'
  AND m.from_user_id NOT IN (
    SELECT DISTINCT usr.id
    FROM public.users usr
    JOIN public.profiles prf ON usr.id = prf.user_id
    JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
  )
  AND m.to_user_id NOT IN (
    SELECT DISTINCT usr.id
    FROM public.users usr
    JOIN public.profiles prf ON usr.id = prf.user_id
    JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
  );

-- Funnel Stage 8: Conversation Started (Stranger/Organic Chats only)
WITH admin_users AS (
  SELECT DISTINCT u.id AS admin_id
  FROM public.users u
  JOIN public.profiles p ON u.id = p.user_id
  JOIN public.admins a ON LOWER(p.email) = LOWER(a.email)
)
SELECT COUNT(*) AS count
FROM public.conversations c
WHERE c.user_a_id NOT IN (SELECT admin_id FROM admin_users)
  AND c.user_b_id NOT IN (SELECT admin_id FROM admin_users);

-- Funnel Stage 9: Messages Sent (Stranger/Organic Messages only)
WITH admin_users AS (
  SELECT DISTINCT u.id AS admin_id
  FROM public.users u
  JOIN public.profiles p ON u.id = p.user_id
  JOIN public.admins a ON LOWER(p.email) = LOWER(a.email)
)
SELECT COUNT(*) AS count
FROM public.direct_messages d
WHERE d.media_type IS DISTINCT FROM 'init'
  AND d.sender_id NOT IN (SELECT admin_id FROM admin_users)
  AND d.receiver_id NOT IN (SELECT admin_id FROM admin_users);


-- ==============================================================================
-- 2. RETENTION (IST Default Timezone)
-- ==============================================================================

-- Metric: Daily Active Users (DAU - IST default timezone, excluding admins)
SELECT COUNT(DISTINCT u.id) AS dau
FROM public.users u
WHERE u.beta_status = 'activated'
  AND u."isDeleted" = false
  AND u.last_seen_at AT TIME ZONE 'Asia/Kolkata' >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
  AND u.id NOT IN (
    SELECT DISTINCT usr.id
    FROM public.users usr
    JOIN public.profiles prf ON usr.id = prf.user_id
    JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
  );
  -- Note: To query in UTC instead, use:
  -- AND last_seen_at >= CURRENT_DATE;

-- Metric: Weekly Active Users (WAU - excluding admins)
SELECT COUNT(DISTINCT u.id) AS wau
FROM public.users u
WHERE u.beta_status = 'activated'
  AND u."isDeleted" = false
  AND u.last_seen_at >= NOW() - INTERVAL '7 days'
  AND u.id NOT IN (
    SELECT DISTINCT usr.id
    FROM public.users usr
    JOIN public.profiles prf ON usr.id = prf.user_id
    JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
  );

-- Metric: Dormant Users (Active waitlist, not seen in 7d, excluding admins)
SELECT COUNT(*) AS count
FROM public.users u
WHERE u.beta_status = 'activated'
  AND u."isDeleted" = false
  AND (u.last_seen_at IS NULL OR u.last_seen_at < NOW() - INTERVAL '7 days')
  AND u.id NOT IN (
    SELECT DISTINCT usr.id
    FROM public.users usr
    JOIN public.profiles prf ON usr.id = prf.user_id
    JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
  );

-- Metric: Returned Users (Seen on calendar day after activation day, excluding admins)
SELECT COUNT(*) AS count
FROM public.users u
WHERE u.beta_status = 'activated'
  AND u."isDeleted" = false
  AND (u.last_seen_at AT TIME ZONE 'Asia/Kolkata')::date > (u.activation_date AT TIME ZONE 'Asia/Kolkata')::date
  AND u.id NOT IN (
    SELECT DISTINCT usr.id
    FROM public.users usr
    JOIN public.profiles prf ON usr.id = prf.user_id
    JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
  );

-- Metric: D1 / D7 / D30 Daily Cohort Retention Rates (excluding admins)
WITH cohorts AS (
  SELECT 
    id AS user_id,
    (activation_date AT TIME ZONE 'Asia/Kolkata')::date AS cohort_date
  FROM public.users u
  WHERE u.beta_status = 'activated'
    AND u."isDeleted" = false
    AND u.activation_date IS NOT NULL
    AND u.id NOT IN (
      SELECT DISTINCT usr.id
      FROM public.users usr
      JOIN public.profiles prf ON usr.id = prf.user_id
      JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
    )
),
user_activity AS (
  SELECT 
    id AS user_id,
    (last_seen_at AT TIME ZONE 'Asia/Kolkata')::date AS activity_date
  FROM public.users
  WHERE last_seen_at IS NOT NULL
)
SELECT 
  c.cohort_date,
  COUNT(DISTINCT c.user_id) AS cohort_size,
  COUNT(DISTINCT CASE WHEN ua.activity_date = c.cohort_date + INTERVAL '1 day' THEN c.user_id END) AS day_1_retained,
  ROUND(COUNT(DISTINCT CASE WHEN ua.activity_date = c.cohort_date + INTERVAL '1 day' THEN c.user_id END) * 100.0 / COUNT(DISTINCT c.user_id), 2) AS day_1_retention_pct,
  COUNT(DISTINCT CASE WHEN ua.activity_date = c.cohort_date + INTERVAL '7 days' THEN c.user_id END) AS day_7_retained,
  ROUND(COUNT(DISTINCT CASE WHEN ua.activity_date = c.cohort_date + INTERVAL '7 days' THEN c.user_id END) * 100.0 / COUNT(DISTINCT c.user_id), 2) AS day_7_retention_pct,
  COUNT(DISTINCT CASE WHEN ua.activity_date = c.cohort_date + INTERVAL '30 days' THEN c.user_id END) AS day_30_retained,
  ROUND(COUNT(DISTINCT CASE WHEN ua.activity_date = c.cohort_date + INTERVAL '30 days' THEN c.user_id END) * 100.0 / COUNT(DISTINCT c.user_id), 2) AS day_30_retention_pct
FROM cohorts c
LEFT JOIN user_activity ua ON c.user_id = ua.user_id
GROUP BY c.cohort_date
ORDER BY c.cohort_date DESC;

-- Metric: W1 / W2 / W3 / W4 Weekly Cohort Retention Rates (excluding admins)
WITH cohorts AS (
  SELECT 
    id AS user_id,
    DATE_TRUNC('week', activation_date AT TIME ZONE 'Asia/Kolkata')::date AS cohort_week
  FROM public.users u
  WHERE u.beta_status = 'activated'
    AND u."isDeleted" = false
    AND u.activation_date IS NOT NULL
    AND u.id NOT IN (
      SELECT DISTINCT usr.id
      FROM public.users usr
      JOIN public.profiles prf ON usr.id = prf.user_id
      JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
    )
),
user_activity AS (
  SELECT 
    id AS user_id,
    DATE_TRUNC('week', last_seen_at AT TIME ZONE 'Asia/Kolkata')::date AS activity_week
  FROM public.users
  WHERE last_seen_at IS NOT NULL
)
SELECT 
  c.cohort_week,
  COUNT(DISTINCT c.user_id) AS cohort_size,
  -- Week 1 Retention
  COUNT(DISTINCT CASE WHEN ua.activity_week = c.cohort_week + INTERVAL '7 days' THEN c.user_id END) AS week_1_retained,
  ROUND(COUNT(DISTINCT CASE WHEN ua.activity_week = c.cohort_week + INTERVAL '7 days' THEN c.user_id END) * 100.0 / COUNT(DISTINCT c.user_id), 2) AS week_1_retention_pct,
  -- Week 2 Retention
  COUNT(DISTINCT CASE WHEN ua.activity_week = c.cohort_week + INTERVAL '14 days' THEN c.user_id END) AS week_2_retained,
  ROUND(COUNT(DISTINCT CASE WHEN ua.activity_week = c.cohort_week + INTERVAL '14 days' THEN c.user_id END) * 100.0 / COUNT(DISTINCT c.user_id), 2) AS week_2_retention_pct,
  -- Week 3 Retention
  COUNT(DISTINCT CASE WHEN ua.activity_week = c.cohort_week + INTERVAL '21 days' THEN c.user_id END) AS week_3_retained,
  ROUND(COUNT(DISTINCT CASE WHEN ua.activity_week = c.cohort_week + INTERVAL '21 days' THEN c.user_id END) * 100.0 / COUNT(DISTINCT c.user_id), 2) AS week_3_retention_pct,
  -- Week 4 Retention
  COUNT(DISTINCT CASE WHEN ua.activity_week = c.cohort_week + INTERVAL '28 days' THEN c.user_id END) AS week_4_retained,
  ROUND(COUNT(DISTINCT CASE WHEN ua.activity_week = c.cohort_week + INTERVAL '28 days' THEN c.user_id END) * 100.0 / COUNT(DISTINCT c.user_id), 2) AS week_4_retention_pct
FROM cohorts c
LEFT JOIN user_activity ua ON c.user_id = ua.user_id
GROUP BY c.cohort_week
ORDER BY c.cohort_week DESC;

-- Metric: Return Rate Trends (excluding admins)
SELECT 
  (last_seen_at AT TIME ZONE 'Asia/Kolkata')::date AS active_day,
  COUNT(DISTINCT u.id) AS active_users
FROM public.users u
WHERE u.beta_status = 'activated'
  AND u."isDeleted" = false
  AND u.last_seen_at IS NOT NULL
  AND u.id NOT IN (
    SELECT DISTINCT usr.id
    FROM public.users usr
    JOIN public.profiles prf ON usr.id = prf.user_id
    JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
  )
GROUP BY 1
ORDER BY 1 DESC;


-- ==============================================================================
-- 3. NOTIFICATIONS (Excluding admin test notifications)
-- ==============================================================================

-- Helper CTE for organic user IDs
WITH organic_users AS (
  SELECT DISTINCT usr.id AS user_id
  FROM public.users usr
  EXCEPT
  SELECT DISTINCT u.id
  FROM public.users u
  JOIN public.profiles p ON u.id = p.user_id
  JOIN public.admins a ON LOWER(p.email) = LOWER(a.email)
)

-- Metric: Notifications Created
SELECT COUNT(*) AS total_created
FROM public.notifications n
WHERE n.user_id IN (SELECT user_id FROM organic_users);

-- Metric: Notifications Read Rate
WITH organic_users AS (
  SELECT DISTINCT usr.id AS user_id
  FROM public.users usr
  EXCEPT
  SELECT DISTINCT u.id
  FROM public.users u
  JOIN public.profiles p ON u.id = p.user_id
  JOIN public.admins a ON LOWER(p.email) = LOWER(a.email)
)
SELECT 
  COUNT(CASE WHEN is_read = true THEN 1 END) AS total_read,
  ROUND(COUNT(CASE WHEN is_read = true THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 2) AS read_rate_pct
FROM public.notifications n
WHERE n.user_id IN (SELECT user_id FROM organic_users);

-- Metric: Push Attempted
WITH organic_users AS (
  SELECT DISTINCT usr.id AS user_id
  FROM public.users usr
  EXCEPT
  SELECT DISTINCT u.id
  FROM public.users u
  JOIN public.profiles p ON u.id = p.user_id
  JOIN public.admins a ON LOWER(p.email) = LOWER(a.email)
)
SELECT COUNT(*) AS total_attempted
FROM public.notifications n
WHERE n.push_attempted_at IS NOT NULL
  AND n.user_id IN (SELECT user_id FROM organic_users);

-- Metric: Push Success (Delivered to >=1 device)
WITH organic_users AS (
  SELECT DISTINCT usr.id AS user_id
  FROM public.users usr
  EXCEPT
  SELECT DISTINCT u.id
  FROM public.users u
  JOIN public.profiles p ON u.id = p.user_id
  JOIN public.admins a ON LOWER(p.email) = LOWER(a.email)
)
SELECT 
  COUNT(*) AS total_success,
  ROUND(COUNT(*) * 100.0 / NULLIF(COUNT(CASE WHEN push_attempted_at IS NOT NULL THEN 1 END), 0), 2) AS success_rate_pct
FROM public.notifications n
WHERE n.push_status = 'delivered'
  AND n.user_id IN (SELECT user_id FROM organic_users);

-- Metric: Push Failure (Error from FCM)
WITH organic_users AS (
  SELECT DISTINCT usr.id AS user_id
  FROM public.users usr
  EXCEPT
  SELECT DISTINCT u.id
  FROM public.users u
  JOIN public.profiles p ON u.id = p.user_id
  JOIN public.admins a ON LOWER(p.email) = LOWER(a.email)
)
SELECT 
  COUNT(*) AS total_failed,
  ROUND(COUNT(*) * 100.0 / NULLIF(COUNT(CASE WHEN push_attempted_at IS NOT NULL THEN 1 END), 0), 2) AS failure_rate_pct
FROM public.notifications n
WHERE n.push_status = 'failed'
  AND n.user_id IN (SELECT user_id FROM organic_users);

-- Metric: No Token (User has no registered token)
WITH organic_users AS (
  SELECT DISTINCT usr.id AS user_id
  FROM public.users usr
  EXCEPT
  SELECT DISTINCT u.id
  FROM public.users u
  JOIN public.profiles p ON u.id = p.user_id
  JOIN public.admins a ON LOWER(p.email) = LOWER(a.email)
)
SELECT COUNT(*) AS total_no_token
FROM public.notifications n
WHERE n.push_status = 'no_token'
  AND n.user_id IN (SELECT user_id FROM organic_users);

-- Deep Dive: No Token Impact & Affected Users Analysis
WITH organic_users AS (
  SELECT DISTINCT usr.id AS user_id
  FROM public.users usr
  EXCEPT
  SELECT DISTINCT u.id
  FROM public.users u
  JOIN public.profiles p ON u.id = p.user_id
  JOIN public.admins a ON LOWER(p.email) = LOWER(a.email)
)
SELECT 
  COUNT(CASE WHEN push_status = 'no_token' THEN 1 END) AS no_token_notifications,
  ROUND(COUNT(CASE WHEN push_status = 'no_token' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 2) AS no_token_rate_pct,
  COUNT(DISTINCT CASE WHEN push_status = 'no_token' THEN n.user_id END) AS affected_users_count
FROM public.notifications n
WHERE n.user_id IN (SELECT user_id FROM organic_users);

-- Ongoing Monitoring: No Token Delivery Failure Rate (Last 24 Hours)
WITH organic_users AS (
  SELECT DISTINCT usr.id AS user_id
  FROM public.users usr
  EXCEPT
  SELECT DISTINCT u.id
  FROM public.users u
  JOIN public.profiles p ON u.id = p.user_id
  JOIN public.admins a ON LOWER(p.email) = LOWER(a.email)
)
SELECT 
  COUNT(*) AS total_notifications_last_24h,
  COUNT(CASE WHEN push_status = 'no_token' THEN 1 END) AS no_token_last_24h,
  ROUND(COUNT(CASE WHEN push_status = 'no_token' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 2) AS no_token_rate_last_24h_pct
FROM public.notifications n
WHERE n.created_at >= NOW() - INTERVAL '24 hours'
  AND n.user_id IN (SELECT user_id FROM organic_users);


-- ==============================================================================
-- 4. INTEREST FUNNEL (Excluding admin interactions)
-- ==============================================================================

-- Helper CTE for organic user IDs
WITH organic_users AS (
  SELECT DISTINCT usr.id AS user_id
  FROM public.users usr
  EXCEPT
  SELECT DISTINCT u.id
  FROM public.users u
  JOIN public.profiles p ON u.id = p.user_id
  JOIN public.admins a ON LOWER(p.email) = LOWER(a.email)
)

-- Metric: Interests Sent
SELECT COUNT(*) AS total_sent
FROM public.match_interests m
WHERE m.from_user_id IN (SELECT user_id FROM organic_users);

-- Metric: Pending Interests
WITH organic_users AS (
  SELECT DISTINCT usr.id AS user_id
  FROM public.users usr
  EXCEPT
  SELECT DISTINCT u.id
  FROM public.users u
  JOIN public.profiles p ON u.id = p.user_id
  JOIN public.admins a ON LOWER(p.email) = LOWER(a.email)
)
SELECT COUNT(*) AS total_pending
FROM public.match_interests m
WHERE m.status = 'pending'
  AND m.from_user_id IN (SELECT user_id FROM organic_users);

-- Metric: Accepted Interests
WITH organic_users AS (
  SELECT DISTINCT usr.id AS user_id
  FROM public.users usr
  EXCEPT
  SELECT DISTINCT u.id
  FROM public.users u
  JOIN public.profiles p ON u.id = p.user_id
  JOIN public.admins a ON LOWER(p.email) = LOWER(a.email)
)
SELECT COUNT(*) AS total_accepted
FROM public.match_interests m
WHERE m.status = 'accepted'
  AND m.from_user_id IN (SELECT user_id FROM organic_users)
  AND m.to_user_id IN (SELECT user_id FROM organic_users);

-- Metric: Rejected Interests
WITH organic_users AS (
  SELECT DISTINCT usr.id AS user_id
  FROM public.users usr
  EXCEPT
  SELECT DISTINCT u.id
  FROM public.users u
  JOIN public.profiles p ON u.id = p.user_id
  JOIN public.admins a ON LOWER(p.email) = LOWER(a.email)
)
SELECT COUNT(*) AS total_rejected
FROM public.match_interests m
WHERE m.status = 'rejected'
  AND m.from_user_id IN (SELECT user_id FROM organic_users);

-- Metric: Acceptance Rate (Decided-based and Overall, organic matches only)
WITH organic_users AS (
  SELECT DISTINCT usr.id AS user_id
  FROM public.users usr
  EXCEPT
  SELECT DISTINCT u.id
  FROM public.users u
  JOIN public.profiles p ON u.id = p.user_id
  JOIN public.admins a ON LOWER(p.email) = LOWER(a.email)
)
SELECT 
  ROUND(COUNT(CASE WHEN status = 'accepted' THEN 1 END) * 100.0 / 
        NULLIF(COUNT(CASE WHEN status IN ('accepted', 'rejected') THEN 1 END), 0), 2) AS acceptance_rate_decided_pct,
  ROUND(COUNT(CASE WHEN status = 'accepted' THEN 1 END) * 100.0 / 
        NULLIF(COUNT(*), 0), 2) AS acceptance_rate_overall_pct
FROM public.match_interests m
WHERE m.from_user_id IN (SELECT user_id FROM organic_users)
  AND m.to_user_id IN (SELECT user_id FROM organic_users);

-- Metric: Average Pending Age (Measuring the Beta Match Bottleneck for organic users)
WITH organic_users AS (
  SELECT DISTINCT usr.id AS user_id
  FROM public.users usr
  EXCEPT
  SELECT DISTINCT u.id
  FROM public.users u
  JOIN public.profiles p ON u.id = p.user_id
  JOIN public.admins a ON LOWER(p.email) = LOWER(a.email)
)
SELECT 
  AVG(NOW() - created_at) AS avg_pending_age,
  ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600.0)::numeric, 1) AS avg_pending_age_hours,
  ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400.0)::numeric, 1) AS avg_pending_age_days
FROM public.match_interests m
WHERE m.status = 'pending'
  AND m.from_user_id IN (SELECT user_id FROM organic_users);


-- ==============================================================================
-- 5. MESSAGING
-- ==============================================================================

-- Metric: Total Conversations (All conversations)
SELECT COUNT(*) AS total_conversations
FROM public.conversations;

-- Metric: Total Messages (excluding 'init' messages, all chats)
SELECT COUNT(*) AS total_messages
FROM public.direct_messages
WHERE media_type IS DISTINCT FROM 'init';

-- Metric: Messages Per Conversation (average, all chats)
SELECT 
  AVG(COALESCE(msg_count, 0))::numeric(10,2) AS avg_messages_per_conversation
FROM public.conversations c
LEFT JOIN (
  SELECT conversation_id, COUNT(*) AS msg_count
  FROM public.direct_messages
  WHERE media_type IS DISTINCT FROM 'init'
  GROUP BY conversation_id
) m ON c.id = m.conversation_id;

-- Metric: Active Conversations (chats with messages in last 7 days)
SELECT COUNT(DISTINCT conversation_id) AS active_conversations
FROM public.direct_messages
WHERE media_type IS DISTINCT FROM 'init'
  AND created_at >= NOW() - INTERVAL '7 days';

-- Metric: Stranger Conversations (Organic beta user conversations, no admins involved)
WITH admin_users AS (
  SELECT DISTINCT u.id AS admin_id
  FROM public.users u
  JOIN public.profiles p ON u.id = p.user_id
  JOIN public.admins a ON LOWER(p.email) = LOWER(a.email)
)
SELECT COUNT(*) AS stranger_conversations
FROM public.conversations c
WHERE c.user_a_id NOT IN (SELECT admin_id FROM admin_users)
  AND c.user_b_id NOT IN (SELECT admin_id FROM admin_users);

-- Metric: Founder Conversations (Admin-testing conversations, at least one admin involved)
WITH admin_users AS (
  SELECT DISTINCT u.id AS admin_id
  FROM public.users u
  JOIN public.profiles p ON u.id = p.user_id
  JOIN public.admins a ON LOWER(p.email) = LOWER(a.email)
)
SELECT COUNT(*) AS founder_conversations
FROM public.conversations c
WHERE c.user_a_id IN (SELECT admin_id FROM admin_users)
   OR c.user_b_id IN (SELECT admin_id FROM admin_users);
