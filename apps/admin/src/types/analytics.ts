import { UserProfile } from "@kovari/types";

/**
 * Supported date range selection filter options.
 */
export type DateRange = '7d' | '30d' | '60d' | 'all';

/**
 * Filter properties applied globally to metrics selection queries.
 */
export interface AnalyticsFilter {
  dateRange?: DateRange;
  batchId?: string;
}

/**
 * Directional helper for semantic indicator color highlights.
 */
export type TrendDirection = 'up' | 'down' | 'neutral';

/**
 * Standard single KPI statistical value with trend indicator offsets.
 */
export interface KpiStat {
  value: number;       // The aggregate metric count or calculated percentage
  change: number;      // Percentage point change compared to previous interval
  trend: TrendDirection;
}

/**
 * Interface representing the top-level Overview KPIs.
 */
export interface AnalyticsOverview {
  totalUsers: KpiStat;
  activatedUsers: KpiStat;
  onboardedUsers: KpiStat;
  interestsSent: KpiStat;
  conversationsCreated: KpiStat;
  messagesSent: KpiStat;
  notificationsSent: KpiStat;
  feedbackSubmitted: KpiStat;
  waitlistConversions: KpiStat;
}

/**
 * Contract mapping for the GET /api/admin/beta-analytics/overview endpoint.
 */
export interface BetaAnalyticsOverviewResponse {
  totalUsers: KpiStat;
  activatedUsers: KpiStat;
  returnedUsers: KpiStat;
  retentionRate: KpiStat;
  interestsSent: KpiStat;
  conversationsCreated: KpiStat;
  interestAcceptanceRate: KpiStat;
}

/**
 * Cohort retention and user engagement frequency metrics.
 */
export interface RetentionMetrics {
  dau: number;                   // Daily Active Users count
  wau: number;                   // Weekly Active Users count
  mau: number;                   // Monthly Active Users count
  stickinessRatio: number;       // DAU/MAU ratio as float percentage (e.g. 15.5 represents 15.5%)
  retentionTimeline: {           // Historical cohort retention curves
    date: string;                // Date format: "YYYY-MM-DD"
    day1: number;                // Day 1 retention percentage
    day7: number;                // Day 7 retention percentage
    day30: number;               // Day 30 retention percentage
  }[];
}

/**
 * Individual target destination popularity stats.
 */
export interface DestinationPopularity {
  rank: number;
  destination: string;
  count: number;
  percentage: number;
}

/**
 * Popular destination and unnested intentions metrics.
 */
export interface TravelIntentionMetrics {
  rows: DestinationPopularity[];
  totalDestinations: number;
  totalIntentionsCount: number;
  intentionsGrowthTimeline: {
    date: string;                // Date format: "YYYY-MM-DD"
    count: number;
  }[];
}

/**
 * Paged response contract for travel intentions.
 */
export interface DestinationResponse {
  rows: DestinationPopularity[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Individual conversion funnel stage metrics.
 */
export interface FunnelStepItem {
  stage: string;
  label: string;
  count: number | null;
  pct: number | null;
  warning?: string;
}

/**
 * Generic single funnel step conversion state.
 */
export interface FunnelMetric {
  value: number;
}

/**
 * Contract mapping for the GET /api/admin/beta-analytics/funnel endpoint.
 */
export interface InterestFunnelResponse {
  interestsSent: FunnelMetric;
  acceptedInterests: FunnelMetric;
  pendingInterests: FunnelMetric;
  acceptanceRate: FunnelMetric;
}

/**
 * Funnel progression indicators for sent, pending, and accepted matching signals.
 */
export interface InterestMetrics {
  interestsSent: number;
  acceptedInterests: number;
  pendingInterests: number;
  acceptanceRate: number;        // Total acceptance rate as float percentage
  funnelSteps: FunnelStepItem[]; // 9-Stage funnel steps metrics
}

/**
 * Active user messaging details for tables.
 */
export interface ActiveUserMessagingRow {
  userId: string;
  name: string;
  email: string;
  messagesSent: number;
  messagesReceived: number;
  userProfile?: UserProfile;     // Reuse of shared type definition from @kovari/types
}

/**
 * Individual active user table item.
 */
export interface ActiveUserRow {
  id: string;
  name: string;
  email: string;
  sent: number;
}

/**
 * Paged response contract for most active users.
 */
export interface ActiveUsersResponse {
  rows: ActiveUserRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Aggregated messaging logs for a single day.
 */
export interface DailyMessagingItem {
  date: string;          // Format: "YYYY-MM-DD"
  messages: number;      // Total messages sent on this day (excluding 'init')
  conversations: number; // Total stranger conversations created on this day
}

/**
 * Contract mapping for the GET /api/admin/beta-analytics/messaging endpoint.
 */
export interface MessagingAnalyticsResponse {
  conversationsCreated: number;
  messagesSent: number;
  dailyActivity: DailyMessagingItem[];
}

/**
 * Active user messaging volume, text exchange counts, and chat logs.
 */
export interface ConversationMetrics {
  totalConversations: number;
  totalMessagesSent: number;
  dailyMessagingActivity: DailyMessagingItem[];
  mostActiveUsers: ActiveUserMessagingRow[];
}

/**
 * Contract mapping for the GET /api/admin/beta-analytics/notifications endpoint.
 */
export interface NotificationAnalyticsResponse {
  notificationsCreated: number;
  notificationsRead: number;
  pushSuccess: number;
  pushFailure: number;
  noTokenCount: number;
}

/**
 * Data item representing customer issues logged.
 */
export interface FeedbackRow {
  id: string;
  name: string;
  type: string;
  message: string;
  created_at: string;
}

/**
 * Paged response contract for recent feedback.
 */
export interface FeedbackResponse {
  rows: FeedbackRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Profile structure returned from Supabase profiles relationship join.
 */
export interface ProfileJoined {
  email: string | null;
  name: string | null;
  travel_intentions: any;
  created_at: string | null;
  username: string | null;
  profile_photo: string | null;
}

/**
 * Combined organic user and profile query result.
 */
export interface OrganicUser {
  id: string;
  email: string | null;
  beta_status: string | null;
  onboarding_completed: boolean;
  isDeleted: boolean;
  last_seen_at: string | null;
  activation_date: string | null;
  clerk_user_id: string | null;
  profiles: ProfileJoined | ProfileJoined[] | null;
}
