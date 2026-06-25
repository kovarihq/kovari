import { supabaseAdmin, redis, ensureRedisConnection } from "@kovari/api";
import * as Sentry from "@sentry/nextjs";
import { 
  AnalyticsFilter,
  BetaAnalyticsOverviewResponse,
  InterestFunnelResponse,
  MessagingAnalyticsResponse,
  NotificationAnalyticsResponse,
  DestinationResponse,
  ActiveUsersResponse,
  FeedbackResponse,
  TravelIntentionMetrics,
  InterestMetrics,
  ConversationMetrics,
  DestinationPopularity,
  FunnelStepItem,
  ActiveUserMessagingRow,
  DateRange
} from "../../types/analytics";
import { incrementErrorCounter } from "../../../lib/incrementErrorCounter";

// =============================================================
// Analytics Service Implementation
// =============================================================

/**
 * Service class acting as the single source of truth for fetching,
 * processing, and caching analytical queries for the Beta Analytics dashboard.
 * 
 * Bypasses direct user RLS policies via the service-role client (`supabaseAdmin`)
 * to allow cross-system reports, while containing Redis cache handling.
 */
export class AnalyticsService {
  private static CACHE_PREFIX = "cache:beta_analytics";

  /**
   * Helper function to fetch all admin email addresses.
   * Returns a lowercase Set of admin emails for fast exclusions.
   */
  private static async getAdminEmailsSet(): Promise<Set<string>> {
    try {
      const { data: admins, error } = await supabaseAdmin.from('admins').select('email');
      if (error) {
        console.warn("[Analytics Service] Failed to fetch admins, proceeding without exclusions:", error.message);
        Sentry.captureException(error, { tags: { query: 'fetch_admins_error' } });
      }
      return new Set(admins?.map((a: any) => a?.email?.toLowerCase()).filter(Boolean) || []);
    } catch (e) {
      console.error("[Analytics Service] getAdminEmailsSet critically failed:", e);
      Sentry.captureException(e);
      return new Set<string>();
    }
  }

  /**
   * Helper function to query organic users (excluding admins/founders).
   * Fetches users and merges profiles to run anti-joins in memory.
   */
  private static async getOrganicUsers(): Promise<any[]> {
    try {
      const adminEmails = await this.getAdminEmailsSet();

      const { data: users, error } = await supabaseAdmin
        .from('users')
        .select('id, email, beta_status, onboarding_completed, isDeleted, last_seen_at, activation_date, profiles(email, name, travel_intentions, created_at, username, profile_photo)')
        .eq('isDeleted', false);

      if (error) {
        console.error("[Analytics Service] getOrganicUsers query failed:", error.message);
        Sentry.captureException(error, { tags: { query: 'fetch_organic_users_error' } });
        await incrementErrorCounter();
        return [];
      }

      return (users || []).filter((u: any) => {
        if (!u) return false;
        const profile = u.profiles && !Array.isArray(u.profiles) ? u.profiles : (Array.isArray(u.profiles) && u.profiles.length > 0 ? u.profiles[0] : null);
        const email = (profile?.email || u.email || '')?.toLowerCase();
        return email && !adminEmails.has(email);
      });
    } catch (e) {
      console.error("[Analytics Service] getOrganicUsers critically failed:", e);
      Sentry.captureException(e);
      await incrementErrorCounter();
      return [];
    }
  }

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
      Sentry.captureException(e, { tags: { cache: 'read_error', cacheKey } });
    }

    const data = await fetchFn();

    try {
      await ensureRedisConnection();
      await redis.setEx(cacheKey, ttlSeconds, JSON.stringify(data));
    } catch (e) {
      console.warn(`[Analytics Cache] Write failure for key ${cacheKey}:`, e);
      Sentry.captureException(e, { tags: { cache: 'write_error', cacheKey } });
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
      Sentry.captureException(e, { tags: { cache: 'invalidation_error' } });
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
   * Fetch total organic users count.
   */
  public static async getTotalUsers(): Promise<number> {
    try {
      const organicUsers = await this.getOrganicUsers();
      return organicUsers.length;
    } catch (e) {
      console.error("[Analytics Service] getTotalUsers failed:", e);
      Sentry.captureException(e);
      return 0;
    }
  }

  /**
   * Fetch total activated organic users count.
   */
  public static async getActivatedUsers(): Promise<number> {
    try {
      const organicUsers = await this.getOrganicUsers();
      return organicUsers.filter((u: any) => u && u.beta_status === 'activated').length;
    } catch (e) {
      console.error("[Analytics Service] getActivatedUsers failed:", e);
      Sentry.captureException(e);
      return 0;
    }
  }

  /**
   * Fetch returned organic users.
   * 
   * TODO: Telemetry blocker: last_seen_at is currently only set once at signup sync.
   * Updates are required in web middleware to track user active sessions before returned
   * count displays non-zero values.
   */
  public static async getReturnedUsers(): Promise<number> {
    try {
      const organicUsers = await this.getOrganicUsers();
      
      const returned = organicUsers.filter((u: any) => {
        if (!u || u.beta_status !== 'activated' || !u.last_seen_at || !u.activation_date) return false;
        
        try {
          // Convert to timezone-accurate localized dates safely
          const lastSeenDate = new Date(u.last_seen_at).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
          const activationDate = new Date(u.activation_date).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
          
          return new Date(lastSeenDate) > new Date(activationDate);
        } catch {
          return false;
        }
      });

      return returned.length;
    } catch (e) {
      console.error("[Analytics Service] getReturnedUsers failed:", e);
      Sentry.captureException(e);
      return 0;
    }
  }

  /**
   * Fetch travel intention metrics, including destination tables and growth curves.
   */
  public static async getTravelIntentionMetrics(filters: AnalyticsFilter): Promise<TravelIntentionMetrics> {
    const { dateRange, batchId } = this.validateFilters(filters);
    const cacheKey = this.getCacheKey("travel-intentions", { dateRange, batchId });

    return this.fetchWithCache(cacheKey, 7200, async () => {
      try {
        const organicUsers = await this.getOrganicUsers();
        const activatedOrganic = organicUsers.filter((u: any) => u && u.beta_status === 'activated');

        const destinationsMap: Record<string, number> = {};
        let totalIntentionsCount = 0;
        const timelineMap: Record<string, number> = {};

        activatedOrganic.forEach((u: any) => {
          if (!u) return;
          const profile = u.profiles && !Array.isArray(u.profiles) ? u.profiles : (Array.isArray(u.profiles) && u.profiles.length > 0 ? u.profiles[0] : null);
          if (!profile || !profile.travel_intentions) return;

          let intentions: any[] = [];
          if (typeof profile.travel_intentions === 'string') {
            try {
              intentions = JSON.parse(profile.travel_intentions);
            } catch {}
          } else if (Array.isArray(profile.travel_intentions)) {
            intentions = profile.travel_intentions;
          }

          if (!Array.isArray(intentions)) return;

          intentions.forEach((intent: any) => {
            const dest = intent?.destination_name || intent?.destination;
            if (dest && typeof dest === 'string') {
              const normalized = dest.trim();
              if (normalized) {
                destinationsMap[normalized] = (destinationsMap[normalized] || 0) + 1;
                totalIntentionsCount++;
              }
            }
          });

          if (profile.created_at && intentions.length > 0) {
            try {
              const dateStr = new Date(profile.created_at).toISOString().split('T')[0];
              timelineMap[dateStr] = (timelineMap[dateStr] || 0) + intentions.length;
            } catch {}
          }
        });

        const rows: DestinationPopularity[] = Object.entries(destinationsMap)
          .map(([destination, count]) => ({
            rank: 0,
            destination,
            count,
            percentage: totalIntentionsCount ? Number(((count / totalIntentionsCount) * 100).toFixed(2)) : 0.0
          }))
          .sort((a, b) => b.count - a.count);

        rows.forEach((row, idx) => {
          row.rank = idx + 1;
        });

        const intentionsGrowthTimeline = Object.entries(timelineMap)
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => a.date.localeCompare(b.date));

        return {
          rows,
          totalDestinations: rows.length,
          totalIntentionsCount,
          intentionsGrowthTimeline
        };
      } catch (e) {
        console.error("[Analytics Service] getTravelIntentionMetrics failed:", e);
        Sentry.captureException(e);
        return {
          rows: [],
          totalDestinations: 0,
          totalIntentionsCount: 0,
          intentionsGrowthTimeline: []
        };
      }
    });
  }

  /**
   * Fetch matching signal counts and funnel progression.
   */
  public static async getInterestMetrics(filters: Pick<AnalyticsFilter, 'batchId'>): Promise<InterestMetrics> {
    const batchId = filters.batchId || 'all';
    const cacheKey = this.getCacheKey("interests", { batchId });

    return this.fetchWithCache(cacheKey, 300, async () => {
      try {
        const organicUsers = await this.getOrganicUsers();
        const organicUserIds = new Set(organicUsers.map((u: any) => u.id));
        const adminEmails = await this.getAdminEmailsSet();

        // 1. Waitlist (Funnel Stage 1)
        let invitedCount = 0;
        try {
          const { data: waitlist, error: waitErr } = await supabaseAdmin.from('waitlist').select('email, status');
          if (waitErr) {
            console.warn("[Analytics Service] waitlist fetch failed, defaulting to 0:", waitErr.message);
            Sentry.captureException(waitErr);
          } else {
            invitedCount = (waitlist || []).filter((w: any) => 
              w?.email && ['beta_invited', 'beta_active'].includes(w.status) && !adminEmails.has(w.email.toLowerCase())
            ).length;
          }
        } catch (e) {
          console.error("[Analytics Service] waitlist query crashed:", e);
          Sentry.captureException(e);
        }

        // 2. Activated, Onboarded, and Intent Completes (Stages 2, 3, 4)
        const activatedCount = organicUsers.filter((u: any) => u && u.beta_status === 'activated').length;
        const onboardedCount = organicUsers.filter((u: any) => u && u.beta_status === 'activated' && u.onboarding_completed).length;
        const travelIntentCount = organicUsers.filter((u: any) => {
          if (!u || u.beta_status !== 'activated') return false;
          const profile = u.profiles && !Array.isArray(u.profiles) ? u.profiles : (Array.isArray(u.profiles) && u.profiles.length > 0 ? u.profiles[0] : null);
          if (!profile || !profile.travel_intentions) return false;
          return Array.isArray(profile.travel_intentions) && profile.travel_intentions.length > 0;
        }).length;

        // 3. Interactions (Stages 6, 7, 8, 9)
        let organicInterests: any[] = [];
        try {
          const { data: interests, error: intErr } = await supabaseAdmin
            .from('match_interests')
            .select('from_user_id, to_user_id, status');
          if (intErr) {
            console.warn("[Analytics Service] match_interests fetch failed, defaulting to empty:", intErr.message);
            Sentry.captureException(intErr);
          } else {
            organicInterests = (interests || []).filter(
              (m: any) => m && organicUserIds.has(m.from_user_id) && organicUserIds.has(m.to_user_id)
            );
          }
        } catch (e) {
          console.error("[Analytics Service] match_interests query crashed:", e);
          Sentry.captureException(e);
        }

        const interestsSent = organicInterests.filter((m: any) => m && organicUserIds.has(m.from_user_id)).length;
        const pendingInterests = organicInterests.filter((m: any) => m && m.status === 'pending').length;
        const acceptedInterests = organicInterests.filter((m: any) => m && m.status === 'accepted').length;
        const decidedInterests = organicInterests.filter((m: any) => m && ['accepted', 'rejected'].includes(m.status)).length;
        const acceptanceRate = decidedInterests ? Number(((acceptedInterests / decidedInterests) * 100).toFixed(2)) : 0.0;

        const uniqueSentIds = new Set(organicInterests.map((m: any) => m?.from_user_id).filter(Boolean));
        const interestSentCount = uniqueSentIds.size;

        // Conversations
        let conversationCount = 0;
        try {
          const { data: conversations, error: convErr } = await supabaseAdmin.from('conversations').select('user_a_id, user_b_id');
          if (convErr) {
            console.warn("[Analytics Service] conversations fetch failed, defaulting to 0:", convErr.message);
            Sentry.captureException(convErr);
          } else {
            conversationCount = (conversations || []).filter((c: any) => 
              c && organicUserIds.has(c.user_a_id) && organicUserIds.has(c.user_b_id)
            ).length;
          }
        } catch (e) {
          console.error("[Analytics Service] conversations query crashed:", e);
          Sentry.captureException(e);
        }

        // Direct Messages
        let messageSentCount = 0;
        try {
          const { data: messages, error: msgErr } = await supabaseAdmin
            .from('direct_messages')
            .select('sender_id, receiver_id, media_type')
            .neq('media_type', 'init');
          if (msgErr) {
            console.warn("[Analytics Service] direct_messages fetch failed, defaulting to 0:", msgErr.message);
            Sentry.captureException(msgErr);
          } else {
            messageSentCount = (messages || []).filter((m: any) => 
              m && organicUserIds.has(m.sender_id) && organicUserIds.has(m.receiver_id)
            ).length;
          }
        } catch (e) {
          console.error("[Analytics Service] direct_messages query crashed:", e);
          Sentry.captureException(e);
        }

        // Construct 9-stage conversion funnel steps
        const getPct = (val: number | null, base: number) => {
          if (val === null || !base) return null;
          return Number(((val / base) * 100).toFixed(2));
        };

        const base = invitedCount || 1;

        const funnelSteps: FunnelStepItem[] = [
          { stage: 'invited', label: 'Invited', count: invitedCount, pct: 100 },
          { stage: 'activated', label: 'Activated', count: activatedCount, pct: getPct(activatedCount, base) },
          { stage: 'onboarded', label: 'Onboarded', count: onboardedCount, pct: getPct(onboardedCount, base) },
          { stage: 'travel_intent', label: 'Travel Intent Added', count: travelIntentCount, pct: getPct(travelIntentCount, base) },
          { stage: 'explore_viewed', label: 'Explore Viewed', count: null, pct: null, warning: 'Requires client telemetry integration' },
          { stage: 'interest_sent', label: 'Interest Sent', count: interestSentCount, pct: getPct(interestSentCount, base) },
          { stage: 'interest_accepted', label: 'Interest Accepted', count: acceptedInterests, pct: getPct(acceptedInterests, base) },
          { stage: 'conversation', label: 'Conversation Started', count: conversationCount, pct: getPct(conversationCount, base) },
          { stage: 'message_sent', label: 'Messages Sent', count: messageSentCount, pct: getPct(messageSentCount, base) },
        ];

        return {
          interestsSent,
          acceptedInterests,
          pendingInterests,
          acceptanceRate,
          funnelSteps
        };
      } catch (e) {
        console.error("[Analytics Service] getInterestMetrics failed:", e);
        Sentry.captureException(e);
        return {
          interestsSent: 0,
          acceptedInterests: 0,
          pendingInterests: 0,
          acceptanceRate: 0.0,
          funnelSteps: []
        };
      }
    });
  }

  /**
   * Fetch conversation and stranger-messaging statistics.
   */
  public static async getConversationMetrics(filters: AnalyticsFilter): Promise<ConversationMetrics> {
    const { dateRange, batchId } = this.validateFilters(filters);
    const cacheKey = this.getCacheKey("conversations", { dateRange, batchId });

    return this.fetchWithCache(cacheKey, 300, async () => {
      try {
        const organicUsers = await this.getOrganicUsers();
        const organicUserIds = new Set(organicUsers.map((u: any) => u.id));

        let organicConversations: any[] = [];
        try {
          const { data: conversations, error: convErr } = await supabaseAdmin
            .from('conversations')
            .select('id, user_a_id, user_b_id, created_at');
          if (convErr) {
            console.warn("[Analytics Service] conversations fetch failed inside getConversationMetrics:", convErr.message);
            Sentry.captureException(convErr);
          } else {
            organicConversations = (conversations || []).filter((c: any) => 
              c && organicUserIds.has(c.user_a_id) && organicUserIds.has(c.user_b_id)
            );
          }
        } catch (e) {
          console.error("[Analytics Service] conversations fetch critically failed:", e);
          Sentry.captureException(e);
        }

        let organicMessages: any[] = [];
        try {
          const { data: messages, error: msgErr } = await supabaseAdmin
            .from('direct_messages')
            .select('id, sender_id, receiver_id, created_at, media_type');
          if (msgErr) {
            console.warn("[Analytics Service] direct_messages fetch failed inside getConversationMetrics:", msgErr.message);
            Sentry.captureException(msgErr);
          } else {
            organicMessages = (messages || []).filter((m: any) => 
              m && m.media_type !== 'init' && organicUserIds.has(m.sender_id) && organicUserIds.has(m.receiver_id)
            );
          }
        } catch (e) {
          console.error("[Analytics Service] direct_messages fetch critically failed:", e);
          Sentry.captureException(e);
        }

        const dailyActivityMap: Record<string, { messages: number, conversations: number }> = {};

        organicConversations.forEach((c: any) => {
          if (!c || !c.created_at) return;
          try {
            const dateStr = new Date(c.created_at).toISOString().split('T')[0];
            if (!dailyActivityMap[dateStr]) dailyActivityMap[dateStr] = { messages: 0, conversations: 0 };
            dailyActivityMap[dateStr].conversations++;
          } catch {}
        });

        organicMessages.forEach((m: any) => {
          if (!m || !m.created_at) return;
          try {
            const dateStr = new Date(m.created_at).toISOString().split('T')[0];
            if (!dailyActivityMap[dateStr]) dailyActivityMap[dateStr] = { messages: 0, conversations: 0 };
            dailyActivityMap[dateStr].messages++;
          } catch {}
        });

        const dailyMessagingActivity = Object.entries(dailyActivityMap)
          .map(([date, val]) => ({
            date,
            messages: val.messages,
            conversations: val.conversations
          }))
          .sort((a, b) => a.date.localeCompare(b.date));

        const userSentMap: Record<string, number> = {};
        const userReceivedMap: Record<string, number> = {};

        organicMessages.forEach((m: any) => {
          if (m?.sender_id) userSentMap[m.sender_id] = (userSentMap[m.sender_id] || 0) + 1;
          if (m?.receiver_id) userReceivedMap[m.receiver_id] = (userReceivedMap[m.receiver_id] || 0) + 1;
        });

        const mostActiveUsers: ActiveUserMessagingRow[] = organicUsers
          .filter((u: any) => !!u)
          .map((u: any) => {
            const profileObj = u.profiles && !Array.isArray(u.profiles) ? u.profiles : (Array.isArray(u.profiles) && u.profiles.length > 0 ? u.profiles[0] : null);
            return {
              userId: u.id,
              name: profileObj?.name || u.email || 'Unknown',
              email: u.email || 'Unknown',
              messagesSent: userSentMap[u.id] || 0,
              messagesReceived: userReceivedMap[u.id] || 0,
              userProfile: profileObj ? {
                name: profileObj.name,
                username: profileObj.username,
                profile_photo: profileObj.profile_photo,
                deleted: !!u.isDeleted,
                clerk_id: u.clerk_user_id
              } : undefined
            };
          })
          .filter((row: ActiveUserMessagingRow) => row.messagesSent > 0 || row.messagesReceived > 0)
          .sort((a: ActiveUserMessagingRow, b: ActiveUserMessagingRow) => b.messagesSent - a.messagesSent)
          .slice(0, 10);

        return {
          totalConversations: organicConversations.length,
          totalMessagesSent: organicMessages.length,
          dailyMessagingActivity,
          mostActiveUsers
        };
      } catch (e) {
        console.error("[Analytics Service] getConversationMetrics failed:", e);
        Sentry.captureException(e);
        return {
          totalConversations: 0,
          totalMessagesSent: 0,
          dailyMessagingActivity: [],
          mostActiveUsers: []
        };
      }
    });
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
      try {
        const totalUsersVal = await this.getTotalUsers();
        const activatedUsersVal = await this.getActivatedUsers();
        const returnedUsersVal = await this.getReturnedUsers();

        const interestMetrics = await this.getInterestMetrics({ batchId });
        const conversationMetrics = await this.getConversationMetrics({ dateRange, batchId });

        return {
          totalUsers: { value: totalUsersVal, change: 0.0, trend: 'neutral' },
          activatedUsers: { value: activatedUsersVal, change: 0.0, trend: 'neutral' },
          returnedUsers: { value: returnedUsersVal, change: 0.0, trend: 'neutral' },
          retentionRate: { value: 0.0, change: 0.0, trend: 'neutral' },
          interestsSent: { value: interestMetrics.interestsSent, change: 0.0, trend: 'neutral' },
          conversationsCreated: { value: conversationMetrics.totalConversations, change: 0.0, trend: 'neutral' },
          interestAcceptanceRate: { value: interestMetrics.acceptanceRate, change: 0.0, trend: 'neutral' },
        };
      } catch (e) {
        console.error("[Analytics Service] getOverviewMetrics failed:", e);
        Sentry.captureException(e);
        return {
          totalUsers: { value: 0, change: 0.0, trend: 'neutral' },
          activatedUsers: { value: 0, change: 0.0, trend: 'neutral' },
          returnedUsers: { value: 0, change: 0.0, trend: 'neutral' },
          retentionRate: { value: 0.0, change: 0.0, trend: 'neutral' },
          interestsSent: { value: 0, change: 0.0, trend: 'neutral' },
          conversationsCreated: { value: 0, change: 0.0, trend: 'neutral' },
          interestAcceptanceRate: { value: 0.0, change: 0.0, trend: 'neutral' },
        };
      }
    });
  }

  /**
   * Fetch aggregated daily messaging timelines.
   * 
   * @param filters - Active date limitations
   */
  public static async getMessagingMetrics(filters: Pick<AnalyticsFilter, 'dateRange'>): Promise<MessagingAnalyticsResponse> {
    const dateRange = filters.dateRange || '30d';
    const cacheKey = this.getCacheKey("messaging-timelines", { dateRange });

    return this.fetchWithCache(cacheKey, 300, async () => {
      try {
        const convMetrics = await this.getConversationMetrics({ dateRange });
        return {
          conversationsCreated: convMetrics.totalConversations,
          messagesSent: convMetrics.totalMessagesSent,
          dailyActivity: convMetrics.dailyMessagingActivity.map((a: any) => ({
            date: a.date,
            messages: a.messages,
            conversations: a.conversations
          })),
        };
      } catch (e) {
        console.error("[Analytics Service] getMessagingMetrics failed:", e);
        Sentry.captureException(e);
        return {
          conversationsCreated: 0,
          messagesSent: 0,
          dailyActivity: []
        };
      }
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
      try {
        const organicUsers = await this.getOrganicUsers();
        const organicUserIds = new Set(organicUsers.map((u: any) => u.id));

        const { data: notifications, error } = await supabaseAdmin
          .from('notifications')
          .select('user_id, is_read, push_status');

        if (error) {
          console.warn("[Analytics Service] notifications fetch failed:", error.message);
          Sentry.captureException(error, { tags: { query: 'fetch_notifications_error' } });
          await incrementErrorCounter();
          throw error;
        }

        const organicNotifications = (notifications || []).filter((n: any) => n && organicUserIds.has(n.user_id));

        const notificationsCreated = organicNotifications.length;
        const notificationsRead = organicNotifications.filter((n: any) => n.is_read).length;
        const pushSuccess = organicNotifications.filter((n: any) => n.push_status === 'delivered').length;
        const pushFailure = organicNotifications.filter((n: any) => n.push_status === 'failed').length;
        const noTokenCount = organicNotifications.filter((n: any) => n.push_status === 'no_token').length;

        return {
          notificationsCreated,
          notificationsRead,
          pushSuccess,
          pushFailure,
          noTokenCount
        };
      } catch (e) {
        console.error("[Analytics Service] getNotificationMetrics failed:", e);
        Sentry.captureException(e);
        return {
          notificationsCreated: 0,
          notificationsRead: 0,
          pushSuccess: 0,
          pushFailure: 0,
          noTokenCount: 0
        };
      }
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
    const cacheKey = this.getCacheKey("destinations-paged", { page, pageSize, sortBy, sortOrder, batchId });

    return this.fetchWithCache(cacheKey, 7200, async () => {
      try {
        const intentMetrics = await this.getTravelIntentionMetrics({ batchId });
        const startIndex = (page - 1) * pageSize;
        const paginatedRows = intentMetrics.rows.slice(startIndex, startIndex + pageSize);

        return {
          rows: paginatedRows,
          total: intentMetrics.rows.length,
          page,
          pageSize,
        };
      } catch (e) {
        console.error("[Analytics Service] getTopDestinations failed:", e);
        Sentry.captureException(e);
        return {
          rows: [],
          total: 0,
          page,
          pageSize
        };
      }
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
    const cacheKey = this.getCacheKey("active-users-paged", { page, pageSize });

    return this.fetchWithCache(cacheKey, 1800, async () => {
      try {
        const convMetrics = await this.getConversationMetrics({ dateRange: 'all' });
        const startIndex = (page - 1) * pageSize;
        const paginatedRows = convMetrics.mostActiveUsers.slice(startIndex, startIndex + pageSize)
          .map((row: any) => ({
            id: row.userId,
            name: row.name,
            email: row.email,
            sent: row.messagesSent
          }));

        return {
          rows: paginatedRows,
          total: convMetrics.mostActiveUsers.length,
          page,
          pageSize,
        };
      } catch (e) {
        console.error("[Analytics Service] getMostActiveUsers failed:", e);
        Sentry.captureException(e);
        return {
          rows: [],
          total: 0,
          page,
          pageSize
        };
      }
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
      try {
        const organicUsers = await this.getOrganicUsers();
        const organicUserIds = new Set(organicUsers.map((u: any) => u.id));

        let organicFeedback: any[] = [];
        try {
          const { data: feedback, error } = await supabaseAdmin
            .from('feedback')
            .select('id, user_id, type, message, created_at')
            .order('created_at', { ascending: false });

          if (error) {
            console.warn("[Analytics Service] feedback fetch failed:", error.message);
            Sentry.captureException(error, { tags: { query: 'fetch_feedback_error' } });
            await incrementErrorCounter();
          } else {
            organicFeedback = (feedback || []).filter((f: any) => f && organicUserIds.has(f.user_id));
          }
        } catch (e) {
          console.error("[Analytics Service] feedback fetch critically failed:", e);
          Sentry.captureException(e);
        }

        const startIndex = (page - 1) * pageSize;
        const paginatedFeedback = organicFeedback.slice(startIndex, startIndex + pageSize);

        const rows = paginatedFeedback.map((f: any) => {
          const u = organicUsers.find((user: any) => user && user.id === f.user_id);
          const profile = u?.profiles && !Array.isArray(u.profiles) ? u.profiles : (Array.isArray(u.profiles) && u.profiles.length > 0 ? u.profiles[0] : null);
          return {
            id: f.id,
            name: profile?.name || u?.email || 'Unknown',
            type: f.type || 'general',
            message: f.message || '',
            created_at: f.created_at
          };
        });

        return {
          rows,
          total: organicFeedback.length,
          page,
          pageSize
        };
      } catch (e) {
        console.error("[Analytics Service] getRecentFeedback failed:", e);
        Sentry.captureException(e);
        return {
          rows: [],
          total: 0,
          page,
          pageSize
        };
      }
    });
  }
}
