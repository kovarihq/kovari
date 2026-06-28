# Kovari Analytics V1 Implementation Build Plan

This build plan outlines the exact sequential order of development, backend SQL migrations, API routes setup, and frontend component construction for the Kovari Beta Analytics V1 dashboard.

---

# Build Sequence Summary

```
┌────────────────────────────────────────────────────────┐
│ 1. ROUTE SETUP                                         │
│ - Create /beta-analytics routes & navigation sidebar   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 2. BACKEND QUERY LAYER                                 │
│ - Run PostgreSQL indexes & construct service handlers  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 3. TELEMETRY PATCH (RETENTION)                         │
│ - Deploy last_seen_at middleware & throttle writes     │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 4. WIDGET APIS & COMPONENTS                            │
│ - Overview KPI Deck (6 Cards)                          │
│ - Travel Intentions Table                              │
│ - Match Funnel Progression (9 Stages)                  │
│ - FCM Notification Health                              │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 5. RECENT ACTIVITY LOG TABLES                          │
│ - Matches, Notifications, Conversations logs           │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ 6. QA VALIDATION WITH KAVISH                           │
│ - Verify count matches, cache resets & queries cost    │
└────────────────────────────────────────────────────────┘
```

---

# Detailed Step-by-Step Build Order

## Step 1: Route Setup & Application Shell
- **Backend API Shells**:
  - Setup routing paths inside `apps/admin/app/api/admin/beta-analytics/` for the endpoints:
    - `/overview`
    - `/funnel`
    - `/notifications`
    - `/destinations`
  - Wrap controllers with standard admin security middleware (`requireAdmin`).
- **Frontend Page Layout**:
  - Create page folder `apps/admin/app/beta-analytics/`.
  - Write `page.tsx` displaying the dashboard container, title, and filter header.
  - Write `loading.tsx` displaying full-page skeleton panels.
  - Write `error.tsx` mapping Sentry logging exceptions.
- **Sidebar Integration**:
  - Edit `apps/admin/components/AdminSidebar.tsx` to add the dashboard route:
    ```typescript
    {
      title: "Beta Analytics",
      path: "/beta-analytics",
      icon: BarChart3
    }
    ```

---

## Step 2: Backend Query Layer & Database Preparation
- **Schema Performance Indices**:
  - Run database migration introducing the indexing schema optimized in `beta_analytics_metric_queries.md`:
    - Index soft-deleted filters: `idx_users_active_filter` on `users("isDeleted")`.
    - Index retention parameters: `idx_users_retention_dates` on `users(activation_date, last_seen_at)`.
    - Index match states: `idx_match_interests_state_users` on `match_interests(status, from_user_id, to_user_id)`.
    - Index messaging volume: `idx_direct_messages_sender_receiver` on `direct_messages(sender_id, receiver_id)`.
- **Admin Access Bypass RLS**:
  - Ensure the analytics data-fetching library uses the Supabase service role key client (`supabaseAdmin`) to bypass client-level Row Level Security policies.

---

## Step 3: Telemetry Patch (Retention Telemetry)
- **Middleware Update**:
  - Modify `apps/web/src/middleware.ts` to intercept authenticated client requests.
- **DB Write Mitigation**:
  - To prevent write storm amplification, throttle database updates:
    - Store active user IDs in a fast Redis cache set.
    - Run an hourly background cron task that updates `users.last_seen_at` in batches, OR
    - Perform a PostgreSQL timestamp comparison inside the middleware to update `last_seen_at` only if the user has not been seen in the last 1 hour.
- **Retention Materialized View**:
  - Run migration script creating `mv_daily_retention_summary` and schedule hourly concurrent refreshes:
    ```sql
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_daily_retention_summary;
    ```

---

## Step 4: Widget APIs & Component Implementation

### 4.1 Overview KPI Deck (6 Cards)
- **API implementation**: Create `GET /api/admin/beta-analytics/overview`.
  - Collect counts of total users, activated users, returned users, retention rates, interests sent, conversations, and interest acceptance rates.
  - Implement Redis caching (TTL: 5 minutes).
- **Frontend implementation**: Create `OverviewGrid.tsx`.
  - Bind card items to `MetricCard`.
  - Pass the decided-based rate as the primary acceptance value, and overall rate inside hover tooltips.

### 4.2 Travel Intentions Table
- **API implementation**: Create `GET /api/admin/beta-analytics/destinations`.
  - Implement JSONB unnesting CTE counts on `profiles.travel_intentions`.
- **Frontend implementation**: Create `TravelIntentionsSection.tsx` mapping data to Shadcn Table rows.

### 4.3 Match Funnel progression (9 Stages)
- **API implementation**: Create `GET /api/admin/beta-analytics/funnel`.
  - Execute the 9 funnel stage counts using organic user filters.
- **Funnel Component Refactoring**:
  - Modify `Funnel.tsx` to support dynamic props mapping:
    ```typescript
    props: { steps: FunnelStep[] }
    ```
- **Frontend implementation**: Create `MatchFunnelSection.tsx` rendering the horizontal bars.

### 4.4 Notification Health Section
- **API implementation**: Create `GET /api/admin/beta-analytics/notifications`.
  - Pull FCM delivery status aggregates (`delivered`, `failed`, `no_token`).
- **Frontend implementation**: Create `NotificationHealthSection.tsx` rendering list rows. High-contrast alert indicator bounds:
  - Highlight `no_token` in red if rate exceeds 20%.

---

## Step 5: Recent Activity Tables Deck
- **API implementation**: Create `GET /api/admin/beta-analytics/tables` fetching:
  - Recent interests (last 5).
  - Recent notifications dispatch logs (last 5).
  - Recent conversation partners & message counts (last 5).
- **Frontend implementation**: Create `RecentActivitySection.tsx` laying out the 3 tables side-by-side in desktop view, and stacking on mobile viewports.

---

## Step 6: QA Validation with Kavish
- **Cross-Verify SQL Outputs**:
  - Run the baseline verification SQL statements from `analytics_v1_qa_checklist.md` manually via the Supabase dashboard and compare values.
- **Load Testing**:
  - Run EXPLAIN ANALYZE on query planners to verify they perform indexing scans instead of sequential table scans.
- **Cache Invalidation Verification**:
  - Trigger a test batch invite dispatch and verify that overview Redis cache values invalidate and reload correctly.
- **Empty State Inspections**:
  - Temporarily load empty query tables and confirm that no cards crash and all tables display custom fallback text.
