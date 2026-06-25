import { supabaseAdmin, redis, ensureRedisConnection } from "@kovari/api";

// =============================================================
// Type & Data Contracts Definitions
// =============================================================

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
 * Individual KPI metric result item supporting trend analysis.
 */
export interface KpiStat {
  value: number;       // The aggregate metric count or calculated percentage
  change: number;      // Percentage point change compared to previous interval
  trend: 'up' | 'down' | 'neutral'; // Directional helper for UI color coding
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
 * Data item representing popular travel targets unnested from intentions arrays.
 */
export interface DestinationRow {
  rank: number;
  destination: string;
  count: number;
  percentage: number;
}

/**
 * Contract mapping for the GET /api/admin/beta-analytics/destinations endpoint.
 */
export interface DestinationResponse {
  rows: DestinationRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Data item for active cohort user message sending aggregates.
 */
export interface ActiveUserRow {
  id: string;
  name: string;
  email: string;
  sent: number;
}

/**
 * Contract mapping for the GET /api/admin/beta-analytics/active-users endpoint.
 */
export interface ActiveUsersResponse {
  rows: ActiveUserRow[];
  total: number;
  page: number;
  pageSize: number;
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
 * Contract mapping for the GET /api/admin/beta-analytics/feedback endpoint.
 */
export interface FeedbackResponse {
  rows: FeedbackRow[];
  total: number;
  page: number;
  pageSize: number;
}

// =============================================================
// Analytics Service Implementation
// =============================================================

/**
 * Foundational service acts as the single source of truth for fetching,
 * processing, and caching analytical queries for the Beta Analytics dashboard.
 * 
 * Bypasses direct user RLS policies via the service-role client (`supabaseAdmin`)
 * to allow cross-system reports, while containing Redis cache handling.
 */
export class AnalyticsService {
  private static CACHE_PREFIX = "cache:beta_analytics";

  /**
   * Builds formatted and consistent Redis cache keys based on filters.
   * 
   * @param segment - The specific metrics route name (e.g. "overview")
   * @param filters - The parameters key-value records applied
   * @returns The combined key namespace string
   */
  public static getCacheKey(segment: string, filters: Record<string, unknown>): string {
    const sortedKeys = Object.keys(filters).sort();
    const filterSuffix = sortedKeys.map((key) => `${key}:${filters[key]}`).join("_");
    return `${this.CACHE_PREFIX}:${segment}:${filterSuffix || "all"}`;
  }

  /**
   * Helper utility wrapping target database tasks with a Redis cache interface.
   * If Redis is inaccessible or errors, it yields control gracefully to direct queries.
   * 
   * @param cacheKey - Cache key location matching the specific query and segment
   * @param ttlSeconds - Expiration seconds threshold before key eviction
   * @param fetchFn - The actual database query execution resolver
   */
  public static async fetchWithCache<T>(
    cacheKey: string,
    ttlSeconds: number,
    fetchFn: () => Promise<T>
  ): Promise<T> {
    try {
      await ensureRedisConnection();
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as T;
      }
    } catch (e) {
      console.warn(`[Analytics Cache] Read failure for key ${cacheKey}. Falling back to DB:`, e);
    }

    const data = await fetchFn();

    try {
      await ensureRedisConnection();
      await redis.setEx(cacheKey, ttlSeconds, JSON.stringify(data));
    } catch (e) {
      console.warn(`[Analytics Cache] Write failure for key ${cacheKey}:`, e);
    }

    return data;
  }

  /**
   * Flush all dashboard cache variables upon administrative events.
   */
  public static async invalidateCache(): Promise<void> {
    try {
      await ensureRedisConnection();
      const pattern = `${this.CACHE_PREFIX}:*`;
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(keys);
        console.log(`[Analytics Cache] Flushed ${keys.length} keys.`);
      }
    } catch (e) {
      console.error("[Analytics Cache] Failed to invalidate cache keys:", e);
    }
  }

  /**
   * Sanitizes dashboard filter properties to secure interval parameters.
   */
  public static validateFilters(filters: Partial<AnalyticsFilter>): Required<AnalyticsFilter> {
    const dateRange = filters.dateRange && ['7d', '30d', '60d', 'all'].includes(filters.dateRange)
      ? filters.dateRange
      : '30d';
    const batchId = filters.batchId || 'all';
    return { dateRange, batchId };
  }

  /**
   * Converts a dateRange enum selection to absolute start and end ISO strings.
   * 
   * @param dateRange - The code duration string
   */
  public static getDateRangeBounds(dateRange: DateRange): { startDateISO: string; endDateISO: string } {
    const now = new Date();
    const startDate = new Date();

    switch (dateRange) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '60d':
        startDate.setDate(now.getDate() - 60);
        break;
      case 'all':
      default:
        startDate.setFullYear(2020, 0, 1);
        break;
    }

    return {
      startDateISO: startDate.toISOString(),
      endDateISO: now.toISOString(),
    };
  }

  /**
   * Fetch overview stats comparing current values against baseline offsets.
   * 
   * @param filters - Active page selectors
   */
  public static async getOverviewMetrics(filters: AnalyticsFilter): Promise<BetaAnalyticsOverviewResponse> {
    const { dateRange, batchId } = this.validateFilters(filters);
    const cacheKey = this.getCacheKey("overview", { dateRange, batchId });

    return this.fetchWithCache(cacheKey, 900, async () => {
      // TODO: Connect SQL metrics in Phase 2
      return {
        totalUsers: { value: 0, change: 0.0, trend: 'neutral' },
        activatedUsers: { value: 0, change: 0.0, trend: 'neutral' },
        returnedUsers: { value: 0, change: 0.0, trend: 'neutral' },
        retentionRate: { value: 0.0, change: 0.0, trend: 'neutral' },
        interestsSent: { value: 0, change: 0.0, trend: 'neutral' },
        conversationsCreated: { value: 0, change: 0.0, trend: 'neutral' },
        interestAcceptanceRate: { value: 0.0, change: 0.0, trend: 'neutral' },
      };
    });
  }

  /**
   * Fetch funnel conversion metrics.
   * 
   * @param filters - Contains target waitlist cohort
   */
  public static async getInterestMetrics(filters: Pick<AnalyticsFilter, 'batchId'>): Promise<InterestFunnelResponse> {
    const batchId = filters.batchId || 'all';
    const cacheKey = this.getCacheKey("funnel", { batchId });

    return this.fetchWithCache(cacheKey, 300, async () => {
      // TODO: Connect SQL metrics in Phase 2
      return {
        interestsSent: { value: 0 },
        acceptedInterests: { value: 0 },
        pendingInterests: { value: 0 },
        acceptanceRate: { value: 0.0 },
      };
    });
  }

  /**
   * Fetch aggregated daily messaging timelines.
   * 
   * @param filters - Active date limitations
   */
  public static async getMessagingMetrics(filters: Pick<AnalyticsFilter, 'dateRange'>): Promise<MessagingAnalyticsResponse> {
    const dateRange = filters.dateRange || '30d';
    const cacheKey = this.getCacheKey("messaging", { dateRange });

    return this.fetchWithCache(cacheKey, 300, async () => {
      // TODO: Connect SQL metrics in Phase 2
      return {
        conversationsCreated: 0,
        messagesSent: 0,
        dailyActivity: [],
      };
    });
  }

  /**
   * Fetch notification dispatch statistics.
   * 
   * @param filters - Active date limitations
   */
  public static async getNotificationMetrics(filters: Pick<AnalyticsFilter, 'dateRange'>): Promise<NotificationAnalyticsResponse> {
    const dateRange = filters.dateRange || '30d';
    const cacheKey = this.getCacheKey("notifications", { dateRange });

    return this.fetchWithCache(cacheKey, 300, async () => {
      // TODO: Connect SQL metrics in Phase 2
      return {
        notificationsCreated: 0,
        notificationsRead: 0,
        pushSuccess: 0,
        pushFailure: 0,
        noTokenCount: 0,
      };
    });
  }

  /**
   * Fetch paginated list of unnested destination popularities.
   */
  public static async getTopDestinations(params: {
    page: number;
    pageSize: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    batchId?: string;
  }): Promise<DestinationResponse> {
    const { page, pageSize, sortBy = 'count', sortOrder = 'desc', batchId = 'all' } = params;
    const cacheKey = this.getCacheKey("destinations", { page, pageSize, sortBy, sortOrder, batchId });

    return this.fetchWithCache(cacheKey, 7200, async () => {
      // TODO: Connect SQL metrics in Phase 2
      return {
        rows: [],
        total: 0,
        page,
        pageSize,
      };
    });
  }

  /**
   * Fetch ranking records of messaging actions per registered user.
   */
  public static async getMostActiveUsers(params: {
    page: number;
    pageSize: number;
  }): Promise<ActiveUsersResponse> {
    const { page, pageSize } = params;
    const cacheKey = this.getCacheKey("active-users", { page, pageSize });

    return this.fetchWithCache(cacheKey, 1800, async () => {
      // TODO: Connect SQL metrics in Phase 2
      return {
        rows: [],
        total: 0,
        page,
        pageSize,
      };
    });
  }

  /**
   * Fetch recent feedback records submitted by active cohort.
   */
  public static async getRecentFeedback(params: {
    page: number;
    pageSize: number;
  }): Promise<FeedbackResponse> {
    const { page, pageSize } = params;
    const cacheKey = this.getCacheKey("recent-feedback", { page, pageSize });

    return this.fetchWithCache(cacheKey, 300, async () => {
      // TODO: Connect SQL metrics in Phase 2
      return {
        rows: [],
        total: 0,
        page,
        pageSize,
      };
    });
  }
}
