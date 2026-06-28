# Kovari Beta Analytics Dashboard Wireframe & Specification

This document details the user experience (UX), user interface (UI), visual hierarchy, and structural wireframe design for the Kovari Beta Analytics Dashboard route (`/admin/beta-analytics`). It defines layout boundaries, responsive behaviors, component reusability, loading states, error states, and element-to-component mappings.

---

# Page Overview

- **Route**: `/admin/beta-analytics` (Admin Portal Dashboard Sub-Route)
- **Purpose**: Provides administrators and founders with a unified operational overview of core metrics to evaluate closed-beta cohort health and identify engagement bottlenecks.

## Page Goals
This dashboard is designed to answer the following critical business questions:
1. **Are users activating?** Do users complete registration and finish profile onboarding after receiving waitlist invites?
2. **Are users returning?** Are users returning to the app on subsequent calendar days (measuring cohort retention)?
3. **Is matching working?** Are matching interests being sent, and are they being responded to, or is there an accumulation of pending queries?
4. **Are conversations happening?** Do accepted matches translate into active direct messaging (stranger chats)?
5. **Are notifications being delivered?** Is FCM push notification delivery succeeding, or are users missing alerts due to token registration failure?

---

# Global Layout

The dashboard utilizes a clean, content-driven layout optimized for dark mode settings, displaying quantitative metrics first, followed by behavioral progression charts, and finally operational lists.

## Page Structure
1. **Header Block**: Page title, brief subtitle, refresh triggers, and status badge indicators.
2. **Global Filters Bar**: Selectors for Date Range and Cohort Batch.
3. **Executive KPI Section**: A responsive horizontal grid of 5 primary metric cards.
4. **Behavioral Middle Section (Dual Columns)**:
   - *Left Column*: User Conversion Funnel (progression bars).
   - *Right Column*: Messaging Volume Chart (growth area chart) and Notification Health status block.
5. **Recent Activity Tables Section**: Structured tabulation logs for recent matches, notification alerts, and active conversations.

## Responsive Grid Layout Specification

```
+-------------------------------------------------------------------------------------------------------+
|  HEADER: Beta Analytics Dashboard                     [Refresh v] [Batch: All v] [Range: 30d v]       |
+-------------------------------------------------------------------------------------------------------+
|  KPI GRID:                                                                                            |
|  [Users]  [Activated]  [Returned]  [Retention %]  [Interests]  [Conversations]  [Acceptance Rate %]   |
+-------------------------------------------------------------------------------------------------------+
|  MIDDLE GRID (2 Columns on Desktop, Stacked on Mobile):                                               |
|  +---------------------------------------+ +---------------------------------------------------------+ |
|  | LEFT: USER CONVERSION FUNNEL          | | RIGHT: MESSAGING VOLUME GROWTH CHART                    | |
|  | 1. Invited     [████████████████] 100%| |    |                                                    | |
|  | 2. Activated   [██████████████░] 93.3%| | 100|      /\                                            | |
|  | 3. Onboarded   [██████████░░░░] 66.7% | |  50|  ___/  \____                                       | |
|  | 4. Trv Intent  [██████████░░░░] 66.7% | |   0+-------------                                       | |
|  | 5. Explore View[░░░░░░░░░░░░░░] N/A   | |    20  21  22  23                                       | |
|  | 6. Interest Snt[█████░░░░░░░░░] 33.3% | +---------------------------------------------------------+ |
|  | 7. Int Accept  [░░░░░░░░░░░░░░] 0.0%  | | RIGHT: PUSH NOTIFICATION HEALTH CARD                    | |
|  | 8. Conversated [░░░░░░░░░░░░░░] 0.0%  | | Created: 45      Read Rate: 42.2%                       | |
|  | 9. Msg Sent    [░░░░░░░░░░░░░░] 0.0%  | | Success: 12 (30.0%)  Failed: 3 (7.5%)                    | |
|  |                                       | | No Token: 25 (62.5%)  <-- 🚨 WARN                       | |
|  +---------------------------------------+ +---------------------------------------------------------+ |
+-------------------------------------------------------------------------------------------------------+
|  BOTTOM TABLES GRID (3 Columns or Stacked):                                                           |
|  +---------------------+ +----------------------+ +--------------------------------+ |
|  | Recent Interests    | | Recent Notifications | | Recent Conversations           | |
|  | User | Target|Status| | User | Type | Status  | | Participants | Msg | Last Act  | |
|  +---------------------+ +----------------------+ +--------------------------------+ |
+-------------------------------------------------------------------------------------------------------+
```

### Grid Viewports Behavior
- **Desktop (>= 1024px)**:
  - Executive KPIs: `grid grid-cols-6 gap-4` (6 parallel cards).
  - Middle Columns: `grid grid-cols-12 gap-6` (Funnel spans 7 columns, Messaging Chart and Notifications stack in 5 columns).
  - Tables: `grid grid-cols-3 gap-6` (3 side-by-side tables).
- **Tablet (768px - 1023px)**:
  - Executive KPIs: `grid grid-cols-3 gap-4` (3 cards per row, 2 rows).
  - Middle Columns: `grid grid-cols-1 gap-6` (Funnel and Messaging Charts stack vertically).
  - Tables: `grid grid-cols-1 gap-6` (tables stack vertically).
- **Mobile (< 768px)**:
  - All elements stack vertically in a single column (`flex flex-col space-y-6`). KPI cards display as full-width list items to maintain readability.

---

# Global Filters

Global filters are located in the top-right header section of the page, matching standard navigation patterns.

- **Date Range Selector**:
  - *Values*: `Last 7 Days`, `Last 30 Days` (Default), `Last 90 Days`, `Custom` (triggers date calendar popover).
  - *UX Behavior*: Renders as an inline dropdown button. Toggling a value updates the URL query string (`?dateRange=val`) and triggers dynamic REST API requests.
- **Waitlist Batch Cohort Selector**:
  - *Values*: `All Batches` (Default), list of active batches (e.g. `Batch 1`, `Batch 2`, `Batch 3`).
  - *UX Behavior*: Dropdown select syncing `?batchId=val` to the URL.
- **Reusability**: Existing `Select` dropdown structures from `apps/admin/components/ui/select` are reused. The Date Range custom calendar picker is missing and must be built using `ui/calendar.tsx` and `ui/popover.tsx`.

---

# Section 1 — Executive KPIs

Provides immediate, scannable visibility into core business volumes and activation percentages.

## Layout Grid
```
[ Users ]   [ Activation ]   [ Retention ]   [ Interests ]   [ Conversations ]   [ Interest Acceptance Rate ]
```

### 1. KPI Card: Users
- **Definition**: Distinct count of active, non-admin registered users (`isDeleted = false`).
- **Display Format**: Integer (e.g. `15`).
- **Trend Indicator**: Up/Down comparison indicator.
- **Comparison Period**: vs. previous 30 days.
- **Existing Component**: Reuses `MetricCard.tsx`.

### 2. KPI Card: Activation
- **Definition**: Count and percentage of registered users who are activated (`beta_status = 'activated'`).
- **Display Format**: Count with inline conversion rate `[14] (93.3% waitlist conv)`.
- **Trend Indicator**: Neutral.
- **Comparison Period**: Baseline cohort value.
- **Existing Component**: Reuses `MetricCard.tsx`.

### 3. KPI Card: Retention
- **Definition**: Day 1 cohort retention rate (`returned_users / activated_users`).
- **Display Format**: Percentage `[0.0%]`.
- **Trend Indicator**: Neutral.
- **Comparison Period**: Daily cohort average.
- **Existing Component**: Reuses `MetricCard.tsx`.
- **Notes**: High risk of returning 0% today due to missing telemetry.

### 4. KPI Card: Interests
- **Definition**: Total matching interest signals sent between organic stranger users.
- **Display Format**: Count `[5]`.
- **Trend Indicator**: Up.
- **Comparison Period**: vs. previous 30 days.
- **Existing Component**: Reuses `MetricCard.tsx`.

### 5. KPI Card: Conversations
- **Definition**: Stranger conversations successfully created (`conversations` table, no admins involved).
- **Display Format**: Count `[0]`.
- **Trend Indicator**: Neutral.
- **Comparison Period**: vs. previous 30 days.
- **Existing Component**: Reuses `MetricCard.tsx`.

### 6. KPI Card: Interest Acceptance Rate
- **Definition**: Percentage of organic stranger interests sent that were accepted by the recipient.
- **Formula**: `(Organic Stranger Accepted Interests) / (Organic Stranger Sent Interests) * 100.0` (overall) or decided-based rate.
- **Source Table**: `public.match_interests`
- **SQL Query**:
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
  FROM public.match_interests
  WHERE from_user_id IN (SELECT id FROM organic_users)
    AND to_user_id IN (SELECT id FROM organic_users);
  ```
- **Empty State Behaviour**: Displays `0.00%` when no matching decisions have been recorded.
- **Refresh Strategy**: Every 5 minutes (promoted to Executive Overview for real-time validation of matching bottlenecks).
- **Existing Component**: Reuses `MetricCard.tsx`.

---

# Section 2 — Funnel

Visualizes user drop-offs from signup to messaging.

## Funnel Design
We select a **Hybrid Step Progression Funnel** containing a stacked list of horizontal progress bars. This design fits within the dashboard left column and provides a scannable representation of drop-off thresholds.

```
Invited       [████████████████████] 100.0% (15)
Activated     [███████████████████░]  93.3% (14)
Onboarded     [█████████████░░░░░░░]  66.7% (10)
Trv. Intent   [█████████████░░░░░░░]  66.7% (10)
Explore View  [░░░░░░░░░░░░░░░░░░░░]   N/A  (Telemetry Warning)
Interest Sent [██████░░░░░░░░░░░░░░]  33.3% (5)
Int. Accepted [░░░░░░░░░░░░░░░░░░░░]   0.0% (0)
Conversated   [░░░░░░░░░░░░░░░░░░░░]   0.0% (0)
Msg Sent      [░░░░░░░░░░░░░░░░░░░░]   0.0% (0)
```

## Stage Specifications

### 1. Stage: Invited
- **Metric Source**: `public.waitlist`
- **Formula**: `Count(waitlist.status IN ('beta_invited', 'beta_active'))`
- **Drop-Off**: Baseline (100%).
- **Existing Component**: Yes (reuses customized `Funnel.tsx` with dynamic props).

### 2. Stage: Activated
- **Metric Source**: `public.users`
- **Formula**: `Count(users.beta_status = 'activated')`
- **Drop-Off**: `(Activated / Invited) * 100`
- **Existing Component**: Yes.

### 3. Stage: Onboarded
- **Metric Source**: `public.users`
- **Formula**: `Count(users.onboarding_completed = true)`
- **Drop-Off**: `(Onboarded / Activated) * 100`
- **Existing Component**: Yes.

### 4. Stage: Travel Intent Added
- **Metric Source**: `public.profiles`
- **Formula**: `Count(jsonb_array_length(profiles.travel_intentions) > 0)`
- **Drop-Off**: `(Travel Intent / Onboarded) * 100`
- **Existing Component**: Yes.

### 5. Stage: Explore Viewed
- **Metric Source**: **No data** (Requires clickstream telemetry updates).
- **Drop-Off**: N/A.
- **Visual**: Rendered as a grayed-out bar with an alert indicator: `Requires Telemetry`.
- **Existing Component**: Yes.

### 6. Stage: Interest Sent
- **Metric Source**: `public.match_interests`
- **Formula**: `Count(distinct from_user_id)`
- **Drop-Off**: `(Interest Sent / Travel Intent) * 100`
- **Existing Component**: Yes.

### 7. Stage: Interest Accepted
- **Metric Source**: `public.match_interests`
- **Formula**: `Count(status = 'accepted')`
- **Drop-Off**: `(Accepted / Sent) * 100`
- **Existing Component**: Yes.

### 8. Stage: Conversation Started
- **Metric Source**: `public.conversations`
- **Formula**: `Count(conversations)`
- **Drop-Off**: `(Conversations / Accepted) * 100`
- **Existing Component**: Yes.

### 9. Stage: Messages Sent
- **Metric Source**: `public.direct_messages`
- **Formula**: `Count(direct_messages.media_type != 'init')`
- **Drop-Off**: `(Msg Sent / Conversations) * 100`
- **Existing Component**: Yes.

---

# Section 3 — Notification Health

Monitors push notification delivery rates and registers active token alerts.

## Layout
Renders inside a custom `GroupContainer` containing detailed iOS-style metric rows:
```
Notifications Dispatch Health
------------------------------------------------------
Created:        [ 45 ]
Read Rate:      [ 42.2% ] (19 read)
Success:        [ 12 ] (30.0% delivery)
Failure:        [ 3  ] (7.5% error)
No Token Alert: [ 25 ] (62.5% missing)  <-- 🚨 HIGHLIGHTED
```

## Metric Row Specifications

### 1. Created Notifications
- **Display**: Count (`45`).
- **Color Semantics**: Gray text (informational).
- **Existing Component**: Reuses `ListRow.tsx`.

### 2. Read Rate
- **Display**: Percentage (`42.2%`).
- **Thresholds**: Healthy: >= 40% (Green), Warning: 20-39% (Amber), Critical: < 20% (Red).
- **Existing Component**: Reuses `ListRow.tsx`.

### 3. Push Success
- **Display**: Count and rate (`12 (30.0%)`).
- **Thresholds**: Healthy: >= 80% (Green), Warning: 50-79% (Amber), Critical: < 50% (Red).
- **Color Semantics**: Red (under 50% due to missing device tokens).
- **Existing Component**: Reuses `ListRow.tsx`.

### 4. Push Failure
- **Display**: Count and rate (`3 (7.5%)`).
- **Thresholds**: Healthy: < 5% (Green), Warning: 5-10% (Amber), Critical: > 10% (Red).
- **Color Semantics**: Amber.
- **Existing Component**: Reuses `ListRow.tsx`.

### 5. No Token Count
- **Display**: Count and rate (`25 (62.5%)`).
- **Thresholds**: Healthy: < 10% (Green), Warning: 10-20% (Amber), Critical: > 20% (Red).
- **Color Semantics**: Red (Critical bottleneck indicator).
- **Existing Component**: Reuses `ListRow.tsx`.

---

# Section 4 — Recent Activity Tables

Provides live visibility into operational logs.

## 1. Recent Interests Table
- **Columns**: 
  - `Sender` (joins `profiles.name` on `from_user_id`)
  - `Recipient` (joins `profiles.name` on `to_user_id`)
  - `Status` (badge rendering pending/accepted/rejected states)
  - `Created At` (formatted date string)
- **Sorting**: Hardcoded to `created_at DESC`.
- **Filtering**: Synchronized to global date filters.
- **Pagination**: 5 rows maximum.
- **Empty State**: `"No match interests sent in range"`.
- **Existing Table Component**: Reuses standard custom layout from `apps/admin/components/ui/table`.

## 2. Recent Notifications Table
- **Columns**:
  - `Recipient` (`profiles.name` lookup)
  - `Type` (`notifications.type`)
  - `Push Status` (`push_status` badge)
  - `Created At`
- **Sorting**: `created_at DESC`.
- **Pagination**: 5 rows maximum.
- **Empty State**: `"No notification logs found"`.
- **Existing Table Component**: Reuses standard layouts.

## 3. Recent Conversations Table
- **Columns**:
  - `Participants` (`profiles.name` strings for sender/receiver combinations)
  - `Messages` (distinct count of messages in thread)
  - `Created At`
  - `Last Message` (timestamp of latest message sent)
- **Sorting**: `last_message DESC`.
- **Pagination**: 5 rows maximum.
- **Empty State**: `"No active chats established"`.
- **Existing Table Component**: Reuses standard layouts.

---

# Loading States

All loading states follow standard Shadcn/iOS-style layouts:

- **KPI Loading**: Renders 5 grey rectangular skeleton containers displaying animated gradient backgrounds. No spinners.
- **Funnel Loading**: The funnel card container displays a pulsing grid skeleton.
- **Notification Loading**: Individual rows display thin, variable-width skeleton text blocks.
- **Table Loading**: Table row spaces are populated with skeleton block grids.

---

# Error States

Dashboard component boundaries isolate failures:

- **Error Messaging**: Errors display inline warnings inside the affected card:
  ```
  ⚠️ Failed to load this component. (Error Code: DATABASE_TIMEOUT)
  [ Retry ]
  ```
- **Retry Behavior**: Clicking "Retry" triggers the specific endpoint fetch callback.
- **Empty States**: If queries return `null` or `[]`, tables display custom strings (e.g. `"No conversations found"`) rather than remaining empty.
- **Partial Failure Handling**: If the Funnel API fails but the KPIs succeed, only the Funnel widget displays an error boundary, allowing administrators to inspect other metrics.

---

# Responsive Layout Specification

## Desktop Viewport
- **Top Row**: 5 KPI cards in a row.
- **Middle Row**: Column 1 (Funnel, 58% width), Column 2 (Messaging Area Growth Chart + Notification card stacked, 42% width).
- **Bottom Row**: 3 equal-width columns displaying the lists side-by-side.

## Tablet Viewport
- **Top Row**: Row 1 contains 3 KPI cards, Row 2 contains 2 KPI cards.
- **Middle Row**: Stacked vertically. Funnel (100% width) followed by Messaging Chart and Notifications.
- **Bottom Row**: Stacked vertically.

## Mobile Viewport
- All elements stack in a single vertical viewport column. Skeletons adapt to match full-width margins.

---

# Component Mapping

| Wireframe Element | Existing Component | Reusable | Notes |
| :--- | :--- | :--- | :--- |
| **KPI Cards** | `MetricCard.tsx` | **Yes (100%)** | Requires no modifications. |
| **Middle Layout** | `apps/admin/components/AdminLayoutWrapper` | **Yes (100%)** | Sidebar shell layout handles routing. |
| **Messaging Area Graph**| `GrowthChart.tsx` | **Yes (95%)** | Renders Recharts area lines using date data payloads. |
| **Funnel Visualizer** | `Funnel.tsx` | **Partial (70%)**| Refactored to accept a dynamic stages array instead of hardcoded variables. |
| **Notification Health Rows**| `GroupContainer.tsx` & `ListRow.tsx` | **Yes (100%)** | Perfect match for iOS-style rows. |
| **Activity Lists** | `apps/admin/components/ui/table` | **Yes (100%)** | Uses default Shadcn table tags. |

---

# Wireframe Mockup

```text
=========================================================================================
  KOVARI CONTROL PANEL  |  [Dashboard]  [Users]  [Waitlist]  [Analytics]
=========================================================================================
  Beta Analytics Overview
  Closed-beta cohort tracking and operational indicators.
  
  [ Date Range: Last 30 Days v ]     [ Cohort Batch: All Batches v ]    [ Refresh Index ]
----------------------------------------------------------------------------------------------------------------------------------
  [ Total Users ] [ Activated ] [ Returned ] [ Retention % ] [ Interests Sent ] [ Conversations ] [ Interest Acceptance ]
  |     15      | |  14 (93%) | |    0     | |   0.00%     | |      5        | |       0       | |        0.00%        |
  | +0% last 7d | | sync webhook| |last_seen_at| |telemetry gap| | stranger-only | | stranger-only | |  decided-based rate |
----------------------------------------------------------------------------------------------------------------------------------
 
  ACTIVATION PROGRESSION FUNNEL (LEFT)         MESSAGING GROWTH CHART (RIGHT)
  +---------------------------------------+   +---------------------------------------+
  | Invited    [█████████████████] 15     |   | Messages / Day                        |
  | Activated  [████████████████░] 14     |   |                                       |
  | Onboarded  [████████████░░░░░] 10     |   |  30 |                /\               |
  | Trv Intent [████████████░░░░░] 10     |   |  20 |               /  \   /\         |
  | Exp View   [░░░░░░░░░░░░░░░░░] N/A    |   |  10 |   /\   ______/    \_/  \        |
  | Int Sent   [██████░░░░░░░░░░░] 5      |   |   0 +---\_/------------------\----    |
  | Int Accept [░░░░░░░░░░░░░░░░░] 0      |   |     Jun 20  Jun 22  Jun 24  Jun 26    |
  | Conversate [░░░░░░░░░░░░░░░░░] 0      |   +---------------------------------------+
  | Msg Sent   [░░░░░░░░░░░░░░░░░] 0      |   
  +---------------------------------------+   PUSH NOTIFICATIONS HEALTH (RIGHT)
                                              +---------------------------------------+
                                              | Created Alerts:  [ 45 ]               |
                                              | Read Rate:       [ 42.2% ] (19 read)  |
                                              | Push Attempts:   [ 40 ] (88.9%)       |
                                              | success:         [ 12 ] (30.0%)       |
                                              | failed:          [ 3 ]  (7.5%)        |
                                              | No Token Alerts: [ 25 ] (62.5%) 🚨 WARN |
                                              +---------------------------------------+

-----------------------------------------------------------------------------------------
  RECENT MATCH INTERESTS LOG
-----------------------------------------------------------------------------------------
  | Sender Name | Recipient Name | Status      | Sent Timestamp          | Action       |
  +-------------+----------------+-------------+-------------------------+--------------+
  | Alice       | Bob            | [ Pending ] | 2026-06-24 10:20:00 IST | [ Inspect ]  |
  | Charlie     | Dave           | [ Pending ] | 2026-06-23 18:45:00 IST | [ Inspect ]  |
  +-------------+----------------+-------------+-------------------------+--------------+

-----------------------------------------------------------------------------------------
  RECENT NOTIFICATION ALERTS
-----------------------------------------------------------------------------------------
  | Recipient   | Alert Type     | FCM Status  | Created Timestamp       | Detail       |
  +-------------+----------------+-------------+-------------------------+--------------+
  | Alice       | Match Interest | [No Token]  | 2026-06-24 10:20:02 IST | [ Trace ]    |
  | Bob         | Direct Msg     | [Delivered] | 2026-06-24 09:15:00 IST | [ Trace ]    |
  +-------------+----------------+-------------+-------------------------+--------------+

-----------------------------------------------------------------------------------------
  RECENT STRANGER CONVERSATIONS
-----------------------------------------------------------------------------------------
  | Participants                 | Msg Count   | Thread Created   | Last Message        |
  +------------------------------+-------------+------------------+---------------------+
  | Alice <-> Bob                | 12          | 2026-06-20 14:00 | 2026-06-24 09:15:00 |
  +------------------------------+-------------+------------------+---------------------+
=========================================================================================
```

---

# UX Recommendations

1. **Prioritize the Bottleneck Cues**:
   Highlight `Pending Interests` and `No Token Count` using high-contrast colors (yellow/red). These metrics identify why matching and notifications are stalling during the closed beta.
2. **Interactive Cohort Comparisons**:
   Include hover tooltips on the Funnel bars to display drop-offs compared to previous cohorts, helping to monitor performance improvements over time.
3. **Trace Routes**:
   Provide deep links from table rows to the detail pages (e.g. clicking a feedback row redirects to the interactive feedback review queue).

---

# Final Recommendation

1. **Alignment with Existing Patterns**: **High (95%)**
   The layout structure, grid behaviors, dark themes, and navigation patterns align with the existing admin dashboard and waitlist analytics pages.
2. **Estimated UI Code Reuse**: **~85%**
   The dashboard utilizes existing components (`MetricCard`, `GrowthChart`, `GroupContainer`, `ListRow`, and Shadcn table components).
3. **New Components to Create**:
   - **`DateRangePicker`**: Calendar calendar popover component.
   - **`BetaAnalyticsFilters`**: Filter bar.
   - **`/admin/beta-analytics/page.tsx`**: Layout page coordinating modules.
4. **V1 vs V2 Roadmap**:
   - **V1 (Closed Beta Observability)**:
     - Implement the 7 widget endpoints.
     - Refactor `Funnel.tsx` for dynamic steps.
     - Build the dashboard page layout with basic dropdown filters.
   - **V2 (Optimized Experience & Deep Analytics)**:
     - Patch the `last_seen_at` telemetry gap in middleware.
     - Add the custom `DateRangePicker` date calendar.
     - Deploy the pg_cron Materialized Views to optimize query performance as the user base scales.
