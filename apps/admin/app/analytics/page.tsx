import { Suspense } from "react";
import { requireAdminPage } from "@/admin-lib/adminAuth";
import { AnalyticsService } from "@/src/lib/analytics/analytics.service";
import { DateRange, AnalyticsFilter } from "@/src/types/analytics";
import { PercentageIndicator } from "@/components/admin/PercentageIndicator";
import { AnalyticsStatGroup } from "@/components/admin/AnalyticsStatGroup";
import { AnalyticsFilters } from "@/components/admin/AnalyticsFilters";
import { GroupContainer } from "@/components/ui/ios/GroupContainer";
import { ListRow } from "@/components/ui/ios/ListRow";
import { SectionHeader } from "@/components/ui/ios/SectionHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionRetryButton } from "@/components/admin/SectionRetryButton";
import { MessagingTimelineChart } from "@/components/admin/MessagingTimelineChart";
import { 
  Users, 
  MapPin, 
  TrendingUp, 
  MessageSquare, 
  Layers, 
  Activity, 
  ArrowRightLeft,
  Share2,
  AlertTriangle,
  Inbox,
  Mail,
  Clock,
  Flag,
  CircleDot
} from "lucide-react";

interface PageProps {
  searchParams: Promise<{ dateRange?: string; batchId?: string }>;
}

export default async function AnalyticsPage({ searchParams }: PageProps) {
  // 1. Authenticate the page
  await requireAdminPage();

  // 2. Parse query parameters
  const params = await searchParams;
  const dateRange = (params.dateRange as DateRange) || "30d";
  const batchId = params.batchId || "all";
  const filters = { dateRange, batchId };

  return (
    <div className="max-w-full space-y-6 pb-8">
      {/* Page Header with Filter Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
        <div className="">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Product Analytics</h1>
          <p className="text-md text-muted-foreground">
            Monitor growth, activation funnels, matchmaking, and direct messaging metrics
          </p>
        </div>
        <div className="shrink-0">
          <AnalyticsFilters initialDateRange={dateRange} />
        </div>
      </div>

      <div className="space-y-6">
        {/* Section 1: Growth & Users */}
        <Suspense fallback={<GrowthSectionSkeleton />}>
          <ProductGrowthSection filters={filters} />
        </Suspense>

        {/* Section 2: User Activation Funnel */}
        <Suspense fallback={<FunnelSectionSkeleton />}>
          <UserActivationFunnelSection filters={filters} />
        </Suspense>

        {/* Section 3: Activation Health Check */}
        <Suspense fallback={<HealthCheckSectionSkeleton />}>
          <ActivationHealthCheckSection filters={filters} />
        </Suspense>

        {/* Section 4: Public Growth Funnel */}
        <Suspense fallback={<FunnelSectionSkeleton />}>
          <PublicGrowthFunnelSection filters={filters} />
        </Suspense>

        {/* Section 5: Travel Analytics */}
        <Suspense fallback={<TravelIntentionsSectionSkeleton />}>
          <SimpleTravelAnalyticsSection filters={filters} />
        </Suspense>

        {/* Section 6: Matching Analytics */}
        <Suspense fallback={<MatchInterestsSectionSkeleton />}>
          <MatchingAnalyticsSection filters={filters} />
        </Suspense>

        {/* Section 7: Conversations & Messaging */}
        <Suspense fallback={<ConversationsTimelineSectionSkeleton />}>
          <MessagingAnalyticsSection filters={filters} />
        </Suspense>

        {/* Section 8: Email & Future Metric Placeholders */}
        <PlaceholdersSection />
      </div>
    </div>
  );
}

// ============================================================================
// Local Safe Fetch Section Components (RSC)
// ============================================================================

/**
 * 1. Growth & Users Section
 */
async function ProductGrowthSection({ filters }: { filters: AnalyticsFilter }) {
  try {
    const overview = await AnalyticsService.getOverviewMetrics(filters);

    const getDeltaLabel = (today: number | undefined, week: number | undefined) => {
      const todayStr = today !== undefined ? `+${today} today` : "";
      const weekStr = week !== undefined ? `+${week} this week` : "";
      if (todayStr && weekStr) return `${todayStr} • ${weekStr}`;
      return todayStr || weekStr || "No growth data";
    };

    return (
      <section>
        <SectionHeader>User Growth & Signups</SectionHeader>
        <GroupContainer>
          <ListRow
            icon={<div className="rounded-xl"><Users className="h-4 w-4 text-primary" /></div>}
            label="Total Users"
            secondary={getDeltaLabel(overview.totalUsers.today, overview.totalUsers.thisWeek)}
            trailing={<span className="text-foreground font-semibold">{overview.totalUsers.value.toLocaleString()}</span>}
            showChevron={false}
            className="gap-4"
          />
          <ListRow
            icon={<div className="rounded-xl"><Activity className="h-4 w-4 text-primary" /></div>}
            label="Activated Users"
            secondary={getDeltaLabel(overview.activatedUsers.today, overview.activatedUsers.thisWeek)}
            trailing={<span className="text-foreground font-semibold">{overview.activatedUsers.value.toLocaleString()}</span>}
            showChevron={false}
            className="gap-4"
          />
          <ListRow
            icon={<CircleDot className="text-primary h-4 w-4" />}
            label="Signups Today"
            secondary="Public user registrations today"
            trailing={<span className="text-foreground font-semibold">+{overview.signupsToday ?? 0}</span>}
            showChevron={false}
            className="gap-4"
          />
          <ListRow
            icon={<CircleDot className="text-primary h-4 w-4" />}
            label="Signups Last 7 Days"
            secondary="Weekly public registrations"
            trailing={<span className="text-foreground font-semibold">+{overview.signups7d ?? 0}</span>}
            showChevron={false}
            className="gap-4"
          />
        </GroupContainer>
      </section>
    );
  } catch (error) {
    console.error("ProductGrowthSection failed:", error);
    return <SectionErrorState title="User Growth & Signups" errorText="Failed to load growth metrics." />;
  }
}

/**
 * 2. User Activation Funnel Section
 */
async function UserActivationFunnelSection({ filters }: { filters: AnalyticsFilter }) {
  try {
    const interestMetrics = await AnalyticsService.getInterestMetrics(filters);
    const steps = interestMetrics.activationFunnelSteps || [];

    return (
      <section>
        <SectionHeader>User Activation Funnel</SectionHeader>
        <GroupContainer className="p-6 space-y-4">
          {steps.map((step) => (
            <PercentageIndicator
              key={step.stage}
              label={step.label}
              value={step.pct ?? 0}
              showValue={step.count !== null}
              variant={step.stage === "activated_user" ? "success" : "default"}
              size="sm"
            />
          ))}
        </GroupContainer>
      </section>
    );
  } catch (error) {
    console.error("UserActivationFunnelSection failed:", error);
    return <SectionErrorState title="User Activation Funnel" errorText="Failed to load activation funnel." />;
  }
}

/**
 * 3. Activation Health Check Section
 */
async function ActivationHealthCheckSection({ filters }: { filters: AnalyticsFilter }) {
  try {
    const overview = await AnalyticsService.getOverviewMetrics(filters);

    return (
      <section>
        <SectionHeader>Activation Health Check</SectionHeader>
        <GroupContainer>
          <ListRow
            icon={<CircleDot className="text-primary h-4 w-4" />}
            label="Fully Activated Users"
            secondary="Completed profile + photo + intentions"
            trailing={
              <span className="text-green-600 font-semibold">
                {overview.fullyActivatedCount ?? 0} ({overview.fullyActivatedPct ?? 0}%)
              </span>
            }
            showChevron={false}
            className="gap-4"
          />
          <ListRow
            icon={<CircleDot className="text-primary h-4 w-4" />}
            label="Missing Profile Picture"
            secondary="Users registered without profile photos"
            trailing={
              <span className="text-foreground font-semibold">
                {overview.missingProfilePictureCount ?? 0} ({overview.missingProfilePicturePct ?? 0}%)
              </span>
            }
            showChevron={false}
            className="gap-4"
          />
          <ListRow
            icon={<CircleDot className="text-primary h-4 w-4" />}
            label="Missing Travel Intentions"
            secondary="Users registered without intentions"
            trailing={
              <span className="text-foreground font-semibold">
                {overview.missingTravelIntentionsCount ?? 0} ({overview.missingTravelIntentionsPct ?? 0}%)
              </span>
            }
            showChevron={false}
            className="gap-4"
          />
          <ListRow
            icon={<CircleDot className="text-primary h-4 w-4" />}
            label="Profile Completion Rate"
            secondary="Percentage of users completing basic setup"
            trailing={<span className="text-foreground font-semibold">{overview.profileCompletionRate ?? 0}%</span>}
            showChevron={false}
            className="gap-4"
          />
          <ListRow
            icon={<CircleDot className="text-primary h-4 w-4" />}
            label="Travel Intention Rate"
            secondary="Percentage of users adding travel intentions"
            trailing={<span className="text-foreground font-semibold">{overview.travelIntentionCompletionRate ?? 0}%</span>}
            showChevron={false}
            className="gap-4"
          />
        </GroupContainer>
      </section>
    );
  } catch (error) {
    console.error("ActivationHealthCheckSection failed:", error);
    return <SectionErrorState title="Activation Health Check" errorText="Failed to load health check." />;
  }
}

/**
 * 4. Public Growth Funnel Section
 */
async function PublicGrowthFunnelSection({ filters }: { filters: AnalyticsFilter }) {
  try {
    const interestMetrics = await AnalyticsService.getInterestMetrics(filters);
    const steps = interestMetrics.funnelSteps || [];

    return (
      <section>
        <SectionHeader>Public Growth Funnel</SectionHeader>
        <GroupContainer className="p-6 space-y-4">
          {steps.map((step) => (
            <PercentageIndicator
              key={step.stage}
              label={step.label}
              value={step.pct ?? 0}
              showValue={step.count !== null}
              variant={step.stage === "messages_exchanged" ? "success" : "default"}
              size="sm"
            />
          ))}
        </GroupContainer>
      </section>
    );
  } catch (error) {
    console.error("PublicGrowthFunnelSection failed:", error);
    return <SectionErrorState title="Public Growth Funnel" errorText="Failed to load growth funnel." />;
  }
}

/**
 * 5. Simple Travel Analytics Section
 */
async function SimpleTravelAnalyticsSection({ filters }: { filters: AnalyticsFilter }) {
  try {
    const travelIntentions = await AnalyticsService.getTravelIntentionMetrics(filters);

    return (
      <section>
        <SectionHeader>Travel Analytics</SectionHeader>
        
        <GroupContainer className="mb-4">
          <ListRow
            icon={<CircleDot className="text-primary h-4 w-4" />}
            label="Upcoming Trips"
            secondary="Total travel intentions added by active users"
            trailing={<span className="text-foreground font-semibold">{travelIntentions.upcomingTripsCount ?? 0}</span>}
            showChevron={false}
            className="gap-4"
          />
          <ListRow
            icon={<CircleDot className="text-primary h-4 w-4" />}
            label="Solo vs Group Ratio"
            secondary={`Solo: ${travelIntentions.soloPercentage ?? 0}% • Group: ${travelIntentions.groupPercentage ?? 0}%`}
            trailing={
              <span className="text-foreground font-semibold">
                {travelIntentions.soloTravelersCount ?? 0} / {travelIntentions.groupTravelersCount ?? 0}
              </span>
            }
            showChevron={false}
            className="gap-4"
          />
        </GroupContainer>

        {/* Most Popular Destinations */}
        <div className="space-y-2 pt-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block px-1">Most Popular Destinations</span>
          {!travelIntentions || travelIntentions.rows.length === 0 ? (
            <GroupContainer>
              <div className="py-8 flex flex-col items-center justify-center text-center p-6 space-y-2">
                <MapPin className="h-8 w-8 text-primary" />
                <span className="text-sm font-semibold text-foreground">No Destinations Found</span>
              </div>
            </GroupContainer>
          ) : (
            <AnalyticsStatGroup
              items={travelIntentions.rows.slice(0, 6).map((row) => ({
                key: row.destination,
                label: `${row.rank}. ${row.destination}`,
                value: `${row.count} intents`,
                icon: <MapPin className="h-4 w-4 text-primary shrink-0" />,
                secondary: `${row.percentage}% of overall intent`
              }))}
            />
          )}
        </div>
      </section>
    );
  } catch (error) {
    console.error("SimpleTravelAnalyticsSection failed:", error);
    return <SectionErrorState title="Travel Analytics" errorText="Failed to load travel analytics." />;
  }
}

/**
 * 6. Matching Analytics Section
 */
async function MatchingAnalyticsSection({ filters }: { filters: AnalyticsFilter }) {
  try {
    const interestMetrics = await AnalyticsService.getInterestMetrics(filters);

    return (
      <section>
        <SectionHeader>Matchmaking & Signal Funnel</SectionHeader>
        <GroupContainer>
          <ListRow
            icon={<div className="rounded-xl"><Share2 className="h-4 w-4 text-primary" /></div>}
            label="Total Interests Sent"
            secondary="Matching signal exchange volume"
            trailing={<span className="text-foreground font-semibold">{interestMetrics.interestsSent.toLocaleString()}</span>}
            showChevron={false}
            className="gap-4"
          />
          <ListRow
            icon={<CircleDot className="text-primary h-4 w-4" />}
            label="Pending Interests"
            secondary="Interests awaiting decision"
            trailing={<span className="text-foreground font-semibold">{interestMetrics.pendingInterests.toLocaleString()}</span>}
            showChevron={false}
            className="gap-4"
          />
          <ListRow
            icon={<div className="rounded-xl"><TrendingUp className="h-4 w-4 text-primary" /></div>}
            label="Accepted Interests"
            secondary="Mutual connections established"
            trailing={<span className="text-foreground font-semibold">{interestMetrics.acceptedInterests.toLocaleString()}</span>}
            showChevron={false}
            className="gap-4"
          />
          <ListRow
            icon={<div className="rounded-xl"><Activity className="h-4 w-4 text-primary" /></div>}
            label="Connection Acceptance Rate"
            secondary="Ratio of accepted matches to decided matches"
            trailing={<span className="text-green-600 font-semibold">{interestMetrics.acceptanceRate}%</span>}
            showChevron={false}
            className="gap-4"
          />
        </GroupContainer>
      </section>
    );
  } catch (error) {
    console.error("MatchingAnalyticsSection failed:", error);
    return <SectionErrorState title="Matchmaking & Signal Funnel" errorText="Failed to compile matching signals." />;
  }
}

/**
 * 7. Messaging & Conversations Analytics
 */
async function MessagingAnalyticsSection({ filters }: { filters: AnalyticsFilter }) {
  try {
    const conversationMetrics = await AnalyticsService.getConversationMetrics(filters);

    return (
      <section>
        <SectionHeader>Conversations & Messaging</SectionHeader>
        
        <GroupContainer className="mb-4">
          <ListRow
            icon={<CircleDot className="text-primary h-4 w-4" />}
            label="New Conversations"
            secondary="First stranger conversation count"
            trailing={<span className="text-foreground font-semibold">{conversationMetrics.totalConversations.toLocaleString()}</span>}
            showChevron={false}
            className="gap-4"
          />
          <ListRow
            icon={<CircleDot className="text-primary h-4 w-4" />}
            label="Messages Sent"
            secondary="Total messages exchanged in conversations"
            trailing={<span className="text-foreground font-semibold">{conversationMetrics.totalMessagesSent.toLocaleString()}</span>}
            showChevron={false}
            className="gap-4"
          />
          <ListRow
            icon={<CircleDot className="text-primary h-4 w-4" />}
            label="Avg Messages / Conversation"
            secondary="Average message exchange volume per stranger connection"
            trailing={
              <span className="text-foreground font-semibold">
                {conversationMetrics.totalConversations > 0 
                  ? (conversationMetrics.totalMessagesSent / conversationMetrics.totalConversations).toFixed(1) 
                  : 0}
              </span>
            }
            showChevron={false}
            className="gap-4"
          />
        </GroupContainer>

        {/* Messaging Timeline Chart */}
        <GroupContainer>
          <ListRow
            icon={<Activity className="text-primary h-4 w-4" />}
            label="Messaging Timeline"
            secondary="Active conversations and message exchanges over time"
            showChevron={false}
          />
          <MessagingTimelineChart data={conversationMetrics.dailyMessagingActivity} />
        </GroupContainer>
      </section>
    );
  } catch (error) {
    console.error("MessagingAnalyticsSection failed:", error);
    return <SectionErrorState title="Conversations & Messaging" errorText="Failed to compile conversation metrics." />;
  }
}

/**
 * 8. Placeholders for Email Engagement & Travel Circles
 */
function PlaceholdersSection() {
  return (
    <section>
      <SectionHeader>Future Integrations</SectionHeader>
      <GroupContainer>
        <ListRow
          icon={<Mail className="text-muted-foreground h-4 w-4" />}
          label="Emails Sent"
          secondary="Brevo Integration — Placeholder"
          trailing={<span className="text-muted-foreground">—</span>}
          showChevron={false}
          className="gap-4"
        />
        <ListRow
          icon={<Mail className="text-muted-foreground h-4 w-4" />}
          label="Email Open Rate"
          secondary="Brevo Integration — Placeholder"
          trailing={<span className="text-muted-foreground">—</span>}
          showChevron={false}
          className="gap-4"
        />
        <ListRow
          icon={<Layers className="text-muted-foreground h-4 w-4" />}
          label="Travel Circles Created"
          secondary="Circle Metrics — Placeholder"
          trailing={<span className="text-muted-foreground">—</span>}
          showChevron={false}
          className="gap-4"
        />
      </GroupContainer>
    </section>
  );
}

// ============================================================================
// Error Fallback UI Helper
// ============================================================================

function SectionErrorState({ title, errorText }: { title: string; errorText: string }) {
  return (
    <section>
      <SectionHeader className="">{title}</SectionHeader>
      <GroupContainer className="border-destructive/30">
        <div className="py-12 flex flex-col items-center justify-center text-center p-6 space-y-3 max-w-sm mx-auto">
          <div className="bg-destructive/10 p-2.5 rounded-full shrink-0">
            <AlertTriangle className="h-5 w-5 text-destructive" />
          </div>
          <div className="space-y-1">
            <span className="text-sm font-semibold text-foreground">Section Load Failed</span>
            <p className="text-xs text-muted-foreground leading-normal">{errorText}</p>
          </div>
          <SectionRetryButton />
        </div>
      </GroupContainer>
    </section>
  );
}

// ============================================================================
// Local Suspense Loading Skeletons
// ============================================================================

function GrowthSectionSkeleton() {
  return (
    <section>
      <SectionHeader>User Growth & Signups</SectionHeader>
      <GroupContainer>
        {[1, 2, 3, 4, 5].map((i) => (
          <ListRow
            key={i}
            icon={<Skeleton className="h-5 w-5 rounded-full" />}
            label={<Skeleton className="h-4 w-24" />}
            secondary={<Skeleton className="h-3 w-36 mt-1" />}
            trailing={<Skeleton className="h-4 w-12" />}
            showChevron={false}
          />
        ))}
      </GroupContainer>
    </section>
  );
}

function FunnelSectionSkeleton() {
  return (
    <section>
      <SectionHeader>Funnel</SectionHeader>
      <GroupContainer className="p-6 space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-2.5 w-full rounded-full" />
          </div>
        ))}
      </GroupContainer>
    </section>
  );
}

function HealthCheckSectionSkeleton() {
  return (
    <section>
      <SectionHeader>Health Check</SectionHeader>
      <GroupContainer>
        {[1, 2, 3, 4, 5].map((i) => (
          <ListRow
            key={i}
            icon={<Skeleton className="h-5 w-5 rounded-full" />}
            label={<Skeleton className="h-4 w-24" />}
            secondary={<Skeleton className="h-3 w-36 mt-1" />}
            trailing={<Skeleton className="h-4 w-12" />}
            showChevron={false}
          />
        ))}
      </GroupContainer>
    </section>
  );
}

function TravelIntentionsSectionSkeleton() {
  return (
    <section className="space-y-4">
      <SectionHeader>Travel Intentions</SectionHeader>
      <GroupContainer>
        {[1, 2, 3, 4].map((i) => (
          <ListRow
            key={i}
            icon={<Skeleton className="h-4 w-4 rounded-full" />}
            label={<Skeleton className="h-4 w-32" />}
            secondary={<Skeleton className="h-3 w-24 mt-1" />}
            trailing={<Skeleton className="h-4 w-12" />}
            showChevron={false}
          />
        ))}
      </GroupContainer>
    </section>
  );
}

function MatchInterestsSectionSkeleton() {
  return (
    <section>
      <SectionHeader>Matching</SectionHeader>
      <GroupContainer>
        {[1, 2, 3, 4].map((i) => (
          <ListRow
            key={i}
            icon={<Skeleton className="h-5 w-5 rounded-full" />}
            label={<Skeleton className="h-4 w-24" />}
            secondary={<Skeleton className="h-3 w-36 mt-1" />}
            trailing={<Skeleton className="h-4 w-12" />}
            showChevron={false}
          />
        ))}
      </GroupContainer>
    </section>
  );
}

function ConversationsTimelineSectionSkeleton() {
  return (
    <section className="space-y-4">
      <SectionHeader>Conversations</SectionHeader>
      <GroupContainer>
        {[1, 2, 3].map((i) => (
          <ListRow
            key={i}
            icon={<Skeleton className="h-5 w-5 rounded-full" />}
            label={<Skeleton className="h-4 w-24" />}
            secondary={<Skeleton className="h-3 w-36 mt-1" />}
            trailing={<Skeleton className="h-4 w-12" />}
            showChevron={false}
          />
        ))}
      </GroupContainer>
    </section>
  );
}
