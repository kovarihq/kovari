# Notification & Push Observability Metrics

This document defines and queries the notification delivery rates, read rates, and push notification delivery states.

---

## Checked Constraint Reference
From migration `20260622180000_notifications_push_observability.sql`, the valid values for `push_status` check constraint are:
- `'delivered'` (accepted by FCM)
- `'suppressed'` (skipped because user was in-app and in-chat)
- `'no_token'` (skipped because user has no push device token registered)
- `'failed'` (FCM push dispatch failed)
- `'skipped_low_priority'` (skipped due to low notification priority)

---

## Notification Metrics & Queries

### 1. Notifications Created
* **Definition**: Total notifications created for users.
* **SQL Query**:
  ```sql
  SELECT COUNT(*) AS total_created
  FROM public.notifications;
  ```

### 2. Notifications Read
* **Definition**: Count and percentage of notifications read by users.
* **SQL Query**:
  ```sql
  SELECT 
    COUNT(CASE WHEN is_read = true THEN 1 END) AS total_read,
    ROUND(COUNT(CASE WHEN is_read = true THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 2) AS read_rate_pct
  FROM public.notifications;
  ```

### 3. Push Attempted
* **Definition**: Notifications where a push dispatch to FCM was attempted.
* **SQL Query**:
  ```sql
  SELECT COUNT(*) AS total_attempted
  FROM public.notifications
  WHERE push_attempted_at IS NOT NULL;
  ```

### 4. Push Success
* **Definition**: Push dispatches accepted by FCM (delivered to at least 1 device token).
* **SQL Query**:
  ```sql
  SELECT 
    COUNT(*) AS total_success,
    ROUND(COUNT(*) * 100.0 / NULLIF(COUNT(CASE WHEN push_attempted_at IS NOT NULL THEN 1 END), 0), 2) AS success_rate_pct
  FROM public.notifications
  WHERE push_status = 'delivered';
  ```

### 5. Push Failure
* **Definition**: Push dispatches that failed with an error.
* **SQL Query**:
  ```sql
  SELECT 
    COUNT(*) AS total_failed,
    ROUND(COUNT(*) * 100.0 / NULLIF(COUNT(CASE WHEN push_attempted_at IS NOT NULL THEN 1 END), 0), 2) AS failure_rate_pct
  FROM public.notifications
  WHERE push_status = 'failed';
  ```

### 6. No Token (`push_status = no_token`)
* **Definition**: Push notifications skipped because the target user had no registered FCM device token.
* **SQL Query**:
  ```sql
  SELECT COUNT(*) AS total_no_token
  FROM public.notifications
  WHERE push_status = 'no_token';
  ```

---

## Deep Dive: `no_token` Analysis & Bottleneck

### Rationale
In the closed beta, a critical issue was discovered: interests were sent, notifications created, but users never returned because they never received push notifications. This is primarily caused by `no_token` (users signing up but not registering/granting push notification permissions, or token sync failing).

### Key Performance Indicators (KPIs)
To understand the scope of the push notification failure, we track:
1. **`no_token` Rate**: The % of notifications that could not send a push because of a missing token.
2. **Affected Users**: The count of unique users who missed at least one notification due to a missing token.

```sql
SELECT 
  COUNT(CASE WHEN push_status = 'no_token' THEN 1 END) AS no_token_notifications,
  ROUND(COUNT(CASE WHEN push_status = 'no_token' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 2) AS no_token_rate_pct,
  COUNT(DISTINCT CASE WHEN push_status = 'no_token' THEN user_id END) AS affected_users_count
FROM public.notifications;
  ```

---

## Ongoing Monitoring & Alerting

### Monitoring Query (Last 24 Hours)
To alert the engineering team when push registrations fail, we run a query to calculate the `no_token` rate over the last 24 hours:
```sql
SELECT 
  COUNT(*) AS total_notifications_last_24h,
  COUNT(CASE WHEN push_status = 'no_token' THEN 1 END) AS no_token_last_24h,
  ROUND(COUNT(CASE WHEN push_status = 'no_token' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0), 2) AS no_token_rate_last_24h_pct
FROM public.notifications
WHERE created_at >= NOW() - INTERVAL '24 hours';
```

### Recommended Alert Threshold
> [!WARNING]
> **Alert Trigger**: If `no_token_rate_last_24h_pct` exceeds **15%** AND `total_notifications_last_24h` is greater than **10**, fire a Slack/Sentry alert.
>
> High `no_token` rates indicate that either:
> 1. The client-side FCM token request prompt is failing or being blocked by OS permissions.
> 2. The token sync API endpoint `/api/notifications/register-token` is failing to upload device tokens to the `fcm_device_tokens` table.
