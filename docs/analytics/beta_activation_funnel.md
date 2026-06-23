# Beta Activation Funnel Specification

This document defines the 9 stages of the Kovari Beta Activation Funnel, mapping them to the Postgres schema, defining the exact queries, and specifying data availability or gaps.

> [!NOTE]
> **Live Validation Completed**: All SQL queries in this specification have been executed and verified against the production database using the Supabase SQL Editor. 
> 
> > [!CAUTION]
> > **CRITICAL TELEMETRY GAP IDENTIFIED**: Codebase analysis shows `last_seen_at` is only set once at signup/onboarding sync. Retention and return metrics (DAU/WAU/Returned Users) will remain non-functional until a backend fix is implemented to update `last_seen_at` during active sessions.

---

## Developer & Admin Filtering
To ensure that all P0 activation metrics reflect only **organic beta users**, all queries below filter out administrative and founder accounts (e.g. Priyansh, Navneet, Kanav) whose emails are registered in the `public.admins` table.

---

## Funnel Stages

### 1. Invited Users
* **Source Table**: `public.waitlist`
* **Query Required**:
  ```sql
  SELECT COUNT(DISTINCT email) AS count
  FROM public.waitlist
  WHERE status IN ('beta_invited', 'beta_active')
    AND LOWER(email) NOT IN (
      SELECT LOWER(email) FROM public.admins
    );
  ```
* **Existing Availability**: Fully available. Users are marked as `beta_invited` or `beta_active` when invited.
* **Missing Data**: None.

### 2. Activated Users
* **Source Table**: `public.users`
* **Query Required**:
  ```sql
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
  ```
* **Existing Availability**: Fully available. Propagated from `waitlist` via `sync-user` API upon signup.
* **Database GAP Explanation**: 
  > [!NOTE]
  > **Profiles vs Users Count Gap (15 vs 13)**:
  > The "Activated Users" count is **15** because it is queried from the `public.users` table. However, querying the `public.profiles` table directly (excluding admins) returns **13** records. 
  > 
  > This 2-user discrepancy indicates that exactly **2 organic users** have successfully authenticated and registered inside the `public.users` table, but have not yet completed the onboarding process (which creates their profile row in `public.profiles`). 
  > 
  > Thus, **Activated Users** is correctly defined by the `public.users` table (auth record created), whereas the subsequent stage **Onboarding Completed** joins against `public.users` and validates onboarding status.
* **Missing Data**: None.

### 3. Onboarding Completed
* **Source Table**: `public.users`
* **Query Required**:
  ```sql
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
  ```
* **Existing Availability**: Fully available. Handled by the profile creation API setting `onboarding_completed` to `true`.
* **Missing Data**: None.

### 4. Travel Intent Added
* **Source Table**: `public.profiles`
* **Query Required**:
  ```sql
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
  ```
* **Existing Availability**: Fully available. Travel intentions are stored as a JSONB array (`travel_intentions`) inside `public.profiles`.
* **Missing Data**: None.

### 5. Explore Viewed
* **Source Table**: None (**Missing Data**)
* **Query Required**: *N/A (Needs instrumentation)*
* **Existing Availability**: 🔴 **Missing Data**. Explore screen views are currently client-side only and not written to the database or logged in the security-critical `public.audit_logs`.
* **Required Instrumentation**:
  To track this stage in the backend, the client must trigger an API call to record the action `'EXPLORE_VIEWED'` in `public.audit_logs` when the user navigates to the Explore tab.
  *Recommended Log Schema inside `public.audit_logs` (excluding admins):*
  ```sql
  SELECT COUNT(DISTINCT actor_id) AS count
  FROM public.audit_logs
  WHERE action = 'EXPLORE_VIEWED'
    AND actor_id NOT IN (
      SELECT DISTINCT usr.id
      FROM public.users usr
      JOIN public.profiles prf ON usr.id = prf.user_id
      JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
    );
  ```

### 6. Interest Sent
* **Source Table**: `public.match_interests`
* **Query Required**:
  ```sql
  SELECT COUNT(DISTINCT from_user_id) AS count
  FROM public.match_interests
  WHERE from_user_id NOT IN (
    SELECT DISTINCT usr.id
    FROM public.users usr
    JOIN public.profiles prf ON usr.id = prf.user_id
    JOIN public.admins adm ON LOWER(prf.email) = LOWER(adm.email)
  );
  ```
* **Existing Availability**: Fully available. Logged when a user expresses interest in a solo profile or group member.
* **Missing Data**: None.

### 7. Interest Accepted
* **Source Table**: `public.match_interests`
* **Query Required**:
  ```sql
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
  ```
* **Existing Availability**: Fully available. Status is updated from `'pending'` to `'accepted'` when the target user clicks accept.
* **Missing Data**: None.

### 8. Conversation Started
* **Source Table**: `public.conversations`
* **Query Required**:
  ```sql
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
  ```
* **Existing Availability**: Fully available. A row is inserted in `public.conversations` when an interest is accepted (represents stranger/organic conversations).
* **Missing Data**: None.

### 9. Messages Sent
* **Source Table**: `public.direct_messages`
* **Query Required**:
  ```sql
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
  ```
* **Existing Availability**: Fully available. Logged when user sends actual direct messages. We filter out `media_type = 'init'` and admin/founder message exchanges.
* **Missing Data**: None.
