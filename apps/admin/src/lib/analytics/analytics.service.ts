import { supabaseAdmin, redis, ensureRedisConnection } from "@kovari/api";
import * as Sentry from "@sentry/nextjs";
import { cache } from "react";
import { 
  AnalyticsFilter,
  AnalyticsOverviewResponse,
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
  DateRange,
  OrganicUser
} from "../../types/analytics";
import { incrementErrorCounter } from "../../../lib/incrementErrorCounter";

// =============================================================
// Analytics Service Implementation
// =============================================================

/**
 * Service class acting as the single source of truth for fetching,
 * processing, and caching analytical queries for the Analytics dashboard.
 * 
 * Bypasses direct user RLS policies via the service-role client (`supabaseAdmin`)
 * to allow cross-system reports, while containing Redis cache handling.
 */
export class AnalyticsService {
  private static CACHE_PREFIX = "cache:analytics";

  /**
   * Helper function to fetch all admin email addresses.
   * Returns a lowercase Set of admin emails for fast exclusions.
   */
  private static getAdminEmailsSet = cache(async (): Promise<Set<string>> => {
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
  });

  /**
   * Helper function to query organic users (excluding admins/founders).
   * Fetches users and merges profiles to run anti-joins in memory.
   */
  private static getOrganicUsers = cache(async (): Promise<OrganicUser[]> => {
    try {
      const adminEmails = await this.getAdminEmailsSet();
      const adminEmailsArr = Array.from(adminEmails);

      let query = supabaseAdmin
        .from('users')
        .select('id, email, beta_status, onboarding_completed, isDeleted, last_seen_at, activation_date, clerk_user_id, profiles(email, name, travel_intentions, created_at, username, profile_photo)')
        .eq('isDeleted', false)
        .eq('is_internal', false);

      if (adminEmailsArr.length > 0) {
        query = query.not('email', 'in', `(${adminEmailsArr.map(e => `"${e}"`).join(',')})`);
      }

      const { data: users, error } = await query;

      if (error) {
        console.error("[Analytics Service] getOrganicUsers query failed:", error.message);
        Sentry.captureException(error, { tags: { query: 'fetch_organic_users_error' } });
        await incrementErrorCounter();
        throw error;
      }

      const rawUsers = (users || []) as any[];

      return rawUsers.filter((u: any) => {
        if (!u) return false;
        const profile = u.profiles && !Array.isArray(u.profiles) ? u.profiles : (Array.isArray(u.profiles) && u.profiles.length > 0 ? u.profiles[0] : null);
        const email = (profile?.email || u.email || '')?.toLowerCase();
        return email && !adminEmails.has(email);
      }) as OrganicUser[];
    } catch (e) {
      console.error("[Analytics Service] getOrganicUsers critically failed:", e);
      Sentry.captureException(e);
      await incrementErrorCounter();
      throw e;
    }
  });

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
      throw e;
    }
  }

  /**
   * Fetch total activated organic users count.
   */
  public static async getActivatedUsers(): Promise<number> {
    try {
      const organicUsers = await this.getOrganicUsers();
      return organicUsers.filter((u: OrganicUser) => u && u.beta_status === 'activated').length;
    } catch (e) {
      console.error("[Analytics Service] getActivatedUsers failed:", e);
      Sentry.captureException(e);
      throw e;
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
      
      const returned = organicUsers.filter((u: OrganicUser) => {
        if (!u || u.beta_status !== 'activated' || !u.last_seen_at || !u.activation_date) return false;
        
        try {
          const getKolkataDateString = (dateInput: string): string => {
            const date = new Date(dateInput);
            const formatter = new Intl.DateTimeFormat('en-US', {
              timeZone: 'Asia/Kolkata',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            });
            const parts = formatter.formatToParts(date);
            const year = parts.find(p => p.type === 'year')?.value || '1970';
            const month = parts.find(p => p.type === 'month')?.value || '01';
            const day = parts.find(p => p.type === 'day')?.value || '01';
            return `${year}-${month}-${day}`;
          };

          const lastSeenDateStr = getKolkataDateString(u.last_seen_at);
          const activationDateStr = getKolkataDateString(u.activation_date);
          
          return lastSeenDateStr > activationDateStr;
        } catch {
          return false;
        }
      });

      return returned.length;
    } catch (e) {
      console.error("[Analytics Service] getReturnedUsers failed:", e);
      Sentry.captureException(e);
      throw e;
    }
  }

  /**
   * Fetch travel intention metrics, including destination tables and growth curves.
   */
  public static getTravelIntentionMetrics = cache(async (filters: AnalyticsFilter): Promise<TravelIntentionMetrics> => {
    const { dateRange, batchId } = this.validateFilters(filters);
    const cacheKey = this.getCacheKey("travel-intentions", { dateRange, batchId });

    return this.fetchWithCache(cacheKey, 7200, async () => {
      try {
        const organicUsers = await this.getOrganicUsers();
        const activatedOrganic = organicUsers.filter((u: OrganicUser) => u && u.onboarding_completed);

        const destinationsMap: Record<string, number> = {};
        let totalIntentionsCount = 0;
        const timelineMap: Record<string, number> = {};

        activatedOrganic.forEach((u: OrganicUser) => {
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

        // Group vs Solo stats
        let groupTravelersCount = 0;
        try {
          const { data: memberRows } = await supabaseAdmin
            .from("group_memberships")
            .select("user_id")
            .eq("status", "accepted");
          
          if (memberRows) {
            const groupUserIds = new Set(memberRows.map((r: any) => r.user_id));
            groupTravelersCount = organicUsers.filter((u: OrganicUser) => groupUserIds.has(u.id)).length;
          }
        } catch (e) {
          console.error(e);
        }

        const totalUsersCount = organicUsers.length || 1;
        const soloTravelersCount = Math.max(0, totalUsersCount - groupTravelersCount);

        const soloPercentage = Math.round((soloTravelersCount / totalUsersCount) * 100);
        const groupPercentage = Math.round((groupTravelersCount / totalUsersCount) * 100);

        return {
          rows,
          totalDestinations: rows.length,
          totalIntentionsCount,
          intentionsGrowthTimeline,
          upcomingTripsCount: totalIntentionsCount, // default to all intentions count as upcoming
          soloTravelersCount,
          groupTravelersCount,
          soloPercentage,
          groupPercentage
        };
      } catch (e) {
        console.error("[Analytics Service] getTravelIntentionMetrics failed:", e);
        Sentry.captureException(e);
        throw e;
      }
    });
  });

  /**
   * Fetch matching signal counts and funnel progression.
   */
  public static getInterestMetrics = cache(async (filters: Pick<AnalyticsFilter, 'batchId'>): Promise<InterestMetrics> => {
    const batchId = filters.batchId || 'all';
    const cacheKey = this.getCacheKey("interests", { batchId });

    return this.fetchWithCache(cacheKey, 300, async () => {
      try {
        const organicUsers = await this.getOrganicUsers();
        const organicUserIds = new Set(organicUsers.map((u: OrganicUser) => u.id));
        const totalUsersCount = organicUsers.length;

        // 1. Visitors count
        let visitorsCount = 0;
        try {
          const { count } = await supabaseAdmin
            .from('analytics_events')
            .select('*', { count: 'exact', head: true })
            .eq('event_name', 'landing_view');
          visitorsCount = count ?? 0;
        } catch (e) {
          console.error("[Analytics Service] Error fetching landing views:", e);
        }

        // 2. Compute funnel counts for users
        let onboardedCount = 0;
        let photoAddedCount = 0;
        let travelIntentCount = 0;
        let fullyActivatedCount = 0;

        organicUsers.forEach((u: OrganicUser) => {
          const profile = u.profiles && !Array.isArray(u.profiles) ? u.profiles : (Array.isArray(u.profiles) && u.profiles.length > 0 ? u.profiles[0] : null);
          const hasPhoto = !!(profile && profile.profile_photo && profile.profile_photo.trim().length > 0);
          
          let intentions: any[] = [];
          if (profile && profile.travel_intentions) {
            if (typeof profile.travel_intentions === 'string') {
              try {
                intentions = JSON.parse(profile.travel_intentions);
              } catch {}
            } else if (Array.isArray(profile.travel_intentions)) {
              intentions = profile.travel_intentions;
            }
          }
          const hasIntentions = intentions.length > 0;

          if (u.onboarding_completed) onboardedCount++;
          if (hasPhoto) photoAddedCount++;
          if (hasIntentions) travelIntentCount++;
          if (u.onboarding_completed && hasPhoto && hasIntentions) fullyActivatedCount++;
        });

        // 3. Match Interests & Conversations
        let interestsSent = 0;
        let acceptedInterests = 0;
        let pendingInterests = 0;
        let decidedInterests = 0;

        try {
          const { data: interests, error: intErr } = await supabaseAdmin
            .from('match_interests')
            .select('from_user_id, to_user_id, status');
          
          if (intErr) {
            console.warn("[Analytics Service] match_interests query failed:", intErr.message);
          } else if (interests) {
            const organicInterests = interests.filter(
              (m: any) => m && organicUserIds.has(m.from_user_id) && organicUserIds.has(m.to_user_id)
            );
            interestsSent = organicInterests.length;
            pendingInterests = organicInterests.filter((m: any) => m.status === 'pending').length;
            acceptedInterests = organicInterests.filter((m: any) => m.status === 'accepted').length;
            decidedInterests = organicInterests.filter((m: any) => ['accepted', 'rejected'].includes(m.status)).length;
          }
        } catch (e) {
          console.error(e);
        }

        const acceptanceRate = decidedInterests ? Number(((acceptedInterests / decidedInterests) * 100).toFixed(2)) : 0.0;

        // Conversations count
        let conversationsCount = 0;
        try {
          const { data: convs } = await supabaseAdmin
            .from('conversations')
            .select('user_a_id, user_b_id');
          if (convs) {
            conversationsCount = convs.filter((c: any) => organicUserIds.has(c.user_a_id) && organicUserIds.has(c.user_b_id)).length;
          }
        } catch (e) {
          console.error(e);
        }

        // Messages count
        let messagesSentCount = 0;
        try {
          const { data: messages } = await supabaseAdmin
            .from('direct_messages')
            .select('sender_id, receiver_id')
            .neq('media_type', 'init');
          if (messages) {
            messagesSentCount = messages.filter((m: any) => organicUserIds.has(m.sender_id) && organicUserIds.has(m.receiver_id)).length;
          }
        } catch (e) {
          console.error(e);
        }

        // 4. Construct Public Growth Funnel
        const getPct = (val: number, base: number) => {
          if (!base) return 0;
          return Number(((val / base) * 100).toFixed(2));
        };

        const growthBase = visitorsCount || totalUsersCount || 1;

        const funnelSteps: FunnelStepItem[] = [
          { stage: 'visitors', label: 'Visitors', count: visitorsCount, pct: 100 },
          { stage: 'signups', label: 'Signups', count: totalUsersCount, pct: getPct(totalUsersCount, growthBase) },
          { stage: 'activated_profiles', label: 'Activated Profiles', count: onboardedCount, pct: getPct(onboardedCount, growthBase) },
          { stage: 'travel_intentions', label: 'Travel Intentions', count: travelIntentCount, pct: getPct(travelIntentCount, growthBase) },
          { stage: 'interests_sent', label: 'Match Interests Sent', count: interestsSent, pct: getPct(interestsSent, growthBase) },
          { stage: 'accepted_matches', label: 'Accepted Matches', count: acceptedInterests, pct: getPct(acceptedInterests, growthBase) },
          { stage: 'conversations_started', label: 'Conversations Started', count: conversationsCount, pct: getPct(conversationsCount, growthBase) },
          { stage: 'messages_exchanged', label: 'Messages Exchanged', count: messagesSentCount, pct: getPct(messagesSentCount, growthBase) },
        ];

        // 5. Construct User Activation Funnel
        const activationBase = totalUsersCount || 1;
        const activationFunnelSteps: FunnelStepItem[] = [
          { stage: 'signup', label: 'Signup', count: totalUsersCount, pct: 100 },
          { stage: 'completed_profile', label: 'Completed Profile', count: onboardedCount, pct: getPct(onboardedCount, activationBase) },
          { stage: 'added_photo', label: 'Added Photo', count: photoAddedCount, pct: getPct(photoAddedCount, activationBase) },
          { stage: 'added_travel_intention', label: 'Added Travel Intention', count: travelIntentCount, pct: getPct(travelIntentCount, activationBase) },
          { stage: 'activated_user', label: 'Activated User', count: fullyActivatedCount, pct: getPct(fullyActivatedCount, activationBase) },
        ];

        return {
          interestsSent,
          acceptedInterests,
          pendingInterests,
          acceptanceRate,
          funnelSteps,
          activationFunnelSteps,
        };
      } catch (e) {
        console.error("[Analytics Service] getInterestMetrics failed:", e);
        Sentry.captureException(e);
        throw e;
      }
    });
  });

  /**
   * Fetch conversation and stranger-messaging statistics.
   */
  public static getConversationMetrics = cache(async (filters: AnalyticsFilter): Promise<ConversationMetrics> => {
    const { dateRange, batchId } = this.validateFilters(filters);
    const cacheKey = this.getCacheKey("conversations", { dateRange, batchId });

    return this.fetchWithCache(cacheKey, 300, async () => {
      try {
        const organicUsers = await this.getOrganicUsers();
        const organicUserIds = new Set(organicUsers.map((u: OrganicUser) => u.id));

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
          .filter((u: OrganicUser) => !!u)
          .map((u: OrganicUser) => {
            const profileObj = u.profiles && !Array.isArray(u.profiles) ? u.profiles : (Array.isArray(u.profiles) && u.profiles.length > 0 ? u.profiles[0] : null);
            return {
              userId: u.id,
              name: profileObj?.name || u.email || 'Unknown',
              email: u.email || 'Unknown',
              messagesSent: userSentMap[u.id] || 0,
              messagesReceived: userReceivedMap[u.id] || 0,
              userProfile: profileObj ? {
                name: profileObj.name || undefined,
                username: profileObj.username || undefined,
                profile_photo: profileObj.profile_photo || undefined,
                deleted: !!u.isDeleted,
                clerk_id: u.clerk_user_id || undefined
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
        throw e;
      }
    });
  });

  /**
   * Fetch overview stats comparing current values against baseline offsets.
   * 
   * @param filters - Active page selectors
   */
  public static getOverviewMetrics = cache(async (filters: AnalyticsFilter): Promise<AnalyticsOverviewResponse> => {
    const { dateRange, batchId } = this.validateFilters(filters);
    const cacheKey = this.getCacheKey("overview", { dateRange, batchId });

    return this.fetchWithCache(cacheKey, 900, async () => {
      try {
        const organicUsers = await this.getOrganicUsers();
        const totalUsersVal = organicUsers.length;
        const activatedUsersVal = organicUsers.filter((u: OrganicUser) => u && u.onboarding_completed).length;
        const returnedUsersVal = await this.getReturnedUsers();

        const interestMetrics = await this.getInterestMetrics(filters);
        const conversationMetrics = await this.getConversationMetrics(filters);

        // --- Time ranges for signup / growth deltas ---
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
        const startOf7d = new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000);
        const startOf30d = new Date(startOfToday.getTime() - 30 * 24 * 60 * 60 * 1000);

        let signupsToday = 0;
        let signupsYesterday = 0;
        let signups7d = 0;
        let signups30d = 0;

        let missingPhotoCount = 0;
        let missingIntentionsCount = 0;
        let fullyActivatedCount = 0;

        organicUsers.forEach(u => {
          const profile = u.profiles && !Array.isArray(u.profiles) ? u.profiles : (Array.isArray(u.profiles) && u.profiles.length > 0 ? u.profiles[0] : null);
          
          // Growth
          if (profile && profile.created_at) {
            const created = new Date(profile.created_at);
            if (created >= startOfToday) {
              signupsToday++;
            } else if (created >= startOfYesterday && created < startOfToday) {
              signupsYesterday++;
            }
            if (created >= startOf7d) {
              signups7d++;
            }
            if (created >= startOf30d) {
              signups30d++;
            }
          }

          // Activation
          const hasPhoto = !!(profile && profile.profile_photo && profile.profile_photo.trim().length > 0);
          
          let intentions: any[] = [];
          if (profile && profile.travel_intentions) {
            if (typeof profile.travel_intentions === 'string') {
              try {
                intentions = JSON.parse(profile.travel_intentions);
              } catch {}
            } else if (Array.isArray(profile.travel_intentions)) {
              intentions = profile.travel_intentions;
            }
          }
          const hasIntentions = intentions.length > 0;

          if (!hasPhoto) missingPhotoCount++;
          if (!hasIntentions) missingIntentionsCount++;
          if (u.onboarding_completed && hasPhoto && hasIntentions) {
            fullyActivatedCount++;
          }
        });

        const totalCount = organicUsers.length || 1;
        const profileCompletionRate = Math.round((activatedUsersVal / totalCount) * 100);
        const travelIntentionCompletionRate = Math.round(((totalCount - missingIntentionsCount) / totalCount) * 100);
        const activationCompletionRate = Math.round((fullyActivatedCount / totalCount) * 100);

        const missingPhotoPct = Math.round((missingPhotoCount / totalCount) * 100);
        const missingIntentionsPct = Math.round((missingIntentionsCount / totalCount) * 100);

        // --- Stranger conversations growth deltas ---
        let strangerConversationsToday = 0;
        let strangerConversations7d = 0;
        const strangerConversationsTotal = conversationMetrics.totalConversations;

        // Fetch conversations to calculate stranger growth deltas
        const { data: convs } = await supabaseAdmin
          .from('conversations')
          .select('created_at, user_a_id, user_b_id');
        
        if (convs) {
          const organicUserIds = new Set(organicUsers.map((u: OrganicUser) => u.id));
          const organicConvs = convs.filter((c: any) => organicUserIds.has(c.user_a_id) && organicUserIds.has(c.user_b_id));
          organicConvs.forEach((c: any) => {
            if (c.created_at) {
              const created = new Date(c.created_at);
              if (created >= startOfToday) {
                strangerConversationsToday++;
              }
              if (created >= startOf7d) {
                strangerConversations7d++;
              }
            }
          });
        }

        // --- Core delta counts (+X today, +Y this week) for core metrics ---
        let usersToday = 0;
        let users7d = 0;
        organicUsers.forEach(u => {
          const profile = u.profiles && !Array.isArray(u.profiles) ? u.profiles : (Array.isArray(u.profiles) && u.profiles.length > 0 ? u.profiles[0] : null);
          if (profile && profile.created_at) {
            const created = new Date(profile.created_at);
            if (created >= startOfToday) usersToday++;
            if (created >= startOf7d) users7d++;
          }
        });

        let activatedToday = 0;
        let activated7d = 0;
        organicUsers.forEach(u => {
          if (u.onboarding_completed && u.activation_date) {
            const act = new Date(u.activation_date);
            if (act >= startOfToday) activatedToday++;
            if (act >= startOf7d) activated7d++;
          }
        });

        // Match interests sent deltas
        let matchesSentToday = 0;
        let matchesSent7d = 0;
        let matchesAcceptedToday = 0;
        let matchesAccepted7d = 0;

        // Fetch interest creations
        const { data: matchesRaw } = await supabaseAdmin
          .from('match_interests')
          .select('created_at, status, from_user_id, to_user_id');

        if (matchesRaw) {
          const organicUserIds = new Set(organicUsers.map((u: OrganicUser) => u.id));
          const organicMatches = matchesRaw.filter((m: any) => organicUserIds.has(m.from_user_id) && organicUserIds.has(m.to_user_id));
          organicMatches.forEach((m: any) => {
            if (m.created_at) {
              const created = new Date(m.created_at);
              if (created >= startOfToday) matchesSentToday++;
              if (created >= startOf7d) matchesSent7d++;
              if (m.status === 'accepted') {
                if (created >= startOfToday) matchesAcceptedToday++;
                if (created >= startOf7d) matchesAccepted7d++;
              }
            }
          });
        }

        // Messages Today / 7 Days
        let messagesToday = 0;
        let messages7d = 0;
        const { data: messagesRawList } = await supabaseAdmin
          .from('direct_messages')
          .select('created_at, sender_id, receiver_id')
          .neq('media_type', 'init');

        if (messagesRawList) {
          const organicUserIds = new Set(organicUsers.map((u: OrganicUser) => u.id));
          const organicMsgs = messagesRawList.filter((m: any) => organicUserIds.has(m.sender_id) && organicUserIds.has(m.receiver_id));
          organicMsgs.forEach((m: any) => {
            if (m.created_at) {
              const created = new Date(m.created_at);
              if (created >= startOfToday) messagesToday++;
              if (created >= startOf7d) messages7d++;
            }
          });
        }

        return {
          totalUsers: { value: totalUsersVal, change: 0.0, trend: 'neutral', today: usersToday, thisWeek: users7d },
          activatedUsers: { value: activatedUsersVal, change: 0.0, trend: 'neutral', today: activatedToday, thisWeek: activated7d },
          returnedUsers: { value: returnedUsersVal, change: 0.0, trend: 'neutral' },
          retentionRate: { value: 0.0, change: 0.0, trend: 'neutral' },
          interestsSent: { value: interestMetrics.interestsSent, change: 0.0, trend: 'neutral', today: matchesSentToday, thisWeek: matchesSent7d },
          conversationsCreated: { value: conversationMetrics.totalConversations, change: 0.0, trend: 'neutral', today: strangerConversationsToday, thisWeek: strangerConversations7d },
          interestAcceptanceRate: { value: interestMetrics.acceptanceRate, change: 0.0, trend: 'neutral' },
          messagesSent: { value: conversationMetrics.totalMessagesSent, change: 0.0, trend: 'neutral', today: messagesToday, thisWeek: messages7d },
          
          // Signups Launch KPI
          signupsToday,
          signupsYesterday,
          signups7d,
          signups30d,

          // First stranger conversations
          firstStrangerConversationsToday: strangerConversationsToday,
          firstStrangerConversations7d: strangerConversations7d,
          firstStrangerConversationsTotal: strangerConversationsTotal,

          // Activation stats
          profileCompletionRate,
          travelIntentionCompletionRate,
          missingProfilePictureCount: missingPhotoCount,
          missingProfilePicturePct: missingPhotoPct,
          missingTravelIntentionsCount: missingIntentionsCount,
          missingTravelIntentionsPct: missingIntentionsPct,
          fullyActivatedCount,
          fullyActivatedPct: activationCompletionRate,

          // Placeholders
          travelCirclesPlaceholder: 0,
          emailSentPlaceholder: 0,
          emailDeliveredPlaceholder: 0,
          emailOpenedPlaceholder: 0,
          emailClickedPlaceholder: 0,
          emailBouncePlaceholder: 0,
        };
      } catch (e) {
        console.error("[Analytics Service] getOverviewMetrics failed:", e);
        Sentry.captureException(e);
        throw e;
      }
    });
  });


  /**
   * Fetch aggregated daily messaging timelines.
   * 
   * @param filters - Active date limitations
   */
  public static getMessagingMetrics = cache(async (filters: Pick<AnalyticsFilter, 'dateRange'>): Promise<MessagingAnalyticsResponse> => {
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
        throw e;
      }
    });
  });

  /**
   * Fetch notification dispatch statistics.
   * 
   * @param filters - Active date limitations
   */
  public static getNotificationMetrics = cache(async (filters: Pick<AnalyticsFilter, 'dateRange'>): Promise<NotificationAnalyticsResponse> => {
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
        throw e;
      }
    });
  });

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
        throw e;
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
        throw e;
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
          const profile = u?.profiles 
            ? (Array.isArray(u.profiles) ? (u.profiles.length > 0 ? u.profiles[0] : null) : u.profiles)
            : null;
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
        throw e;
      }
    });
  }
}
