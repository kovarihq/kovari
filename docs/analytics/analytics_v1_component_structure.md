# Kovari Analytics V1 Component Structure & Architecture

This document defines the complete frontend component hierarchy, file organization, state boundaries, props contracts, data-fetching behaviors, and visual fallback states for the Kovari Beta Analytics V1 platform.

---

# Component Hierarchy Directory Map

All files live under `apps/admin/app/beta-analytics/` to maintain the flat routing structure of the Admin portal:

```
apps/admin/app/beta-analytics/
├── page.tsx                     # Entrypoint & Page Shell
├── components/
│   ├── BetaAnalyticsHeader.tsx  # Header Filters & Sync Controls
│   ├── OverviewGrid.tsx         # Executive KPI Card Deck (6 Cards)
│   ├── MatchFunnelSection.tsx   # Drop-off Funnel Chart Widget
│   ├── TravelIntentionsSection.tsx # Popular travel destination stats
│   ├── NotificationHealthSection.tsx # FCM Push health logs
│   ├── RetentionSection.tsx     # Active Cohorts retention curves
│   └── RecentActivitySection.tsx # Recent logs table deck
├── hooks/
│   └── useBetaAnalytics.ts      # Core analytics fetching hooks
└── types.ts                     # UI Interface TypeScript definitions
```

---

# Detailed Component Specifications

## 1. Page Shell: `AnalyticsPage`
- **File Path**: `apps/admin/app/beta-analytics/page.tsx`
- **Type**: Server Component (initial layout wrapper) rendering Client Components.
- **Props**: None.
- **Responsibilities**:
  - Validates user administrator credentials.
  - Mounts the `AdminLayoutWrapper` navigation sidebar shell.
  - Controls grid sizing parameters across Viewports.
- **Render Hierarchy**:
  ```text
  AnalyticsPage (Server)
  └── AdminLayoutWrapper (Client Layout)
      ├── BetaAnalyticsHeader (Client Filters)
      ├── OverviewGrid (Client KPIs)
      ├── MainGrid (2 Columns)
      │   ├── MatchFunnelSection (Left Col)
      │   └── RightColWrapper
      │       ├── RetentionSection (Top Right)
      │       └── NotificationHealthSection (Bottom Right)
      ├── TravelIntentionsSection (Full Width)
      └── RecentActivitySection (3 Tables Deck)
  ```

---

## 2. Header & Controls: `BetaAnalyticsHeader`
- **File Path**: `apps/admin/app/beta-analytics/components/BetaAnalyticsHeader.tsx`
- **Type**: Client Component.
- **State & Routing**:
  - Uses `useSearchParams()`, `usePathname()`, and `useRouter()` to read/write state parameters to the URL query string (`?dateRange=val&batchId=val`).
  - Toggling selectors updates browser URL parameters which trigger React state refreshes in the child cards.
- **Sub-components Reused**:
  - Radix select widgets from `apps/admin/components/ui/select`.
  - Inline custom calendar popovers from `apps/admin/components/ui/popover`.
- **UI Elements**:
  - Title and Subtitle.
  - Date Range Dropdown Selector (`7d`, `30d`, `90d`, `Custom`).
  - Waitlist Batch Selector (cohort dropdown list populated from `public.waitlist`).
  - Refresh Button with animated spinner indicating loading state.

---

## 3. Executive Dashboard KPIs: `OverviewGrid`
- **File Path**: `apps/admin/app/beta-analytics/components/OverviewGrid.tsx`
- **Type**: Client Component.
- **Data Fetching**:
  - Calls `GET /api/admin/beta-analytics/overview?dateRange=val&batchId=val` via `useBetaAnalytics` hook.
- **Props**:
  - `filters`: `{ dateRange: string, batchId: string }`
- **Render Output**: A responsive grid containing exactly **6 KPI cards** wrapping `MetricCard`:
  1. **Users Card**: Active registered users (`isDeleted = false`).
  2. **Activation Card**: Count and % of waitlist sync conversions (`beta_status = 'activated'`).
  3. **Returned Card**: Daily user returns cohort telemetry.
  4. **Retention Card**: Overall Day 1 cohort retention rate.
  5. **Interests Card**: Unilateral matching signals sent.
  6. **Interest Acceptance Rate Card**: Stranger-only decided acceptance rate.
- **Reusability**: Reuses `apps/admin/components/admin/MetricCard.tsx` (100% code reuse).
- **UX Fallbacks**:
  - **Loading**: Renders 6 pulsing skeleton borders matching card sizes.
  - **Empty state**: Fallback values to `0` or `0.00%`.
  - **Error state**: Catches query fail, displaying inline retry controls.

---

## 4. Match Progression Funnel: `MatchFunnelSection`
- **File Path**: `apps/admin/app/beta-analytics/components/MatchFunnelSection.tsx`
- **Type**: Client Component.
- **Data Fetching**:
  - Calls `GET /api/admin/beta-analytics/funnel?batchId=val`.
- **Reusability**: Refactors existing `apps/admin/components/admin/Funnel.tsx` (70% reuse).
  - *Modification*: Generalize the props contract to accept an array of steps rather than hardcoding.
- **Props**:
  - `steps`: `FunnelStep[]` where:
    ```typescript
    interface FunnelStep {
      label: string;
      value: number | null;
      percentage: number | null;
      warning?: string; // e.g. "Telemetry Missing" for Explore viewed
    }
    ```
- **UX Fallbacks**:
  - **Explore Viewed Alert**: Render Stage 5 as a dashed gray progression bar displaying a tooltip warning: `"Explore screen activity requires client telemetry instrumentation."`

---

## 5. Travel Intention Table: `TravelIntentionsSection`
- **File Path**: `apps/admin/app/beta-analytics/components/TravelIntentionsSection.tsx`
- **Type**: Client Component.
- **Data Fetching**:
  - Calls `GET /api/admin/beta-analytics/destinations?batchId=val`.
- **UI Elements**: Renders destination intents inside standard Shadcn grid tables:
  - Columns: Rank, Destination, Count, Total Cohort Percentage.
- **UX Fallbacks**:
  - **Empty state**: Renders single row span reading `"No active travel intentions found for selected cohort."`

---

## 6. iOS Dispatch Observability: `NotificationHealthSection`
- **File Path**: `apps/admin/app/beta-analytics/components/NotificationHealthSection.tsx`
- **Type**: Client Component.
- **Data Fetching**:
  - Calls `GET /api/admin/beta-analytics/notifications?dateRange=val`.
- **Reusability**: Reuses `GroupContainer` and `ListRow` elements from the project UI directories.
- **Render Output**: Detailed iOS-styled alert rows:
  - Created Alerts count.
  - Read Rate percentage (color-coded thresholds).
  - Push Success rate.
  - Push Failure rate.
  - **No Token Warning Row**: Highlighted in red if the number of users without push device tokens exceeds 20% of the cohort.
- **UX Fallbacks**:
  - **Critical Alert**: If `noTokenCount` exceeds threshold, display warning icon `🚨` and advice popover: `"Invite delivery limited. Active device tokens missing."`

---

## 7. Cohort Active Retention: `RetentionSection`
- **File Path**: `apps/admin/app/beta-analytics/components/RetentionSection.tsx`
- **Type**: Client Component.
- **Data Fetching**:
  - Calls `GET /api/admin/beta-analytics/overview` (overall KPIs) and `GET /api/admin/beta-analytics/growth` (for timeline curves).
- **UX & Blocker Info**:
  - Displays dynamic warning header explaining the active telemetry blocker:
    > [!WARNING]
    > **Retention Telemetry Blocker Active**: `last_seen_at` updates are currently frozen on registration. All returning cohort metrics will display as `0.00%` until the Next.js middleware telemetry patch is deployed.
  - Renders Recharts Area curve diagrams displaying user retention.

---

## 8. Categorical Tables: `RecentActivitySection`
- **File Path**: `apps/admin/app/beta-analytics/components/RecentActivitySection.tsx`
- **Type**: Client Component.
- **Data Fetching**:
  - Calls isolated API endpoints (`/feedback`, `/overview`) to load tables independently.
- **Grid Layout**: `grid grid-cols-1 md:grid-cols-3 gap-6` displaying:
  1. **Recent Interests Table**: Sender, Recipient, Status badge (pending/accepted), and Sent Time.
  2. **Recent Notifications Table**: Recipient, Alert Type, FCM push status, and Dispatch Time.
  3. **Recent Conversations Table**: Interlocutors, messages exchanged, and last message timestamp.
- **UX Fallbacks**:
  - Tables utilize separate skeleton loaders, permitting independent pagination triggers.

---

# Component State & Data Fetching Hook

## Hook: `useBetaAnalytics`
- **File Path**: `apps/admin/app/beta-analytics/hooks/useBetaAnalytics.ts`
- **Signature**:
  ```typescript
  function useBetaAnalytics<T>(endpoint: string, filters: { dateRange: string, batchId: string }): {
    data: T | null;
    isLoading: boolean;
    error: Error | null;
    refetch: () => Promise<void>;
  }
  ```
- **Responsibilities**:
  - Implements browser `fetch` requests pointing to route controllers.
  - Parses structured error JSON packets (`{ success: false, error: { message } }`).
  - Coordinates client polling loops for real-time widgets.
