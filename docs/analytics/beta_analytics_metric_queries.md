# Kovari Beta Analytics Metric Query Layer

This document details the exact SQL query layer definitions, schema specifications, and operational parameters for all closed beta metrics on the Kovari platform. 

All queries default to casting time-series fields into **Indian Standard Time (IST, UTC+05:30)** as the display timezone, aligning daily/weekly cohorts with local business operations. Administrative and founder testing activity is filtered out via anti-joins against `public.admins` to ensure analytics reflect organic beta participants.

---

# User Metrics

## Metric: Total Users

### Purpose
Answers the business question: "What is the total size of the registered beta user pool?"

### Source Tables
- `public.users` (u)
- `public.profiles` (prf)
- `public.admins` (adm)

### Required Fields
- `users.id`
- `users.isDeleted`
- `profiles.user_id`
- `profiles.email`
- `admins.email`

### SQL Query
Soft-deleted users (where `u."isDeleted" = true`) represent accounts deactivated or deleted by the user. They are excluded from active beta metrics to avoid inflating the user pool size.
```sql
SELECT COUNT(DISTINCT u.id) AS total_users
FROM public.users u
WHERE u."isDeleted" = false
  AND u.id NOT IN (
    SELECT DISTINCT usr.id
    FROM public.users usr
    JOIN public.profiles prf ON usr.id = prf.user_id
    JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
  );
```

### Expected Output
```json
{
  "total_users": 15
}
```

### Refresh Strategy
- **Hourly**
- *Reason*: Total user count changes incrementally. Running this query on an hourly cron cache refresh prevents redundant database queries on loading the main dashboard.

### Performance Considerations
- **Expected query cost**: Very low (small index scan on `users` and join on `profiles`/`admins`).
- **Recommended indexes**:
  - `CREATE INDEX idx_users_isDeleted ON public.users("isDeleted");`
  - `CREATE INDEX idx_profiles_user_id_email ON public.profiles(user_id, email);`
- **Aggregation risks**: None during the closed beta phase.
- **Caching recommendations**: Store result in Redis key `cache:analytics:overview:total_users` with a Time-To-Live (TTL) of 1 hour.

### Feasibility
- **Available today**
- *Reasoning*: All referenced tables and fields exist in the database, and the query successfully filters out administrator testing profiles.

---

## Metric: Activated Users

### Purpose
Answers the business question: "How many users have successfully authenticated and transitioned to active status?"

### Source Tables
- `public.users` (u)
- `public.profiles` (prf)
- `public.admins` (adm)

### Required Fields
- `users.id`
- `users.beta_status`
- `users.isDeleted`
- `profiles.user_id`
- `profiles.email`
- `admins.email`

### SQL Query
An account is "Activated" when `users.beta_status` is updated to `'activated'` during the user-sync endpoint execution following successful initial login.
```sql
SELECT COUNT(DISTINCT u.id) AS activated_users
FROM public.users u
WHERE u.beta_status = 'activated' 
  AND u."isDeleted" = false
  AND u.id NOT IN (
    SELECT DISTINCT usr.id
    FROM public.users usr
    JOIN public.profiles prf ON usr.id = prf.user_id
    JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
  );
```

### Expected Output
```json
{
  "activated_users": 14
}
```

### Refresh Strategy
- **Every 15 minutes**
- *Reason*: Provides near real-time updates for tracking cohort onboarding sessions during invitation rollouts.

### Performance Considerations
- **Expected query cost**: Very low.
- **Recommended indexes**:
  - `CREATE INDEX idx_users_beta_status_activated ON public.users(id) WHERE beta_status = 'activated' AND "isDeleted" = false;`
- **Aggregation risks**: None.
- **Caching recommendations**: Cache in Redis key `cache:analytics:overview:activated_users` with a TTL of 15 minutes.

### Feasibility
- **Available today**
- *Reasoning*: Fully supported by existing schema columns.

---

## Metric: Returned Users

### Purpose
Answers the business question: "How many activated users have returned to open the app on a subsequent calendar day?"

### Source Tables
- `public.users` (u)
- `public.profiles` (prf)
- `public.admins` (adm)

### Required Fields
- `users.id`
- `users.beta_status`
- `users.isDeleted`
- `users.activation_date`
- `users.last_seen_at`
- `profiles.user_id`
- `profiles.email`
- `admins.email`

### SQL Query
A user is classified as "Returned" if their last active timestamp falls on a calendar day (local IST timezone) after their activation day.
```sql
SELECT COUNT(DISTINCT u.id) AS returned_users
FROM public.users u
WHERE u.beta_status = 'activated'
  AND u."isDeleted" = false
  AND u.activation_date IS NOT NULL
  AND u.last_seen_at IS NOT NULL
  AND (u.last_seen_at AT TIME ZONE 'Asia/Kolkata')::date > (u.activation_date AT TIME ZONE 'Asia/Kolkata')::date
  AND u.id NOT IN (
    SELECT DISTINCT usr.id
    FROM public.users usr
    JOIN public.profiles prf ON usr.id = prf.user_id
    JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
  );
```

### Expected Output
```json
{
  "returned_users": 0
}
```

### Refresh Strategy
- **Every 15 minutes** (in a fully working telemetry state).
- *Reason*: Aligns with standard dashboard metrics refreshes.

### Performance Considerations
- **Expected query cost**: Low, but relies on casting dates on-the-fly.
- **Recommended indexes**:
  - `CREATE INDEX idx_users_retention_telemetry ON public.users(id, activation_date, last_seen_at) WHERE beta_status = 'activated';`
- **Aggregation risks**: Performing date calculations on large databases can become slow. Casting can be pre-calculated if the table grows to millions of rows.
- **Caching recommendations**: Redis key `cache:analytics:retention:returned_users` with a TTL of 15 minutes.

### Feasibility
- **Available with small changes**
- *Reasoning*: The schema supports the query, but the value is currently **0** for all cohorts because `last_seen_at` is only written once upon signup/sync and is never updated during subsequent app loads or API requests. The query is ready, but telemetry updates in the web middleware are required to make it useful.

---

## Metric: Retention Rate

### Purpose
Answers the business question: "What percentage of activated beta users return to the app on subsequent calendar days?"

### Source Tables
- `public.users` (u)
- `public.profiles` (prf)
- `public.admins` (adm)

### Required Fields
- `users.id`
- `users.beta_status`
- `users.isDeleted`
- `users.activation_date`
- `users.last_seen_at`
- `profiles.user_id`
- `profiles.email`
- `admins.email`

### SQL Query
Calculates overall retention by dividing returned users by total activated users.
```sql
WITH stats AS (
  SELECT 
    COUNT(DISTINCT CASE WHEN u.beta_status = 'activated' AND u."isDeleted" = false THEN u.id END) AS activated_count,
    COUNT(DISTINCT CASE WHEN u.beta_status = 'activated' AND u."isDeleted" = false AND (u.last_seen_at AT TIME ZONE 'Asia/Kolkata')::date > (u.activation_date AT TIME ZONE 'Asia/Kolkata')::date THEN u.id END) AS returned_count
  FROM public.users u
  WHERE u.id NOT IN (
    SELECT DISTINCT usr.id
    FROM public.users usr
    JOIN public.profiles prf ON usr.id = prf.user_id
    JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
  )
)
SELECT 
  activated_count,
  returned_count,
  ROUND(returned_count * 100.0 / NULLIF(activated_count, 0), 2) AS retention_rate_pct
FROM stats;
```

### Expected Output
```json
{
  "activated_count": 14,
  "returned_count": 0,
  "retention_rate_pct": 0.00
}
```

### Refresh Strategy
- **Hourly**
- *Reason*: Does not fluctuate on dynamic request loops. A daily/hourly aggregation task is sufficient.

### Performance Considerations
- **Expected query cost**: Low to Medium.
- **Recommended indexes**:
  - Uses `idx_users_retention_telemetry`.
- **Aggregation risks**: Table scans can occur on `users` if indexes are missing.
- **Caching recommendations**: Redis key `cache:analytics:retention:rate` with a TTL of 1 hour.

### Feasibility
- **Available with small changes**
- *Reasoning*: Requires backend updates to write changes to `last_seen_at` on subsequent user requests before non-zero percentages can be calculated.

---

# Interest Metrics

## Metric: Interests Sent

### Purpose
Answers the business question: "How many matches/interests have been initiated by organic users?"

### Source Tables
- `public.match_interests` (m)
- `public.users` (usr)
- `public.profiles` (prf)
- `public.admins` (adm)

### Required Fields
- `match_interests.id`
- `match_interests.from_user_id`
- `profiles.user_id`
- `profiles.email`
- `admins.email`

### SQL Query
```sql
SELECT COUNT(*) AS total_sent
FROM public.match_interests m
WHERE m.from_user_id NOT IN (
  SELECT DISTINCT usr.id
  FROM public.users usr
  JOIN public.profiles prf ON usr.id = prf.user_id
  JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
);
```

### Expected Output
```json
{
  "total_sent": 5
}
```

### Refresh Strategy
- **Every 5 minutes**
- *Reason*: Directly tracks user-to-user discovery activity on the real-time control dashboard.

### Performance Considerations
- **Expected query cost**: Low.
- **Recommended indexes**:
  - `CREATE INDEX idx_match_interests_from_user ON public.match_interests(from_user_id);`
- **Aggregation risks**: High write rate expected; select count should read from read replicas or cache to avoid locks.
- **Caching recommendations**: Redis key `cache:analytics:interests:sent` with a TTL of 5 minutes.

### Feasibility
- **Available today**
- *Reasoning*: Table structures and rows are fully operational.

---

## Metric: Accepted Interests

### Purpose
Answers the business question: "How many initiated matching requests are mutually accepted?"

### Source Tables
- `public.match_interests` (m)
- `public.users` (usr)
- `public.profiles` (prf)
- `public.admins` (adm)

### Required Fields
- `match_interests.id`
- `match_interests.status`
- `match_interests.from_user_id`
- `match_interests.to_user_id`
- `profiles.user_id`
- `profiles.email`
- `admins.email`

### SQL Query
Accepted interests are defined by the status value `'accepted'`. Both sender and receiver are checked to exclude admins.
```sql
SELECT COUNT(*) AS total_accepted
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
```

### Expected Output
```json
{
  "total_accepted": 0
}
```

### Refresh Strategy
- **Every 5 minutes**
- *Reason*: Acceptance triggers mutual match generation and indicates immediate user conversion.

### Performance Considerations
- **Expected query cost**: Low.
- **Recommended indexes**:
  - `CREATE INDEX idx_match_interests_status_users ON public.match_interests(status, from_user_id, to_user_id);`
- **Aggregation risks**: Table scans if filtering only on status without composite indexing.
- **Caching recommendations**: Redis key `cache:analytics:interests:accepted` with a TTL of 5 minutes.

### Feasibility
- **Available today**
- *Reasoning*: Fully operational.

---

## Metric: Pending Interests

### Purpose
Answers the business question: "How many match requests are currently sitting in user queues waiting for a decision?"

### Source Tables
- `public.match_interests` (m)
- `public.users` (usr)
- `public.profiles` (prf)
- `public.admins` (adm)

### Required Fields
- `match_interests.id`
- `match_interests.status`
- `match_interests.from_user_id`
- `profiles.user_id`
- `profiles.email`
- `admins.email`

### SQL Query
Pending interests represent outstanding requests where `status = 'pending'`.
```sql
SELECT COUNT(*) AS total_pending
FROM public.match_interests m
WHERE m.status = 'pending'
  AND m.from_user_id NOT IN (
    SELECT DISTINCT usr.id
    FROM public.users usr
    JOIN public.profiles prf ON usr.id = prf.user_id
    JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
  );
```

### Expected Output
```json
{
  "total_pending": 5
}
```

### Refresh Strategy
- **Every 5 minutes**
- *Reason*: Measures the growth of unanswered matching requests, highlighting bottlenecks in user engagement.

### Performance Considerations
- **Expected query cost**: Low.
- **Recommended indexes**:
  - Covered by composite index `idx_match_interests_status_users`.
- **Feasibility**: Available today.

---

## Metric: Acceptance Rate

### Purpose
Answers the business question: "What proportion of matching requests are successfully accepted?"

### Source Tables
- `public.match_interests` (m)
- `public.users` (usr)
- `public.profiles` (prf)
- `public.admins` (adm)

### Required Fields
- `match_interests.id`
- `match_interests.status`
- `match_interests.from_user_id`
- `match_interests.to_user_id`
- `profiles.user_id`
- `profiles.email`
- `admins.email`

### SQL Query
Calculates two rate formulas:
1. **Overall Acceptance Rate**: `total_accepted / total_sent` (measures system efficiency).
2. **Decided-Based Acceptance Rate**: `total_accepted / (total_accepted + total_rejected)` (measures selectivity).
```sql
WITH organic_interests AS (
  SELECT status
  FROM public.match_interests m
  WHERE m.from_user_id NOT IN (
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
    )
)
SELECT 
  COUNT(*) AS total_sent,
  COUNT(CASE WHEN status = 'accepted' THEN 1 END) AS total_accepted,
  ROUND(COUNT(CASE WHEN status = 'accepted' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 2) AS acceptance_rate_overall_pct,
  ROUND(COUNT(CASE WHEN status = 'accepted' THEN 1 END) * 100.0 / NULLIF(COUNT(CASE WHEN status IN ('accepted', 'rejected') THEN 1 END), 0), 2) AS acceptance_rate_decided_pct
FROM organic_interests;
```

### Expected Output
```json
{
  "total_sent": 5,
  "total_accepted": 0,
  "acceptance_rate_overall_pct": 0.00,
  "acceptance_rate_decided_pct": null
}
```

### Refresh Strategy
- **Every 15 minutes**
- *Reason*: Aggregate percentage updates do not need real-time calculations.

### Performance Considerations
- **Expected query cost**: Low.
- **Feasibility**: Available today.

---

# Conversation Metrics

## Metric: Conversations Created

### Purpose
Answers the business question: "How many communication channels have been opened between organic beta users?"

### Source Tables
- `public.conversations` (c)
- `public.users` (u)
- `public.profiles` (p)
- `public.admins` (a)

### Required Fields
- `conversations.id`
- `conversations.user_a_id`
- `conversations.user_b_id`
- `profiles.user_id`
- `profiles.email`
- `admins.email`

### SQL Query
Checks that neither conversational partner is an administrator to capture stranger-only conversations.
```sql
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
```

### Expected Output
```json
{
  "stranger_conversations": 0
}
```

### Refresh Strategy
- **Every 5 minutes**
- *Reason*: Measures the active volume of stranger connections successfully generated.

### Performance Considerations
- **Expected query cost**: Low.
- **Recommended indexes**:
  - `CREATE INDEX idx_conversations_participants ON public.conversations(user_a_id, user_b_id);`
- **Feasibility**: Available today.

---

## Metric: Messages Sent

### Purpose
Answers the business question: "What is the total text interaction volume exchanged by organic users?"

### Source Tables
- `public.direct_messages` (d)
- `public.users` (u)
- `public.profiles` (p)
- `public.admins` (a)

### Required Fields
- `direct_messages.id`
- `direct_messages.media_type`
- `direct_messages.sender_id`
- `direct_messages.receiver_id`
- `profiles.user_id`
- `profiles.email`
- `admins.email`

### SQL Query
Excludes initialization messages (where `d.media_type = 'init'`) automatically generated when chat threads are created.
```sql
WITH admin_users AS (
  SELECT DISTINCT u.id AS admin_id
  FROM public.users u
  JOIN public.profiles p ON u.id = p.user_id
  JOIN public.admins a ON LOWER(p.email) = LOWER(a.email)
)
SELECT COUNT(*) AS stranger_messages
FROM public.direct_messages d
WHERE d.media_type IS DISTINCT FROM 'init'
  AND d.sender_id NOT IN (SELECT admin_id FROM admin_users)
  AND d.receiver_id NOT IN (SELECT admin_id FROM admin_users);
```

### Expected Output
```json
{
  "stranger_messages": 0
}
```

### Refresh Strategy
- **Every 5 minutes**
- *Reason*: Directly gauges messaging velocity.

### Performance Considerations
- **Expected query cost**: Medium (highest volume table in the platform).
- **Recommended indexes**:
  - `CREATE INDEX idx_direct_messages_sender_receiver ON public.direct_messages(sender_id, receiver_id) WHERE media_type IS DISTINCT FROM 'init';`
- **Aggregation risks**: Table size grows exponentially with active chatting. Scans will lock write paths if query structures bypass indexes.
- **Caching recommendations**: Redis key `cache:analytics:messages:count` with a TTL of 5 minutes.

### Feasibility
- **Available today**
- *Reasoning*: Columns and tables are fully defined.

---

# Notification Metrics

## Metric: Notifications Created

### Purpose
Answers the business question: "How many total notification triggers are processed by the system?"

### Source Tables
- `public.notifications` (n)
- `public.users` (usr)
- `public.profiles` (prf)
- `public.admins` (adm)

### Required Fields
- `notifications.id`
- `notifications.user_id`
- `profiles.user_id`
- `profiles.email`
- `admins.email`

### SQL Query
```sql
SELECT COUNT(*) AS notifications_created
FROM public.notifications n
WHERE n.user_id NOT IN (
  SELECT DISTINCT usr.id
  FROM public.users usr
  JOIN public.profiles prf ON usr.id = prf.user_id
  JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
);
```

### Expected Output
```json
{
  "notifications_created": 45
}
```

### Refresh Strategy
- **Every 15 minutes**
- *Reason*: System notification pipeline load changes incrementally.

### Performance Considerations
- **Expected query cost**: Low.
- **Recommended indexes**:
  - `CREATE INDEX idx_notifications_user_id ON public.notifications(user_id);`
- **Feasibility**: Available today.

---

## Metric: Notifications Read

### Purpose
Answers the business question: "What is the click/read rate of system notifications by organic users?"

### Source Tables
- `public.notifications` (n)
- `public.users` (usr)
- `public.profiles` (prf)
- `public.admins` (adm)

### Required Fields
- `notifications.id`
- `notifications.is_read`
- `notifications.user_id`
- `profiles.user_id`
- `profiles.email`
- `admins.email`

### SQL Query
Evaluates notifications where the read state (`n.is_read`) is `true`.
```sql
SELECT 
  COUNT(*) AS total_created,
  COUNT(CASE WHEN is_read = true THEN 1 END) AS total_read,
  ROUND(COUNT(CASE WHEN is_read = true THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 2) AS read_rate_pct
FROM public.notifications n
WHERE n.user_id NOT IN (
  SELECT DISTINCT usr.id
  FROM public.users usr
  JOIN public.profiles prf ON usr.id = prf.user_id
  JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
);
```

### Expected Output
```json
{
  "total_created": 45,
  "total_read": 19,
  "read_rate_pct": 42.22
}
```

### Refresh Strategy
- **Every 15 minutes**
- *Reason*: Captures system user attention levels.

### Performance Considerations
- **Expected query cost**: Low.
- **Recommended indexes**:
  - `CREATE INDEX idx_notifications_user_read ON public.notifications(user_id, is_read);`
- **Feasibility**: Available today.

---

## Metric: Push Success

### Purpose
Answers the business question: "What percentage of sent push notifications are successfully accepted by FCM for delivery?"

### Source Tables
- `public.notifications` (n)
- `public.users` (usr)
- `public.profiles` (prf)
- `public.admins` (adm)

### Required Fields
- `notifications.id`
- `notifications.push_attempted_at`
- `notifications.push_status`
- `notifications.user_id`
- `profiles.user_id`
- `profiles.email`
- `admins.email`

### SQL Query
Measures notifications where a push was attempted (`push_attempted_at IS NOT NULL`) and FCM returned status `'delivered'`.
```sql
SELECT 
  COUNT(CASE WHEN push_attempted_at IS NOT NULL THEN 1 END) AS push_attempts,
  COUNT(CASE WHEN push_status = 'delivered' THEN 1 END) AS push_success,
  ROUND(COUNT(CASE WHEN push_status = 'delivered' THEN 1 END) * 100.0 / 
        NULLIF(COUNT(CASE WHEN push_attempted_at IS NOT NULL THEN 1 END), 0), 2) AS push_success_rate_pct
FROM public.notifications n
WHERE n.user_id NOT IN (
  SELECT DISTINCT usr.id
  FROM public.users usr
  JOIN public.profiles prf ON usr.id = prf.user_id
  JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
);
```

### Expected Output
```json
{
  "push_attempts": 20,
  "push_success": 12,
  "push_success_rate_pct": 60.00
}
```

### Refresh Strategy
- **Every 5 minutes**
- *Reason*: Crucial operational metrics for validating system reliability and API keys validity.

### Performance Considerations
- **Expected query cost**: Low.
- **Recommended indexes**:
  - `CREATE INDEX idx_notifications_push_delivered ON public.notifications(push_status) WHERE push_status = 'delivered';`
- **Feasibility**: Available today
- *Reasoning*: Tracked natively inside `public.notifications.push_status` using the FCM callback logging system.

---

## Metric: Push Failure

### Purpose
Answers the business question: "How many push notification dispatches fail with direct FCM api errors?"

### Source Tables
- `public.notifications` (n)
- `public.users` (usr)
- `public.profiles` (prf)
- `public.admins` (adm)

### Required Fields
- `notifications.id`
- `notifications.push_attempted_at`
- `notifications.push_status`
- `notifications.user_id`
- `profiles.user_id`
- `profiles.email`
- `admins.email`

### SQL Query
Measures push attempts resulting in a `'failed'` status.
```sql
SELECT 
  COUNT(CASE WHEN push_attempted_at IS NOT NULL THEN 1 END) AS push_attempts,
  COUNT(CASE WHEN push_status = 'failed' THEN 1 END) AS push_failed,
  ROUND(COUNT(CASE WHEN push_status = 'failed' THEN 1 END) * 100.0 / 
        NULLIF(COUNT(CASE WHEN push_attempted_at IS NOT NULL THEN 1 END), 0), 2) AS push_failure_rate_pct
FROM public.notifications n
WHERE n.user_id NOT IN (
  SELECT DISTINCT usr.id
  FROM public.users usr
  JOIN public.profiles prf ON usr.id = prf.user_id
  JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
);
```

### Expected Output
```json
{
  "push_attempts": 20,
  "push_failed": 3,
  "push_failure_rate_pct": 15.00
}
```

### Refresh Strategy
- **Every 5 minutes**
- *Reason*: Operations alert threshold triggers require high refresh intervals.

### Performance Considerations
- **Expected query cost**: Low.
- **Feasibility**: Available today.

---

## Metric: No Token Count

### Purpose
Answers the business question: "How many activated users who should be receiving push alerts do not have a valid push device token registered?"

### Source Tables
- `public.users` (u)
- `public.fcm_device_tokens` (t)
- `public.profiles` (prf)
- `public.admins` (adm)

### Required Fields
- `users.id`
- `users.beta_status`
- `users.isDeleted`
- `fcm_device_tokens.user_id`
- `profiles.user_id`
- `profiles.email`
- `admins.email`

### SQL Query
Identifies users with `beta_status = 'activated'` who have zero entries in the `fcm_device_tokens` table.
```sql
SELECT COUNT(DISTINCT u.id) AS users_without_token
FROM public.users u
LEFT JOIN public.fcm_device_tokens t ON u.id = t.user_id
WHERE u.beta_status = 'activated'
  AND u."isDeleted" = false
  AND t.user_id IS NULL
  AND u.id NOT IN (
    SELECT DISTINCT usr.id
    FROM public.users usr
    JOIN public.profiles prf ON usr.id = prf.user_id
    JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
  );
```

### Expected Output
```json
{
  "users_without_token": 8
}
```

### Refresh Strategy
- **Hourly**
- *Reason*: Push token registration changes only when a user logs in via a new device or reinstalls the app.

### Performance Considerations
- **Expected query cost**: Low.
- **Recommended indexes**:
  - `CREATE INDEX idx_fcm_tokens_user_id ON public.fcm_device_tokens(user_id);`
- **Assumptions**:
  1. All activated users are expected to have granted push notifications permission on client sign-up.
  2. The presence of at least one row in the `fcm_device_tokens` table represents token registration success.
  3. Banned or soft-deleted profiles are excluded.
- **Feasibility**: Available today.

---

# Cross-Metric Validation

## Metric Dependency Matrix

The table below illustrates dependencies between beta metrics and defines potential operational risks or systemic telemetry gaps.

| Metric | Depends On | Risk Level | Description / Mitigation |
| :--- | :--- | :--- | :--- |
| **Total Users** | `public.users`, `public.profiles`, `public.admins` | Low | Simple count query filtering out admins. |
| **Activated Users** | `public.users`, `public.profiles`, `public.admins` | Low | Resolves users whose sync statuses changed to `'activated'`. |
| **Returned Users** | `public.users`, `public.profiles`, `public.admins` | **High** | **CRITICAL TELEMETRY GAP**: Relies on `users.last_seen_at`. Currently returns **0** for all cohorts because this field is never updated post-registration. |
| **Retention Rate** | **Activated Users**, **Returned Users** | **High** | Inherits Returned Users telemetry gap risk. Calculates to **0.00%** post-signup until middleware updates are deployed. |
| **Interests Sent** | `public.match_interests`, `public.profiles` | Low | Simple aggregation on match signals. |
| **Accepted Interests**| `public.match_interests`, `public.profiles` | Low | Standard counts of mutual acceptance signals. |
| **Pending Interests** | `public.match_interests`, `public.profiles` | Low | Traces unanswered interest bottlenecks. |
| **Acceptance Rate** | **Interests Sent**, **Accepted Interests** | Low | Percentage rates calculation. |
| **Conversations Created**| `public.conversations`, `public.profiles` | Low | Identifies communication channels opened between organic users. |
| **Messages Sent** | `public.direct_messages`, `public.profiles` | **Medium** | Messaging tables grow rapidly. Risk of slow queries if indexes are omitted. |
| **Notifications Created**| `public.notifications`, `public.profiles` | Low | Aggregate count of system alerts. |
| **Notifications Read**| `public.notifications`, `public.profiles` | Low | Read status metrics. |
| **Push Success** | `public.notifications`, `public.profiles` | **Medium** | Measures callback reliability updating notification status to `'delivered'`. |
| **Push Failure** | `public.notifications`, `public.profiles` | **Medium** | Measures callback reliability updating notification status to `'failed'`. |
| **No Token Count** | `public.users`, `public.fcm_device_tokens` | Low | Tracks portion of users who cannot receive push notifications. |

---

# Missing Tracking Assessment

Two core telemetry gaps restrict complete closed-beta dashboard functionality: **session activity tracking** and **Explore tab views clickstream**.

## Missing Data: User Session Activity
- **Impacted Metrics**: DAU, WAU, Returned Users, Retention Rate.
- **Problem**: `users.last_seen_at` is written once at onboarding and never updated.
- **Recommended Table**: No new table. Update `public.users.last_seen_at` in Next.js backend middleware (`apps/web/src/middleware.ts`) upon authenticated API requests.
- **Mitigation**: Throttle database write pressure by saving user active dates to a Redis set and flushing to PostgreSQL once per hour/day.

## Missing Data: Funnel Stage 5 (Explore Screen Views)
- **Impacted Metrics**: Funnel Stage 5 (Explore Viewed) count.
- **Problem**: Moving to Explore feed is client-side only. There is no DB write tracking.
- **Recommended Table**: Create/verify the schema for `public.analytics_events` to log this raw clickstream event:

```sql
CREATE TABLE IF NOT EXISTS public.analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    event_name VARCHAR(255) NOT NULL,
    event_data JSONB DEFAULT '{}'::jsonb NOT NULL,
    session_id VARCHAR(255) NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON public.analytics_events(event_name);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON public.analytics_events(user_id);
```

### Recommended Event Names to Instrument
- **`user_logged_in`**: Emitted when active token validation completes.
- **`profile_completed`**: Emitted when onboarding is finalized.
- **`explore_viewed`**: Emitted when mounting the Explore tab layout (solves Funnel Stage 5 gap).
- **`match_created`**: Emitted when mutual acceptance matches occur.
- **`message_sent`**: Emitted when text message is written.
- **`notification_clicked`**: Emitted when client opens notification banners.
- **`feedback_submitted`**: Emitted when bugs/requests are sent.

---

# Query Optimization Recommendations

## Required Indexes
```sql
-- Speed up soft-delete exclusions
CREATE INDEX IF NOT EXISTS idx_users_active_filter 
ON public.users(id) 
WHERE "isDeleted" = false AND beta_status = 'activated';

-- Speed up timezone-based retention queries
CREATE INDEX IF NOT EXISTS idx_users_retention_dates 
ON public.users(id, activation_date, last_seen_at) 
WHERE "isDeleted" = false AND beta_status = 'activated';

-- Speed up matching query lookups
CREATE INDEX IF NOT EXISTS idx_match_interests_state_users
ON public.match_interests(status, from_user_id, to_user_id);

-- Speed up push notifications health breakdowns
CREATE INDEX IF NOT EXISTS idx_notifications_push_observability 
ON public.notifications(push_status) 
WHERE push_status IS NOT NULL;

-- Speed up message volume counts
CREATE INDEX IF NOT EXISTS idx_direct_messages_sender_receiver 
ON public.direct_messages(sender_id, receiver_id) 
WHERE media_type IS DISTINCT FROM 'init';
```

## Potential Materialized Views
Cohort retention calculations (D1/D7/D30 daily and weekly retention) require heavy date joins. It is highly recommended to construct a Materialized View for these summaries:
```sql
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_daily_retention_summary AS
WITH cohorts AS (
  SELECT 
    id AS user_id,
    (activation_date AT TIME ZONE 'Asia/Kolkata')::date AS cohort_date
  FROM public.users u
  WHERE u.beta_status = 'activated' AND u."isDeleted" = false
),
user_activity AS (
  SELECT 
    id AS user_id,
    (last_seen_at AT TIME ZONE 'Asia/Kolkata')::date AS activity_date
  FROM public.users
)
SELECT 
  c.cohort_date,
  COUNT(DISTINCT c.user_id) AS cohort_size,
  COUNT(DISTINCT CASE WHEN ua.activity_date = c.cohort_date + INTERVAL '1 day' THEN c.user_id END) AS day_1_retained,
  COUNT(DISTINCT CASE WHEN ua.activity_date = c.cohort_date + INTERVAL '7 days' THEN c.user_id END) AS day_7_retained
FROM cohorts c
LEFT JOIN user_activity ua ON c.user_id = ua.user_id
GROUP BY c.cohort_date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_retention_cohort ON public.mv_daily_retention_summary(cohort_date);
```
*Cache Strategy*: Execute `REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_daily_retention_summary` hourly via pg_cron.

## Cache Strategy
- **Overview Dashboard counts**: Cache dynamically in Redis key `cache:analytics:overview` for 15 minutes.
- **Engagement charts data**: Cache dynamically in Redis key `cache:analytics:engagement` for 1 hour.
- **Materialized Views**: Refresh hourly; client API requests read straight from the Materialized View.

---

# Final Readiness Assessment

| Metric | Query Ready | Needs Tracking | Production Ready | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Total Users** | **Yes** | No | **Yes** | Query performs fast, ready to fetch. |
| **Activated Users** | **Yes** | No | **Yes** | Fully supported. |
| **Returned Users** | **Yes** | **Yes** | **No** | Requires middleware updates to log user sessions in `last_seen_at`. |
| **Retention Rate** | **Yes** | **Yes** | **No** | Blocked by Returned Users telemetry gap. |
| **Interests Sent** | **Yes** | No | **Yes** | Fully supported. |
| **Accepted Interests**| **Yes** | No | **Yes** | Fully supported. |
| **Pending Interests** | **Yes** | No | **Yes** | Fully supported. |
| **Acceptance Rate** | **Yes** | No | **Yes** | Fully supported. |
| **Conversations Created**| **Yes** | No | **Yes** | Fully supported. |
| **Messages Sent** | **Yes** | No | **Yes** | Fully supported. Composite index recommended. |
| **Notifications Created**| **Yes** | No | **Yes** | Fully supported. |
| **Notifications Read**| **Yes** | No | **Yes** | Fully supported. |
| **Push Success** | **Yes** | No | **Yes** | Fully supported. |
| **Push Failure** | **Yes** | No | **Yes** | Fully supported. |
| **No Token Count** | **Yes** | No | **Yes** | Fully supported. |

### Summary
- **Total metrics fully supported**: 13 out of 15 metrics.
- **Metrics requiring minor changes**: 0.
- **Metrics requiring new tracking / telemetry updates**: 2 (Returned Users, Retention Rate).
- **Blockers**: Updating the authenticated request middleware to persist `last_seen_at` updates to the database. Without this, retention rates remain at 0%.
