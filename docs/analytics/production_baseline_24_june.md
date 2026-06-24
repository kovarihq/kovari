# Production Baseline — June 24, 2026

This document records the authoritative production baseline metrics for the Kovari closed beta as of June 24, 2026. All metrics are run directly against the production database bypassing RLS (via the Supabase SQL Editor).

---

## User Metrics

### 1. Total Users
* **Current Value**: `16`
* **SQL Query**:
  ```sql
  SELECT COUNT(DISTINCT u.id) AS count
  FROM public.users u
  WHERE u."isDeleted" = false
    AND u.id NOT IN (
      SELECT DISTINCT usr.id
      FROM public.users usr
      LEFT JOIN public.profiles prf ON usr.id = prf.user_id
      JOIN public.admins adm ON LOWER(COALESCE(prf.email, usr.email)) = LOWER(adm.email)
    );
  ```
* **Comparison to Audit**: The audit baseline was `15 Total Users`. Today's live count is `16`.
* **Explanation of Discrepancy**: One organic user (`yashsabne39@gmail.com`) registered on June 18, 2026, but is currently in the waitlist stage (`beta_status = 'not_invited'`). They are not yet activated, explaining why Total Users is 16 while Activated Users is 15.

### 2. Activated Users
* **Current Value**: `15`
* **SQL Query**:
  ```sql
  SELECT COUNT(DISTINCT u.id) AS count
  FROM public.users u
  WHERE u.beta_status = 'activated' 
    AND u."isDeleted" = false
    AND u.id NOT IN (
      SELECT DISTINCT usr.id
      FROM public.users usr
      LEFT JOIN public.profiles prf ON usr.id = prf.user_id
      JOIN public.admins adm ON LOWER(COALESCE(prf.email, usr.email)) = LOWER(adm.email)
    );
  ```
* **Comparison to Audit**: Matches the audit baseline of `15` (excluding admins).
* **Verification Status**: **VERIFIED**

### 3. Returned Users
* **Current Value**: `0`
* **SQL Query**:
  ```sql
  SELECT COUNT(*) AS count
  FROM public.users u
  WHERE u.beta_status = 'activated'
    AND u."isDeleted" = false
    AND (u.last_seen_at AT TIME ZONE 'Asia/Kolkata')::date > (u.activation_date AT TIME ZONE 'Asia/Kolkata')::date
    AND u.id NOT IN (
      SELECT DISTINCT usr.id
      FROM public.users usr
      LEFT JOIN public.profiles prf ON usr.id = prf.user_id
      JOIN public.admins adm ON LOWER(COALESCE(prf.email, usr.email)) = LOWER(adm.email)
    );
  ```
* **Comparison to Audit**: The audit baseline reported `2 Returned Users`. Today's live count is `0`.
* **CRITICAL TELEMETRY GAP / NON-FUNCTIONAL METRIC**:
  > [!CAUTION]
  > Codebase analysis reveals that `last_seen_at` is only updated **once during signup/onboarding** (inside `/api/supabase/sync-user/route.ts`). There is no middleware, hook, or API endpoint that updates `last_seen_at` during subsequent sessions or requests.
  >
  > Because `last_seen_at` and `activation_date` are written at the exact same moment during signup, the session time difference is under 1 second (209ms to 782ms) for all users. Consequently, **no user can ever trigger the calendar-day return check**.
  >
  > This is a **live backend telemetry gap**, not a staging reset. DAU, WAU, Returned Users, and Cohort Retention metrics are currently **non-functional** until a backend patch is applied to update `last_seen_at` on active requests.

### 4. Dormant Users
* **Current Value**: `4` (Users activated and not seen in the last 7 days, as of June 24)
* **SQL Query**:
  ```sql
  SELECT COUNT(*) AS count
  FROM public.users u
  WHERE u.beta_status = 'activated'
    AND u."isDeleted" = false
    AND (u.last_seen_at IS NULL OR u.last_seen_at < NOW() - INTERVAL '7 days')
    AND u.id NOT IN (
      SELECT DISTINCT usr.id
      FROM public.users usr
      LEFT JOIN public.profiles prf ON usr.id = prf.user_id
      JOIN public.admins adm ON LOWER(COALESCE(prf.email, usr.email)) = LOWER(adm.email)
    );
  ```
* **Status**: **NON-FUNCTIONAL**. Because of the telemetry gap, this count will automatically tick up to 100% of the cohort (15 users) exactly 7 days after their signup dates, regardless of actual app usage.

### 5. Return Rate Trends (Daily Active Users)
* **Current Value**: `0` (except for users signing up on that day)
* **SQL Query**:
  ```sql
  SELECT 
    (u.last_seen_at AT TIME ZONE 'Asia/Kolkata')::date AS active_day,
    COUNT(DISTINCT u.id) AS active_users
  FROM public.users u
  WHERE u.beta_status = 'activated'
    AND u."isDeleted" = false
    AND u.id NOT IN (
      SELECT DISTINCT usr.id
      FROM public.users usr
      LEFT JOIN public.profiles prf ON usr.id = prf.user_id
      JOIN public.admins adm ON LOWER(COALESCE(prf.email, usr.email)) = LOWER(adm.email)
    )
  GROUP BY 1
  ORDER BY 1 DESC;
  ```
* **Status**: **NON-FUNCTIONAL**. Due to the telemetry gap, this query only lists users on the exact calendar day they completed their registration sync.

---

## Travel Intent Metrics

### 6. Travel Intention Completion %
* **Current Value**: `53.85%` (7 Completed / 13 Profiles)
* **SQL Query**:
  ```sql
  SELECT 
    COUNT(DISTINCT p.user_id) AS total_profiles,
    COUNT(DISTINCT CASE WHEN p.travel_intentions IS NOT NULL AND jsonb_array_length(p.travel_intentions) > 0 THEN p.user_id END) AS completed,
    ROUND(COUNT(DISTINCT CASE WHEN p.travel_intentions IS NOT NULL AND jsonb_array_length(p.travel_intentions) > 0 THEN p.user_id END) * 100.0 / NULLIF(COUNT(DISTINCT p.user_id), 0), 2) AS completion_pct
  FROM public.profiles p
  JOIN public.users u ON p.user_id = u.id
  WHERE u.beta_status = 'activated'
    AND u."isDeleted" = false
    AND u.id NOT IN (
      SELECT DISTINCT usr.id
      FROM public.users usr
      LEFT JOIN public.profiles prf ON usr.id = prf.user_id
      JOIN public.admins adm ON LOWER(COALESCE(prf.email, usr.email)) = LOWER(adm.email)
    );
  ```
* **Comparison to Audit**: The audit baseline did not track the specific travel intention completion percentage, but documented that the JSONB column works.
* **Verification Status**: **VERIFIED**

---

## Interest Funnel Metrics

### 7. Interests Sent
* **Current Value**: `16` total rows sent by organic users
* **SQL Query**:
  ```sql
  SELECT COUNT(*) AS count
  FROM public.match_interests m
  WHERE m.from_user_id NOT IN (
    SELECT DISTINCT usr.id
    FROM public.users usr
    LEFT JOIN public.profiles prf ON usr.id = prf.user_id
    JOIN public.admins adm ON LOWER(COALESCE(prf.email, usr.email)) = LOWER(adm.email)
  );
  ```
* **Comparison to Audit**: The audit baseline recorded `5 Stranger Interests Sent`.
* **Explanation of Discrepancy (Critical Measurement Finding)**: 
  1. The table contains `unique_pairs = 34`, which matches the total row count. There are **no duplicate destination entries** per user pair.
  2. Interest timeline queries confirm that **all 16 interests were sent on June 17, 18, and 19**. No new interests have been sent since.
  3. Because 100% of these 16 interests predate the June 23 audit, **the audit's "5 sent" figure was a measurement undercount/filtering mismatch** (e.g. only counting unique organic senders or organic-to-organic pending rows), and **not** a sign of subsequent user matching activity or app growth.
  4. The 16 organic interests break down into **9** sent to admins (and accepted during testing) and **7** sent to other organic users (which are all pending).

### 8. Pending Interests
* **Current Value**: `7` (All 7 are organic-to-organic)
* **SQL Query**:
  ```sql
  SELECT COUNT(*) AS count
  FROM public.match_interests m
  WHERE m.status = 'pending'
    AND m.from_user_id NOT IN (
      SELECT DISTINCT usr.id
      FROM public.users usr
      LEFT JOIN public.profiles prf ON usr.id = prf.user_id
      JOIN public.admins adm ON LOWER(COALESCE(prf.email, usr.email)) = LOWER(adm.email)
    );
  ```
* **Verification Status**: **VERIFIED**

### 9. Accepted Interests
* **Current Value**: `0` organic-to-organic (stranger), `9` organic-to-admin
* **SQL Query (Stranger Accepted - P0 Dashboard Metric)**:
  ```sql
  SELECT COUNT(*) AS count
  FROM public.match_interests m
  WHERE m.status = 'accepted'
    AND m.from_user_id NOT IN (
      SELECT DISTINCT usr.id FROM public.users usr
      LEFT JOIN public.profiles prf ON usr.id = prf.user_id
      JOIN public.admins adm ON LOWER(COALESCE(prf.email, usr.email)) = LOWER(adm.email)
    )
    AND m.to_user_id NOT IN (
      SELECT DISTINCT usr.id FROM public.users usr
      LEFT JOIN public.profiles prf ON usr.id = prf.user_id
      JOIN public.admins adm ON LOWER(COALESCE(prf.email, usr.email)) = LOWER(adm.email)
    );
  ```
* **Authoritative Database Breakdown (All 34 Match Interest Records)**:
  Below is the complete breakdown of all 34 interest records in the database, verifying the exact sender and receiver splits:
  
  | Status | Sender Type | Receiver Type | Count | Description |
  | :--- | :---: | :---: | :---: | :--- |
  | **accepted** | `admin` | `admin` | **6** | Developer-to-developer test matches |
  | **accepted** | `admin` | `organic` | **3** | Admin sent, organic accepted |
  | **accepted** | `organic` | `admin` | **9** | Organic sent, admin accepted during testing |
  | **accepted** | `organic` | `organic` | **0** | Stranger-only accepted matches |
  | **pending** | `admin` | `admin` | **0** | Pending admin test matches |
  | **pending** | `admin` | `organic` | **9** | Admin sent to organic, awaiting decision |
  | **pending** | `organic` | `admin` | **0** | Organic sent to admin, awaiting decision |
  | **pending** | `organic` | `organic` | **7** | Stranger-only pending matches |

* **Verification Status**: **VERIFIED** 

### 10. Rejected Interests
* **Current Value**: `0`
* **SQL Query**:
  ```sql
  SELECT COUNT(*) AS count
  FROM public.match_interests m
  WHERE m.status = 'rejected'
    AND m.from_user_id NOT IN (
      SELECT DISTINCT usr.id
      FROM public.users usr
      LEFT JOIN public.profiles prf ON usr.id = prf.user_id
      JOIN public.admins adm ON LOWER(COALESCE(prf.email, usr.email)) = LOWER(adm.email)
    );
  ```
* **Data Quality Issue**: There are **0 rejected interests** in the entire database. Every interest sent in the system remains indefinitely pending or is accepted. This confirms that users do not decline matches, causing an infinite match accumulation bottleneck.

### 11. Acceptance Rate
* **Current Value**: 
  * **Stranger-Only (Organic-to-Organic)**: `0.00%` (0 Accepted / 0 Decided)
  * **Overall (Including Admin Testing)**: `56.25%` (9 Accepted / 16 Sent)
* **Definition**: We define the P0 dashboard headline **Acceptance Rate** strictly as the **Stranger-Only Acceptance Rate (0%)** since this represents true product engagement. The Overall Acceptance Rate (56.25%) will be shown as a secondary administrative test metric.
* **SQL Query (Stranger-Only)**:
  ```sql
  WITH organic_users AS (
    SELECT id FROM public.users
    WHERE id NOT IN (
      SELECT DISTINCT usr.id FROM public.users usr
      LEFT JOIN public.profiles prf ON usr.id = prf.user_id
      JOIN public.admins adm ON LOWER(COALESCE(prf.email, usr.email)) = LOWER(adm.email)
    ) AND "isDeleted" = false
  )
  SELECT 
    ROUND(COUNT(CASE WHEN status = 'accepted' THEN 1 END) * 100.0 / 
          NULLIF(COUNT(CASE WHEN status IN ('accepted', 'rejected') THEN 1 END), 0), 2) AS stranger_acceptance_rate_pct
  FROM public.match_interests m
  WHERE m.from_user_id IN (SELECT id FROM organic_users)
    AND m.to_user_id IN (SELECT id FROM organic_users);
  ```

---

## Notification Metrics

### 12. Notifications Created
* **Current Value**: `26`
* **SQL Query**:
  ```sql
  SELECT COUNT(*) AS count
  FROM public.notifications n
  WHERE n.user_id NOT IN (
    SELECT DISTINCT usr.id
    FROM public.users usr
    LEFT JOIN public.profiles prf ON usr.id = prf.user_id
    JOIN public.admins adm ON LOWER(COALESCE(prf.email, usr.email)) = LOWER(adm.email)
  );
  ```

### 13. Notifications Read
* **Current Value**: `2`
* **SQL Query**:
  ```sql
  SELECT COUNT(*) AS count
  FROM public.notifications n
  WHERE n.is_read = true
    AND n.user_id NOT IN (
      SELECT DISTINCT usr.id
      FROM public.users usr
      LEFT JOIN public.profiles prf ON usr.id = prf.user_id
      JOIN public.admins adm ON LOWER(COALESCE(prf.email, usr.email)) = LOWER(adm.email)
    );
  ```

### 14. Notifications Unread
* **Current Value**: `24`
* **SQL Query**:
  ```sql
  SELECT COUNT(*) AS count
  FROM public.notifications n
  WHERE n.is_read = false
    AND n.user_id NOT IN (
      SELECT DISTINCT usr.id
      FROM public.users usr
      LEFT JOIN public.profiles prf ON usr.id = prf.user_id
      JOIN public.admins adm ON LOWER(COALESCE(prf.email, usr.email)) = LOWER(adm.email)
    );
  ```

### 15. Push Attempted
* **Current Value**: `2`
* **SQL Query**:
  ```sql
  SELECT COUNT(*) AS count
  FROM public.notifications n
  WHERE n.push_attempted_at IS NOT NULL
    AND n.user_id NOT IN (
      SELECT DISTINCT usr.id
      FROM public.users usr
      LEFT JOIN public.profiles prf ON usr.id = prf.user_id
      JOIN public.admins adm ON LOWER(COALESCE(prf.email, usr.email)) = LOWER(adm.email)
    );
  ```

### 16. Push Failures
* **Current Value**: `0` (FCM delivery failures)
* **SQL Query**:
  ```sql
  SELECT COUNT(*) AS count
  FROM public.notifications n
  WHERE n.push_status = 'failed'
    AND n.user_id NOT IN (
      SELECT DISTINCT usr.id
      FROM public.users usr
      LEFT JOIN public.profiles prf ON usr.id = prf.user_id
      JOIN public.admins adm ON LOWER(COALESCE(prf.email, usr.email)) = LOWER(adm.email)
    );
  ```

### 17. No Token Count
* **Current Value**: `2` (Pushes skipped due to missing device token)
* **SQL Query**:
  ```sql
  SELECT COUNT(*) AS count
  FROM public.notifications n
  WHERE n.push_status = 'no_token'
    AND n.user_id NOT IN (
      SELECT DISTINCT usr.id
      FROM public.users usr
      LEFT JOIN public.profiles prf ON usr.id = prf.user_id
      JOIN public.admins adm ON LOWER(COALESCE(prf.email, usr.email)) = LOWER(adm.email)
    );
  ```

---

## Messaging Metrics

### 18. Conversations
* **Current Value**: `0`
* **SQL Query**:
  ```sql
  WITH admin_users AS (
    SELECT DISTINCT u.id AS admin_id
    FROM public.users u
    LEFT JOIN public.profiles p ON u.id = p.user_id
    JOIN public.admins a ON LOWER(COALESCE(p.email, u.email)) = LOWER(a.email)
  )
  SELECT COUNT(*) AS count
  FROM public.conversations c
  WHERE c.user_a_id NOT IN (SELECT admin_id FROM admin_users)
    AND c.user_b_id NOT IN (SELECT admin_id FROM admin_users);
  ```
* **Verification Status**: **VERIFIED**

### 19. Messages
* **Current Value**: `0` (excluding 'init' message)
* **SQL Query**:
  ```sql
  WITH admin_users AS (
    SELECT DISTINCT u.id AS admin_id
    FROM public.users u
    LEFT JOIN public.profiles p ON u.id = p.user_id
    JOIN public.admins a ON LOWER(COALESCE(p.email, u.email)) = LOWER(a.email)
  )
  SELECT COUNT(*) AS count
  FROM public.direct_messages d
  WHERE d.media_type IS DISTINCT FROM 'init'
    AND d.sender_id NOT IN (SELECT admin_id FROM admin_users)
    AND d.receiver_id NOT IN (SELECT admin_id FROM admin_users);
  ```
* **Verification Status**: **VERIFIED**
