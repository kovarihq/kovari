# Beta Retention Metrics Specification

This document defines the metrics and SQL queries for measuring user retention, activity, and return trends during the closed beta.

> [!CAUTION]
> **CRITICAL TELEMETRY GAP — Retention Metrics Currently Non-Functional**:
> Codebase audit reveals that `last_seen_at` is only updated **once during signup/onboarding** (inside `/api/supabase/sync-user/route.ts`). There is no middleware, hook, or API endpoint that updates `last_seen_at` during subsequent user sessions or requests.
>
> **Impact on Metrics**: 
> * **Returned Users** will always return **0** after their registration date.
> * **DAU** will only count users on the day they register.
> * **WAU** will decline to 0 after 7 days post-cohort signup.
> * **Dormant Users** will reach **100%** after 7 days for all users.
> * **Retention rates (D1/D7/D30 and Weekly)** will always be **0%** starting from Day 1/Week 1.
>
> **Required Engineering Fix for Priyansh**:
> To make these retention metrics functional, the backend must update `last_seen_at` upon user activity. Recommend either:
> 1. Updating `last_seen_at` in the Next.js `middleware.ts` whenever an authenticated request occurs (throttled to once per hour/day to limit DB writes).
> 2. Triggering a periodic "session heartbeat" event from the client application.

---

## Timezone Storage Confirmation
The `last_seen_at` column is stored as `TIMESTAMP WITH TIME ZONE` (TIMESTAMPTZ) in Supabase and normalized to **UTC** internally. 

For the admin dashboard, **Indian Standard Time (IST, UTC+05:30)** is set as the single default display and metric timezone. All time-sensitive queries in this specification explicitly cast UTC timestamps using `AT TIME ZONE 'Asia/Kolkata'` to ensure local daily and weekly calendar boundaries align perfectly with local business operations. UTC-alternative clauses are kept only inside query comments.

---

## Developer & Admin Filtering
To ensure that all P0/P1 retention metrics reflect only **organic beta users**, all queries below filter out administrative and founder accounts (e.g. Priyansh, Navneet, Kanav) whose emails are registered in the `public.admins` table.

---

## Retention Metrics Definitions

### 1. Daily Active Users (DAU)
* **Definition**: The count of unique activated users who had activity on a specific day (default timezone: IST, excluding admins).
* **SQL Query (IST)**:
  ```sql
  SELECT COUNT(DISTINCT u.id) AS dau
  FROM public.users u
  WHERE u.beta_status = 'activated'
    AND u."isDeleted" = false
    -- Cast UTC last_seen_at to IST to match local calendar day boundaries
    AND u.last_seen_at AT TIME ZONE 'Asia/Kolkata' >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
    -- Exclude admins/founders
    AND u.id NOT IN (
      SELECT DISTINCT usr.id
      FROM public.users usr
      JOIN public.profiles prf ON usr.id = prf.user_id
      JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
    );
    -- Note: To query in UTC instead, use: AND last_seen_at >= CURRENT_DATE;
  ```

### 2. Weekly Active Users (WAU)
* **Definition**: The count of unique activated users who had activity within the last 7 days (excluding admins).
* **SQL Query**:
  ```sql
  SELECT COUNT(DISTINCT u.id) AS wau
  FROM public.users u
  WHERE u.beta_status = 'activated'
    AND u."isDeleted" = false
    AND u.last_seen_at >= NOW() - INTERVAL '7 days'
    -- Exclude admins/founders
    AND u.id NOT IN (
      SELECT DISTINCT usr.id
      FROM public.users usr
      JOIN public.profiles prf ON usr.id = prf.user_id
      JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
    );
  ```

### 3. Dormant Users
* **Definition**: Users who have activated their account but have not been seen in the past 7 days (excluding admins).
* **SQL Query**:
  ```sql
  SELECT COUNT(*) AS count
  FROM public.users u
  WHERE u.beta_status = 'activated'
    AND u."isDeleted" = false
    AND (u.last_seen_at IS NULL OR u.last_seen_at < NOW() - INTERVAL '7 days')
    -- Exclude admins/founders
    AND u.id NOT IN (
      SELECT DISTINCT usr.id
      FROM public.users usr
      JOIN public.profiles prf ON usr.id = prf.user_id
      JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
    );
  ```

### 4. Returned Users
* **Definition**: Activated users who have active session events (`last_seen_at`) on a calendar day *after* their initial activation day (excluding admins).
* **SQL Query (IST-Aware)**:
  ```sql
  SELECT COUNT(*) AS count
  FROM public.users u
  WHERE u.beta_status = 'activated'
    AND u."isDeleted" = false
    AND (u.last_seen_at AT TIME ZONE 'Asia/Kolkata')::date > (u.activation_date AT TIME ZONE 'Asia/Kolkata')::date
    -- Exclude admins/founders
    AND u.id NOT IN (
      SELECT DISTINCT usr.id
      FROM public.users usr
      JOIN public.profiles prf ON usr.id = prf.user_id
      JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
    );
  ```

### 5. Retention Percentage (D1 / D7 / D30 Daily Cohorts)
* **Definition Formula**:
  $$\text{Retention Day } N \% = \frac{\text{Unique users activated in Cohort } C \text{ who were active on Day } N \text{ post-activation}}{\text{Total unique users in Cohort } C} \times 100$$
* **SQL Query (D1/D7/D30 Daily Cohort Retention)**:
  This query calculates daily cohort retention, excluding admin testing profiles.
  ```sql
  WITH cohorts AS (
    SELECT 
      id AS user_id,
      (activation_date AT TIME ZONE 'Asia/Kolkata')::date AS cohort_date
    FROM public.users u
    WHERE u.beta_status = 'activated'
      AND u."isDeleted" = false
      AND u.activation_date IS NOT NULL
      -- Exclude admins/founders
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
    -- Day 1 Retention
    COUNT(DISTINCT CASE WHEN ua.activity_date = c.cohort_date + INTERVAL '1 day' THEN c.user_id END) AS day_1_retained,
    ROUND(COUNT(DISTINCT CASE WHEN ua.activity_date = c.cohort_date + INTERVAL '1 day' THEN c.user_id END) * 100.0 / COUNT(DISTINCT c.user_id), 2) AS day_1_retention_pct,
    -- Day 7 Retention
    COUNT(DISTINCT CASE WHEN ua.activity_date = c.cohort_date + INTERVAL '7 days' THEN c.user_id END) AS day_7_retained,
    ROUND(COUNT(DISTINCT CASE WHEN ua.activity_date = c.cohort_date + INTERVAL '7 days' THEN c.user_id END) * 100.0 / COUNT(DISTINCT c.user_id), 2) AS day_7_retention_pct,
    -- Day 30 Retention
    COUNT(DISTINCT CASE WHEN ua.activity_date = c.cohort_date + INTERVAL '30 days' THEN c.user_id END) AS day_30_retained,
    ROUND(COUNT(DISTINCT CASE WHEN ua.activity_date = c.cohort_date + INTERVAL '30 days' THEN c.user_id END) * 100.0 / COUNT(DISTINCT c.user_id), 2) AS day_30_retention_pct
  FROM cohorts c
  LEFT JOIN user_activity ua ON c.user_id = ua.user_id
  GROUP BY c.cohort_date
  ORDER BY c.cohort_date DESC;
  ```

### 6. Weekly Cohort Retention Rates (W1 / W2 / W3 / W4)
* **Definition Formula**:
  $$\text{Weekly Retention Week } N \% = \frac{\text{Unique users activated in Cohort Week } C \text{ who were active in Week } N \text{ post-activation}}{\text{Total unique users in Cohort Week } C} \times 100$$
* **SQL Query (W1/W2/W3/W4 Weekly Cohort Retention)**:
  This query groups users by their activation week and tracks subsequent weekly active retention consecutively, excluding admin testing profiles.
  ```sql
  WITH cohorts AS (
    SELECT 
      id AS user_id,
      DATE_TRUNC('week', activation_date AT TIME ZONE 'Asia/Kolkata')::date AS cohort_week
    FROM public.users u
    WHERE u.beta_status = 'activated'
      AND u."isDeleted" = false
      AND u.activation_date IS NOT NULL
      -- Exclude admins/founders
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
  ```

### 7. Return Rate Trends
* **Definition**: Trend of user logins/active sessions grouped by day (excluding admins).
* **SQL Query (IST)**:
  ```sql
  SELECT 
    (last_seen_at AT TIME ZONE 'Asia/Kolkata')::date AS active_day,
    COUNT(DISTINCT u.id) AS active_users
  FROM public.users u
  WHERE u.beta_status = 'activated'
    AND u."isDeleted" = false
    AND u.last_seen_at IS NOT NULL
    -- Exclude admins/founders
    AND u.id NOT IN (
      SELECT DISTINCT usr.id
      FROM public.users usr
      JOIN public.profiles prf ON usr.id = prf.user_id
      JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
    )
  GROUP BY 1
  ORDER BY 1 DESC;
  ```
