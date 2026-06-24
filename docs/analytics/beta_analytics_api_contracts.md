# Beta Analytics API Contracts

This document defines the backend-to-frontend API and data contracts for the Kovari Beta Analytics Dashboard (`/admin/beta-analytics`). It serves as the single source of truth for both backend implementation and frontend dashboard consumption.

---

# Overview

- **Dashboard Route**: `/admin/beta-analytics` (Admin portal subdomain integration)
- **Data Ownership**:
  - Primary Database: Supabase PostgreSQL (`public` schema: `users`, `profiles`, `match_interests`, `notifications`, `direct_messages`, `feedback`, `waitlist`).
  - Cache Layer: Redis (aggregates, session activity telemetry, operational cache keys).
- **API Strategy**: Next.js App Router Route Handlers (RESTful JSON APIs over HTTP) under `/api/admin/beta-analytics/*`.
- **Server Action Strategy**: Currently, the dashboard architecture uses **zero** Next.js Server Actions (no `"use server"` components are configured in the project). Direct, fetchable API Route Handlers are used to align with the existing admin pattern (e.g. `/api/admin/waitlist-analytics/route.ts`).
- **Caching Strategy**: Redis-based key caching with automated dashboard invalidate triggers on admin events (like manual batch invitation dispatches). Hourly cron schedules manage heavy materialized views execution.
- **Error Handling Strategy**: Consistent REST JSON payload wrappers reporting error codes, client-facing messages, and Sentry tracking IDs.

## Endpoint Strategy Recommendation
We recommend a **Hybrid Approach**:
- **API Overview & Funnel widgets** are grouped into focused endpoints (`/overview` and `/funnel`) because these queries execute fast and fit on adjacent UI blocks.
- **Charts and Data Tables** are isolated into dedicated endpoints (`/messaging`, `/notifications`, `/destinations`, `/active-users`, `/feedback`) because they support independent pagination, filter query bounds, and have varying computation profiles.

### Rationale
- Prevents slower, expensive queries (like unnesting JSONB destination arrays or scanning the message tables) from blocking the load of lightweight KPI cards.
- Matches existing components structure, enabling parallel skeleton animations and graceful widget-level error states rather than full-page crashes.

---

# Dashboard Widget Inventory

| Widget | Section | Data Source | Endpoint |
| :--- | :--- | :--- | :--- |
| **Total Users KPI** | Overview | `public.users`, `public.profiles` | `GET /api/admin/beta-analytics/overview` |
| **Activated Users KPI** | Overview | `public.users`, `public.profiles` | `GET /api/admin/beta-analytics/overview` |
| **Returned Users KPI** | Overview | `public.users`, `public.profiles` | `GET /api/admin/beta-analytics/overview` |
| **Retention Rate KPI** | Overview | `public.users`, `public.profiles` | `GET /api/admin/beta-analytics/overview` |
| **Interests Sent KPI** | Overview | `public.match_interests`, `public.profiles` | `GET /api/admin/beta-analytics/overview` |
| **Conversations Created KPI**| Overview | `public.conversations`, `public.profiles` | `GET /api/admin/beta-analytics/overview` |
| **Interest Acceptance Rate KPI**| Overview | `public.match_interests`, `public.profiles` | `GET /api/admin/beta-analytics/overview` |
| **Interest Funnel Widget** | Funnel | `public.match_interests`, `public.profiles` | `GET /api/admin/beta-analytics/funnel` |
| **Messaging Activity Chart** | Growth | `public.direct_messages`, `public.users` | `GET /api/admin/beta-analytics/messaging` |
| **Notification Health Widget**| Engagement | `public.notifications`, `public.profiles` | `GET /api/admin/beta-analytics/notifications` |
| **Top Destinations Table** | Tables | `public.profiles` (JSONB unnested) | `GET /api/admin/beta-analytics/destinations` |
| **Most Active Users Table** | Tables | `public.direct_messages`, `public.profiles` | `GET /api/admin/beta-analytics/active-users` |
| **Recent Feedback Table** | Tables | `public.feedback`, `public.profiles` | `GET /api/admin/beta-analytics/feedback` |

---

# API Design Strategy

## Option A: Single Aggregate Endpoint
`GET /api/admin/beta-analytics` (Single payload for the entire page)

* **Pros**:
  - Single HTTP connection overhead.
  - Simplifies frontend state management (one state holds everything).
* **Cons**:
  - Slowest query dictates total load speed (head-of-line blocking).
  - Any single query crash (e.g. database timeout on `direct_messages`) collapses the entire dashboard page.
  - Skeletons cannot be rendered per-component.

---

## Option B: Widget-Based Endpoints
`GET /api/admin/beta-analytics/overview`  
`GET /api/admin/beta-analytics/funnel`  
`GET /api/admin/beta-analytics/messaging`  
`GET /api/admin/beta-analytics/notifications`  
`GET /api/admin/beta-analytics/destinations`  
`GET /api/admin/beta-analytics/active-users`  
`GET /api/admin/beta-analytics/feedback`  

* **Pros**:
  - Independent loading and error boundaries for each UI container.
  - Flexible caching policies (overview cached for 15 mins, destinations for 2 hours, feedback for 5 mins).
  - Clean API code separation.
* **Cons**:
  - Increases HTTP round trips.

---

## Recommended Approach
We recommend **Option B: Widget-Based Endpoints**. It is standard for dashboards, allows individual widget skeleton states, handles telemetry degradation gracefully (e.g. if retention metrics fail, the rest of the widgets function), and aligns with how the waitlist analytics page maps modular components to unique data controllers.

---

# Widget Contracts

## 1. Overview KPIs (Total, Activated, Returned, Retention, Interests, Conversations, Interest Acceptance Rate)

### Endpoint
`GET /api/admin/beta-analytics/overview`

### Request
Query Parameters:
```json
{
  "dateRange": "30d",
  "batchId": "all"
}
```
*Filters supported*: `dateRange` (`7d`, `30d`, `60d`, `all`), `batchId` (specific waitlist batch IDs or `all`).

### Response Schema (JSON)
```json
{
  "totalUsers": {
    "value": 15,
    "change": 7.1,
    "trend": "up"
  },
  "activatedUsers": {
    "value": 14,
    "change": 16.6,
    "trend": "up"
  },
  "returnedUsers": {
    "value": 0,
    "change": 0.0,
    "trend": "neutral"
  },
  "retentionRate": {
    "value": 0.00,
    "change": 0.0,
    "trend": "neutral"
  },
  "interestsSent": {
    "value": 5,
    "change": 25.0,
    "trend": "up"
  },
  "conversationsCreated": {
    "value": 0,
    "change": 0.0,
    "trend": "neutral"
  },
  "interestAcceptanceRate": {
    "value": 0.00,
    "change": 0.0,
    "trend": "neutral"
  }
}
```

### Loading State Requirements
- Renders 7 separate rectangular Shadcn/iOS-style KPI block **skeletons** corresponding to the overview card positions.
- No spinner overlays.

### Error Handling Requirements
- Individual error messages within failed cards with a **Retry button** mapping reload functions.
- Fallback values default to `0` or `0.00%` on backend response parsing errors.

### Refresh Requirements
- **Every 5 minutes**
- *Reason*: Overview KPIs now include real-time match intent and acceptance rate conversions, which are essential for active closed-beta bottleneck monitoring.

---

## 2. Interest Funnel Widget

### Endpoint
`GET /api/admin/beta-analytics/funnel`

### Request
Query Parameters:
```json
{
  "batchId": "all"
}
```

### Response Schema (JSON)
```json
{
  "interestsSent": {
    "value": 5
  },
  "acceptedInterests": {
    "value": 0
  },
  "pendingInterests": {
    "value": 5
  },
  "acceptanceRate": {
    "value": 0.00
  }
}
```

### Loading State Requirements
- Skeleton container mapping horizontal funnel bars.

### Error Handling Requirements
- If the endpoint errors, display: `"Funnel metrics unavailable"`. Empty states default values to `0`.

### Refresh Requirements
- **Every 5 minutes**
- *Reason*: Measures real-time conversion blockages in match matching pathways.

---

## 3. Messaging Activity Chart

### Endpoint
`GET /api/admin/beta-analytics/messaging`

### Request
Query Parameters:
```json
{
  "dateRange": "30d"
}
```

### Response Schema (JSON)
```json
{
  "conversationsCreated": 0,
  "messagesSent": 0,
  "dailyActivity": [
    { "date": "2026-06-23", "messages": 0, "conversations": 0 },
    { "date": "2026-06-24", "messages": 0, "conversations": 0 }
  ]
}
```

### Loading State Requirements
- Renders an empty Recharts frame wrapper with a pulsing skeleton gradient background.

### Error Handling Requirements
- Displays error message: `"Failed to load messaging analytics"`. Empty graph displays a flat horizontal dotted baseline.

### Refresh Requirements
- **Every 5 minutes**
- *Reason*: Ensures chat velocity maps live app testing.

---

## 4. Notification Health Widget

### Endpoint
`GET /api/admin/beta-analytics/notifications`

### Request
Query Parameters:
```json
{
  "dateRange": "30d"
}
```

### Response Schema (JSON)
```json
{
  "notificationsCreated": 45,
  "notificationsRead": 19,
  "pushSuccess": 12,
  "pushFailure": 3,
  "noTokenCount": 30
}
```

### Loading State Requirements
- KPI lists loading placeholders.

### Error Handling Requirements
- Graceful degradation: If push callback data is missing, display alert: `"Push observability tracking limited"`.

### Refresh Requirements
- **Every 5 minutes**
- *Reason*: Real-time validation of push reliability rates during beta testing.

---

# Overview Metrics Contract

`GET /api/admin/beta-analytics/overview`

## Response Body Contract
```typescript
interface KpiStat {
  value: number;       // The aggregate metric count or calculated percentage
  change: number;      // Percentage point change compared to previous interval
  trend: 'up' | 'down' | 'neutral'; // Directional helper for semantic text color
}

interface BetaAnalyticsOverviewResponse {
  totalUsers: KpiStat;
  activatedUsers: KpiStat;
  returnedUsers: KpiStat;
  retentionRate: KpiStat;
  interestsSent: KpiStat;
  conversationsCreated: KpiStat;
  interestAcceptanceRate: KpiStat;
}
```

### Types & Fallback Values
- `value`: `number` (float for rates, integer for totals). **Non-nullable**. Default: `0`.
- `change`: `number` (float). **Non-nullable**. Default: `0.0`.
- `trend`: `'up' | 'down' | 'neutral'`. **Non-nullable**. Default: `'neutral'`.

---

# Interest Funnel Contract

`GET /api/admin/beta-analytics/funnel`

## Response Body Contract
```typescript
interface FunnelMetric {
  value: number; // Value representing count or rate
}

interface InterestFunnelResponse {
  interestsSent: FunnelMetric;
  acceptedInterests: FunnelMetric;
  pendingInterests: FunnelMetric;
  acceptanceRate: FunnelMetric;
}
```

### Percent Formatting & Empty State
- All percentage values (`acceptanceRate`) must be returned as floats (e.g. `45.22` represents `45.22%`) instead of fractions. Frontend renders this dynamically.
- **Empty State**: If zero interests have been sent, the API returns:
  ```json
  {
    "interestsSent": { "value": 0 },
    "acceptedInterests": { "value": 0 },
    "pendingInterests": { "value": 0 },
    "acceptanceRate": { "value": 0.00 }
  }
  ```

---

# Messaging Analytics Contract

`GET /api/admin/beta-analytics/messaging`

## Response Body Contract
```typescript
interface DailyMessagingItem {
  date: string;          // Format: "YYYY-MM-DD"
  messages: number;      // Total messages sent on this day (excluding 'init')
  conversations: number; // Total stranger conversations created on this day
}

interface MessagingAnalyticsResponse {
  conversationsCreated: number;
  messagesSent: number;
  dailyActivity: DailyMessagingItem[];
}
```

### Empty State
If no messaging occurred in the query timeframe:
- `conversationsCreated`: `0`
- `messagesSent`: `0`
- `dailyActivity`: Returns dates filled with `0` values to populate Recharts lines consistently.

---

# Notification Analytics Contract

`GET /api/admin/beta-analytics/notifications`

## Response Body Contract
```typescript
interface NotificationAnalyticsResponse {
  notificationsCreated: number;
  notificationsRead: number;
  pushSuccess: number;
  pushFailure: number;
  noTokenCount: number;
}
```

### Success Rate & Missing Tracking
- **Success Rate Calculation**: Calculated on the client as `(pushSuccess / (pushSuccess + pushFailure)) * 100`.
- **Telemetry Missing**: If `push_status` database data fails to sync, the API drops those counts to `0` and flags payload logs.

---

# Chart Contracts

## 1. Growth Charts Series (User & Onboarding Growth)

### Endpoint
`GET /api/admin/beta-analytics/growth`

### Response Shape
```json
{
  "series": [
    {
      "name": "User Signups",
      "data": [
        { "date": "2026-06-20", "value": 15 },
        { "date": "2026-06-21", "value": 16 }
      ]
    },
    {
      "name": "Profiles Completed",
      "data": [
        { "date": "2026-06-20", "value": 10 },
        { "date": "2026-06-21", "value": 11 }
      ]
    }
  ]
}
```

### UX States Handling
- **Empty State**: Renders empty chart layout with overlay message `"No signups detected in range"`.
- **Error State**: Renders error border container with a retry action block.
- **Loading State**: Pulsing skeleton block matching chart boundaries.

---

# Table Contracts

## 1. Top Destinations Table

### Endpoint
`GET /api/admin/beta-analytics/destinations`

### Query Parameters
```json
{
  "page": 1,
  "pageSize": 10,
  "sortBy": "count",
  "sortOrder": "desc"
}
```

### Response Shape
```json
{
  "rows": [
    { "rank": 1, "destination": "Goa", "count": 12, "percentage": 80.0 },
    { "rank": 2, "destination": "Manali", "count": 4, "percentage": 26.7 }
  ],
  "total": 2,
  "page": 1,
  "pageSize": 10
}
```

- **Sorting**: Supported on `destination` (alphabetical), `count` (numeric), or `percentage`.
- **Filtering**: Filters on active beta cohort batch.
- **Pagination**: Uses standard `<Button>` controls syncing URL index counts.
- **Empty State**: Renders single row spans: `"No active travel intentions found"`.

---

## 2. Most Active Users Table

### Endpoint
`GET /api/admin/beta-analytics/active-users`

### Query Parameters
```json
{
  "page": 1,
  "pageSize": 10
}
```

### Response Shape
```json
{
  "rows": [
    { "id": "uuid-1", "name": "Alice", "email": "alice@gmail.com", "sent": 45 },
    { "id": "uuid-2", "name": "Bob", "email": "bob@gmail.com", "sent": 20 }
  ],
  "total": 2,
  "page": 1,
  "pageSize": 10
}
```

---

## 3. Recent Feedback Table

### Endpoint
`GET /api/admin/beta-analytics/feedback`

### Query Parameters
```json
{
  "page": 1,
  "pageSize": 5
}
```

### Response Shape
```json
{
  "rows": [
    { "id": "feed-1", "name": "Alice", "type": "bug", "message": "Explore crashes", "created_at": "2026-06-24T12:00:00Z" }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 5
}
```

---

# Filter Contract

The dashboard leverages **Global Filters** mounted in the header command panel that update Next.js router strings.

### Request Format (Query parameters)
`?dateRange=30d&batchId=cohort_v1`

### Supported Values
- `dateRange`: `'7d' | '30d' | '60d' | 'all'` (defaults to `'30d'`)
- `batchId`: `'all'` or specific string cohort names like `'batch_1'`, `'batch_2'`.

### Validation Rules
- `dateRange` must match the string enum structure to avoid database SQL interval injection risks.
- `batchId` must be sanitized or validated against waitlist table distinct cohorts.

---

# Server Action Contracts

To maintain strict alignment with the existing codebase patterns, **zero server actions** are created in components directories. However, we define standard service-tier helper classes that execute queries:

## Existing Reusable Actions
- None (The project does not configure reusable server-side actions, handling analytics directly in routes).

---

## New Service Methods (Mocked Backend Logic)

### 1. `getOverviewMetrics()`
- **Inputs**: `{ dateRange: string; batchId: string }`
- **Outputs**: `BetaAnalyticsOverviewResponse`
- **Error Handling**: Catches SQL failure and returns fallback object with `0` values.
- **Cache Policy**: Redis cache key `cache:analytics:overview`, TTL 15 minutes.

### 2. `getInterestMetrics()`
- **Inputs**: `{ batchId: string }`
- **Outputs**: `InterestFunnelResponse`
- **Cache Policy**: Redis cache key `cache:analytics:interests`, TTL 5 minutes.

### 3. `getMessagingMetrics()`
- **Inputs**: `{ dateRange: string }`
- **Outputs**: `MessagingAnalyticsResponse`
- **Cache Policy**: Redis cache key `cache:analytics:messages`, TTL 5 minutes.

### 4. `getNotificationMetrics()`
- **Inputs**: `{ dateRange: string }`
- **Outputs**: `NotificationAnalyticsResponse`
- **Cache Policy**: Redis cache key `cache:analytics:notifications`, TTL 5 minutes.

---

# Error Contract

Every endpoint returning HTTP status errors maps a unified JSON schema payload to prevent client-side script crashes.

### Standard Error Schema
```json
{
  "success": false,
  "error": {
    "code": "ANALYTICS_QUERY_FAILED",
    "message": "Unable to load analytics overview. Database connection timeout.",
    "trackingId": "err_5b821a8cd2"
  }
}
```

### Error Codes Inventory
- `UNAUTHORIZED_ADMIN_REQUIRED`: User session is invalid or does not have admin permissions.
- `INVALID_FILTER_PARAMETER`: Query string bounds are out of enums.
- `DATABASE_TIMEOUT`: Supabase connection thread issues.
- `ANALYTICS_QUERY_FAILED`: Internal SQL runner exception.

### Retry Policy & UI Handling
- Frontend components will intercept this schema, report the `message` string inside the widget wrapper, and render an inline **Retry** control that triggers a client reload.

---

# Loading Contract

Frontend widgets must follow unified Shadcn/iOS visual loading patterns:

- **KPI skeletons**: Empty bordered panels with a light gray pulsing background layout:
  ```html
  <div class="h-20 w-full animate-pulse rounded-lg bg-muted/60" />
  ```
- **Chart skeletons**: A rectangular container displaying a centered Lucide `<Loader2 className="animate-spin text-muted-foreground" />` icon.
- **Table skeletons**: Standard border grids populated with 5 rows of thin placeholder text lines.

---

# API Dependency Matrix

| Endpoint | Metrics Calculated | Tables Involved | Risk Level |
| :--- | :--- | :--- | :--- |
| **`/api/admin/beta-analytics/overview`** | Total, Activated, Returned Users, Retention Rate | `users`, `profiles`, `admins` | **High** (Blocked by `last_seen_at` telemetry gap) |
| **`/api/admin/beta-analytics/funnel`** | Interests sent, pending, accepted, acceptance rate | `match_interests`, `profiles`, `admins` | **Low** |
| **`/api/admin/beta-analytics/messaging`** | Conversations created, messages sent, daily timeline | `direct_messages`, `conversations`, `admins` | **Medium** (High query loads on messaging database scans) |
| **`/api/admin/beta-analytics/notifications`** | Notifications created, read rate, push outcomes | `notifications`, `profiles`, `admins` | **Low** |
| **`/api/admin/beta-analytics/destinations`** | Popular destination rankings | `profiles` | **Medium** (Table scan unnesting JSONB arrays) |
| **`/api/admin/beta-analytics/active-users`** | Top active messaging rank | `direct_messages`, `profiles`, `admins` | **Medium** |
| **`/api/admin/beta-analytics/feedback`** | Recent feedback list | `feedback`, `profiles` | **Low** |

---

# Frontend Integration Notes

## Component Consuming Endpoints
1. **`OverviewGrid`** (Overview KPIs card layout wrapper)
   - *Expects*: `BetaAnalyticsOverviewResponse`
   - *Existing Component*: None (must be created to coordinate the layout of the 4 KPI cards).
2. **`FunnelCard`** (Funnel Section chart)
   - *Expects*: `InterestFunnelResponse`
   - *Reusability*: Reuses `apps/admin/components/admin/Funnel.tsx` with minor extensions to accept custom prop metrics arrays.
3. **`GrowthCharts`** (Dual recharts area charts)
   - *Expects*: `MessagingAnalyticsResponse`
   - *Reusability*: Reuses `apps/admin/components/admin/GrowthChart.tsx` without modifications.
4. **`EngagementGrid`** (FCM push health cards)
   - *Expects*: `NotificationAnalyticsResponse`
   - *Reusability*: Reuses styled layout rows from `<GroupContainer>` and `<ListRow>` widgets.

---

# Final Readiness Assessment

- **Endpoints Reusable**:
  - `/api/admin/metrics` (used only for system status counters).
  - `/api/admin/feedback` (used for inline feedback review links).
- **New Endpoints Required**:
  - `GET /api/admin/beta-analytics/overview`
  - `GET /api/admin/beta-analytics/funnel`
  - `GET /api/admin/beta-analytics/messaging`
  - `GET /api/admin/beta-analytics/notifications`
  - `GET /api/admin/beta-analytics/destinations`
  - `GET /api/admin/beta-analytics/active-users`
  - `GET /api/admin/beta-analytics/feedback`
- **Contracts Ready For Implementation**: Yes. Schema structures, error JSON parameters, and UI integration designs are fully finalized.
- **Open Questions**: None.
- **Blockers**: Patching the authenticated session telemetry middleware to write active timestamps to `users.last_seen_at`.
