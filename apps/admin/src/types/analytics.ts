import { UserProfile } from "@kovari/types";

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
 * Active user messaging volume, text exchange counts, and chat logs.
 */
export interface ConversationMetrics {
  totalConversations: number;
  totalMessagesSent: number;
  dailyMessagingActivity: {
    date: string;                // Date format: "YYYY-MM-DD"
    messages: number;
    conversations: number;
  }[];
  mostActiveUsers: ActiveUserMessagingRow[];
}
