# Analytics Validation Notes

This document highlights critical data quality issues, metric ambiguities, implementation risks, and recommended engineering fixes discovered during the Beta Analytics V1 validation pass.

---

## 1. Data Quality Issues

* **`last_seen_at` Telemetry Freeze**: 
  The `last_seen_at` timestamp is written exactly once during signup/onboarding. It is never updated on subsequent authenticated requests. This makes it impossible to track active sessions or user returns, leading to a permanent `0%` calendar-day retention rate.
* **Match Interest Decision Paralysis**:
  There are **0 rejected interests** in the database. Every sent interest is either accepted or remains indefinitely pending. Users are choosing to ignore matches rather than reject them, which causes match queues to pile up without resolution.

---

## 2. Ambiguous Metrics

* **Acceptance Rate**:
  * **Stranger-Only (Organic-to-Organic)**: `0.00%` (0 Accepted / 0 Decided).
  * **Overall (Including Admin Testing)**: `56.25%` (9 Accepted / 16 Sent).
  * *Resolution*: Define the primary dashboard acceptance rate as **Stranger-Only** to measure organic matching health. Exclude testing accounts from both ends.
* **Interests Sent**:
  * The audit baseline of `5` was a count of **unique organic senders**. The raw record count in the database is actually `16`.
  * *Resolution*: Dashboard must label widgets clearly as "Total Interest Records Sent" vs. "Unique Senders".

---

## 3. Implementation Risks

* **PostgreSQL Case-Folding**:
  The `public.users` table defines the soft-deletion flag in camelCase: `"isDeleted"`. Standard unquoted raw SQL queries like `u.isDeleted` will fold to `u.isdeleted` and crash. All backend SQL queries must wrap this column in double quotes: `u."isDeleted"`.
* **RLS Policies**:
  Executing analytics queries using client-scoped anonymous keys will return empty datasets due to Row Level Security (RLS). The dashboard backend must bypass RLS using the Supabase Service Role client.

---

## 4. Recommended Fixes

1. **`last_seen_at` Telemetry Fix (P0 Backend Blockers)**:
   Update `last_seen_at` on the user record during authenticated requests. To prevent DB write amplification, implement this in Next.js [middleware.ts](file:///c:/Users/91779/Desktop/kovari%20StartUp/KOVARI/apps/web/src/middleware.ts) and throttle updates to once every 1 hour per user session.
2. **Dashboard Query Standardization**:
   Deploy the consolidated, verified query file [beta_analytics_queries.sql](file:///c:/Users/91779/Desktop/kovari%20StartUp/KOVARI/docs/analytics/beta_analytics_queries.sql) to populate the dashboard cards to ensure admins are consistently excluded.
3. **Explicit Quoting Standards**:
   Add database linter rules or strict guidelines enforcing double quotes (`"isDeleted"`) for all camelCase columns in raw SQL migrations and scripts.
