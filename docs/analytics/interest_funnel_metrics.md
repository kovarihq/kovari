# Interest Funnel Metrics Specification

This document defines the metrics and SQL queries for measuring user interest activity, decisions, and bottlenecks in matching during the closed beta.

---

## The Interest Funnel Bottleneck
In the beta audit, a critical matching bottleneck was identified:
- **5 Stranger Interests Sent**
- **0 Stranger Interests Accepted**

While users discover others and send interests, they remain unanswered indefinitely. This file defines metrics to measure this gap, focusing on the **Average Pending Age**.

---

## Interest Metrics & Queries

### 1. Interests Sent
* **Definition**: The total number of interests expressed by users.
* **SQL Query**:
  ```sql
  SELECT COUNT(*) AS total_sent
  FROM public.match_interests;
  ```

### 2. Pending Interests
* **Definition**: Sent interests that are still awaiting a decision.
* **SQL Query**:
  ```sql
  SELECT COUNT(*) AS total_pending
  FROM public.match_interests
  WHERE status = 'pending';
  ```

### 3. Accepted Interests
* **Definition**: Interests that resulted in a mutual match or were accepted.
* **SQL Query**:
  ```sql
  SELECT COUNT(*) AS total_accepted
  FROM public.match_interests
  WHERE status = 'accepted';
  ```

### 4. Rejected Interests
* **Definition**: Interests that were declined by the recipient.
* **SQL Query**:
  ```sql
  SELECT COUNT(*) AS total_rejected
  FROM public.match_interests
  WHERE status = 'rejected';
  ```

### 5. Acceptance Rate
* **Definition Formula**: The ratio of accepted interests to resolved (decided) interests.
* **SQL Query (Decided-Based)**:
  ```sql
  SELECT 
    ROUND(COUNT(CASE WHEN status = 'accepted' THEN 1 END) * 100.0 / 
          NULLIF(COUNT(CASE WHEN status IN ('accepted', 'rejected') THEN 1 END), 0), 2) AS acceptance_rate_decided_pct,
    ROUND(COUNT(CASE WHEN status = 'accepted' THEN 1 END) * 100.0 / 
          NULLIF(COUNT(*), 0), 2) AS acceptance_rate_overall_pct
  FROM public.match_interests;
  ```

### 6. Average Pending Age (CRITICAL METRIC)
* **Definition**: The average time elapsed (in hours) since an interest was sent and is still pending decision.
* **Why It is the Most Important Metric**: 
  > [!IMPORTANT]
  > This is the single most important metric in matching health. It measures how long sent interests sit unanswered. 
  > 
  > A high average pending age directly indicates low app engagement (users do not open the app to accept/decline matches) or that push notifications are not prompting users back.
* **SQL Query**:
  ```sql
  SELECT 
    AVG(NOW() - created_at) AS avg_pending_age,
    ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600.0)::numeric, 1) AS avg_pending_age_hours,
    ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400.0)::numeric, 1) AS avg_pending_age_days
  FROM public.match_interests
  WHERE status = 'pending';
  ```
