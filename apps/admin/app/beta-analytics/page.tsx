import { Suspense } from "react";
import { requireAdminPage } from "@/admin-lib/adminAuth";
import { AnalyticsService } from "@/src/lib/analytics/analytics.service";
import { DateRange, AnalyticsFilter } from "@/src/types/analytics";
import { PercentageIndicator } from "@/components/admin/PercentageIndicator";
import { AnalyticsStatGroup } from "@/components/admin/AnalyticsStatGroup";
import { BetaAnalyticsFilters } from "@/components/admin/BetaAnalyticsFilters";
import { GroupContainer } from "@/components/ui/ios/GroupContainer";
import { ListRow } from "@/components/ui/ios/ListRow";
import { SectionHeader } from "@/components/ui/ios/SectionHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { 
  Users, 
  MapPin, 
  TrendingUp, 
  MessageSquare, 
  Layers, 
  Activity, 
  Sparkles,
  ArrowRightLeft,
  Share2,
  AlertTriangle,
  Inbox
} from "lucide-react";

interface PageProps {
  searchParams: Promise<{ dateRange?: string; batchId?: string }>;
}

export default async function BetaAnalyticsPage({ searchParams }: PageProps) {
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
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Beta Analytics</h1>
          <p className="text-md text-muted-foreground">
            Monitor cohort growth, matchmaking signals, and user interaction metrics
          </p>
        </div>
        <div className="shrink-0">
          <BetaAnalyticsFilters initialDateRange={dateRange} />
        </div>
      </div>

      <div className="space-y-6">
        {/* Section 1: Users */}
        <Suspense fallback={<UsersSectionSkeleton />}>
          <UsersSection />
        </Suspense>

        {/* Section 2: Travel Intentions */}
        <Suspense fallback={<TravelIntentionsSectionSkeleton />}>
          <TravelIntentionsSection filters={filters} />
        </Suspense>

        {/* Section 3: Matchmaking & Signal Funnel Stats */}
        <Suspense fallback={<MatchInterestsSectionSkeleton />}>
          <MatchInterestsSection filters={filters} />
        </Suspense>

        {/* Section 4: Conversations Timeline */}
        <Suspense fallback={<ConversationsTimelineSectionSkeleton />}>
          <ConversationsTimelineSection filters={filters} />
        </Suspense>

        {/* Section 5: Cohort Messaging Leaderboard */}
        <Suspense fallback={<ConversationsLeaderboardSectionSkeleton />}>
          <ConversationsLeaderboardSection filters={filters} />
        </Suspense>

        {/* Section 6: 9-Stage Interaction Funnel */}
        <Suspense fallback={<FunnelSectionSkeleton />}>
          <FunnelSection filters={filters} />
        </Suspense>
      </div>
    </div>
  );
}

// ============================================================================
// Local Safe Fetch Section Components (RSC)
// ============================================================================

/**
 * Renders Users Acquisition and Return metrics safely.
 */
async function UsersSection() {
  try {
    const [totalUsers, activatedUsers, returnedUsers] = await Promise.all([
      AnalyticsService.getTotalUsers(),
      AnalyticsService.getActivatedUsers(),
      AnalyticsService.getReturnedUsers(),
    ]);

    // Handle empty state: zero users registered
    if (totalUsers === 0) {
      return (
        <section>
          <SectionHeader className="">Cohort Growth & Retention</SectionHeader>
          <GroupContainer>
            <div className="py-12 flex flex-col items-center justify-center text-center p-6 space-y-2">
              <Inbox className="h-8 w-8 text-muted-foreground/40" />
              <span className="text-sm font-semibold text-foreground">No Users Registered</span>
              <span className="text-xs text-muted-foreground">There are no cohort members registered in the system yet.</span>
            </div>
          </GroupContainer>
        </section>
      );
    }

    const activationRate = totalUsers > 0 ? Math.round((activatedUsers / totalUsers) * 100) : 0;
    const returnRate = activatedUsers > 0 ? Math.round((returnedUsers / activatedUsers) * 100) : 0;

    return (
      <section>
        <SectionHeader className="">Cohort Growth & Retention</SectionHeader>
        <GroupContainer>
          <ListRow
            icon={<div className="rounded-xl"><Users className="h-4 w-4 text-primary" /></div>}
            label="Total Users"
            secondary="Registered organic cohort size"
            trailing={<span className="text-foreground">{totalUsers.toLocaleString()}</span>}
            showChevron={false}
            className="gap-4"
          />
          <ListRow
            icon={<div className="rounded-xl"><Activity className="h-4 w-4 text-primary" /></div>}
            label="Activated Users"
            secondary={`+${activationRate}% Users who joined the platform`}
            trailing={<span className="text-foreground">{activatedUsers.toLocaleString()}</span>}
            showChevron={false}
            className="gap-4"
          />
          <ListRow
            icon={<div className="rounded-xl"><ArrowRightLeft className="h-4 w-4 text-primary" /></div>}
            label="Returned Users"
            secondary={`+${returnRate}% Users active after activation day`}
            trailing={<span className="text-foreground">{returnedUsers.toLocaleString()}</span>}
            showChevron={false}
            className="gap-4"
          />
        </GroupContainer>
      </section>
    );
  } catch (error) {
    console.error("UsersSection data loading crashed:", error);
    return <SectionErrorState title="Cohort Growth & Retention" errorText="Failed to fetch cohort user statistics." />;
  }
}

/**
 * Renders Popular Travel Destinations list safely.
 */
async function TravelIntentionsSection({ filters }: { filters: AnalyticsFilter }) {
  try {
    const travelIntentions = await AnalyticsService.getTravelIntentionMetrics(filters);

    return (
      <section>
        <SectionHeader className="">Travel Intentions</SectionHeader>
        {!travelIntentions || travelIntentions.rows.length === 0 ? (
          <GroupContainer>
            <div className="py-12 flex flex-col items-center justify-center text-center p-6 space-y-2">
              <MapPin className="h-8 w-8 text-primary" />
              <span className="text-sm font-semibold text-foreground">No Destinations Found</span>
              <span className="text-xs text-muted-foreground">No target locations have been submitted under these filters.</span>
            </div>
          </GroupContainer>
        ) : (
          <AnalyticsStatGroup
            items={travelIntentions.rows.slice(0, 6).map((row) => ({
              key: row.destination,
              label: `${row.rank}. ${row.destination}`,
              value: `${row.count} signups`,
              icon: <MapPin className="h-4 w-4 text-primary shrink-0" />,
              secondary: `${row.percentage}% of overall intent`
            }))}
          />
        )}
      </section>
    );
  } catch (error) {
    console.error("TravelIntentionsSection data loading crashed:", error);
    return <SectionErrorState title="Travel Intentions" errorText="Failed to retrieve travel destination lists." />;
  }
}

/**
 * Renders Match Interest funnel signals safely.
 */
async function MatchInterestsSection({ filters }: { filters: AnalyticsFilter }) {
  try {
    const interestMetrics = await AnalyticsService.getInterestMetrics(filters);

    // Empty state: no match signals dispatched
    if (!interestMetrics || interestMetrics.interestsSent === 0) {
      return (
        <section>
          <SectionHeader className="">Matchmaking & Signal Funnel</SectionHeader>
          <GroupContainer>
            <div className="py-12 flex flex-col items-center justify-center text-center p-6 space-y-2">
              <Layers className="h-8 w-8 text-muted-foreground/40" />
              <span className="text-sm font-semibold text-foreground">No Match Activity</span>
              <span className="text-xs text-muted-foreground">No matchmaking signal exchanges or actions have occurred yet.</span>
            </div>
          </GroupContainer>
        </section>
      );
    }

    return (
      <section>
        <SectionHeader className="">Matchmaking & Signal Funnel</SectionHeader>
        <GroupContainer>
          <ListRow
            icon={<div className="rounded-xl"><Share2 className="h-4 w-4 text-primary" /></div>}
            label="Interests Sent"
            secondary="Total matching signals dispatched"
            trailing={<span className="text-foreground">{interestMetrics.interestsSent.toLocaleString()}</span>}
            showChevron={false}
            className="gap-4"
          />
          <ListRow
            icon={<div className="rounded-xl"><TrendingUp className="h-4 w-4 text-primary" /></div>}
            label="Acceptance Rate"
            secondary="Accept/Decide connection ratio"
            trailing={<span className="text-foreground">{interestMetrics.acceptanceRate}%</span>}
            showChevron={false}
            className="gap-4"
          />
        </GroupContainer>
      </section>
    );
  } catch (error) {
    console.error("MatchInterestsSection data loading crashed:", error);
    return <SectionErrorState title="3. Matchmaking & Signal Funnel" errorText="Failed to compile matching signals." />;
  }
}

/**
 * Renders Conversation messaging volumes safely (Timeline + Stats).
 */
async function ConversationsTimelineSection({ filters }: { filters: AnalyticsFilter }) {
  try {
    const conversationMetrics = await AnalyticsService.getConversationMetrics(filters);

    // Empty state: no conversation connections
    if (!conversationMetrics || conversationMetrics.totalConversations === 0) {
      return (
        <section>
          <SectionHeader className="">Conversations & Direct Messaging</SectionHeader>
          <GroupContainer>
            <div className="py-12 flex flex-col items-center justify-center text-center p-6 space-y-2">
              <span className="text-sm font-semibold text-foreground">No Conversations Exchanged</span>
              <span className="text-xs text-muted-foreground">No chat connections or message histories have been recorded.</span>
            </div>
          </GroupContainer>
        </section>
      );
    }

    return (
      <section>
        <SectionHeader className="">Conversations & Direct Messaging</SectionHeader>
        <div className="space-y-4">
          <GroupContainer>
            <ListRow
              icon={<div className="rounded-xl"><ArrowRightLeft className="h-4 w-4 text-primary" /></div>}
              label="Total Connections"
              secondary="Stranger connections formed"
              trailing={<span className="text-foreground">{conversationMetrics.totalConversations.toLocaleString()}</span>}
              showChevron={false}
              className="gap-4"
            />
            <ListRow
              icon={<div className="rounded-xl"><MessageSquare className="h-4 w-4 text-primary" /></div>}
              label="Messages Sent"
              secondary="Exchanged direct texts"
              trailing={<span className="text-foreground">{conversationMetrics.totalMessagesSent.toLocaleString()}</span>}
              showChevron={false}
              className="gap-4"
            />
          </GroupContainer>
          
          <GroupContainer>
            <ListRow
              icon={<Activity className="text-primary h-4 w-4" />}
              label="Direct Messaging Timeline"
              secondary="Activity trends over dates"
              showChevron={false}
            />
            <div className="h-[180px] bg-secondary/10 flex items-center justify-center border-t border-border">
              <div className="flex flex-col items-center space-y-1.5 text-center p-4">
                <MessageSquare className="h-6 w-6 text-muted-foreground/40" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Daily Messaging Timeline Chart Placeholder
                </span>
                <span className="text-[11px] text-muted-foreground/70">
                  Renders logs of message volume trends across the selected duration
                </span>
              </div>
            </div>
          </GroupContainer>
        </div>
      </section>
    );
  } catch (error) {
    console.error("ConversationsTimelineSection data loading crashed:", error);
    return <SectionErrorState title="Conversations & Direct Messaging" errorText="Failed to compile conversation timelines." />;
  }
}

/**
 * Renders Conversation Messaging Leaderboard safely.
 */
async function ConversationsLeaderboardSection({ filters }: { filters: AnalyticsFilter }) {
  try {
    const conversationMetrics = await AnalyticsService.getConversationMetrics(filters);

    if (!conversationMetrics || conversationMetrics.totalConversations === 0) {
      return null;
    }

    return (
      <section>
        <SectionHeader className="">Cohort Messaging Leaderboard</SectionHeader>
        <GroupContainer>
          <ListRow
            icon={<Sparkles className="text-primary h-4 w-4" />}
            label="Most Active Members"
            secondary="Top direct messaging users in the cohort"
            showChevron={false}
          />
          <div className="border-t border-border flex-1">
            {conversationMetrics.mostActiveUsers.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-xs">
                No active messaging members found
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {conversationMetrics.mostActiveUsers.slice(0, 5).map((user) => (
                  <ListRow
                    key={user.userId}
                    icon={<Sparkles className="text-muted-foreground/60 h-4 w-4" />}
                    label={user.name}
                    secondary={`${user.messagesReceived} rcvd • ${user.email}`}
                    trailing={
                      <span className="font-semibold text-foreground text-xs leading-none">
                        {user.messagesSent} sent
                      </span>
                    }
                    showChevron={false}
                  />
                ))}
              </div>
            )}
          </div>
        </GroupContainer>
      </section>
    );
  } catch (error) {
    console.error("ConversationsLeaderboardSection data loading crashed:", error);
    return <SectionErrorState title="Cohort Messaging Leaderboard" errorText="Failed to compile leaderboard." />;
  }
}

/**
 * Renders 9-Stage Interaction Funnel safely at the bottom of the page.
 */
async function FunnelSection({ filters }: { filters: AnalyticsFilter }) {
  try {
    const interestMetrics = await AnalyticsService.getInterestMetrics(filters);

    if (!interestMetrics || interestMetrics.funnelSteps.length === 0) {
      return null;
    }

    return (
      <section>
        <SectionHeader className="">9-Stage Interaction Funnel</SectionHeader>
        <GroupContainer>
          <ListRow
            icon={<Layers className="text-primary h-4 w-4" />}
            label="Cohort Conversion Milestones"
            secondary="Step-by-step conversion of the cohort"
            showChevron={false}
          />
          <div className="p-6 space-y-4">
            {interestMetrics.funnelSteps.map((step) => (
              <PercentageIndicator
                key={step.stage}
                label={step.label}
                value={step.pct ?? 0}
                showValue={step.count !== null}
                variant={step.stage === "message_sent" ? "success" : "default"}
                size="sm"
                tooltipText={step.warning}
              />
            ))}
          </div>
        </GroupContainer>
      </section>
    );
  } catch (error) {
    console.error("FunnelSection data loading crashed:", error);
    return <SectionErrorState title="9-Stage Interaction Funnel" errorText="Failed to compile interaction funnel." />;
  }
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
            <p className="text-xs text-muted-foreground leading-normal">{errorText} Please reload the dashboard to try again.</p>
          </div>
        </div>
      </GroupContainer>
    </section>
  );
}

// ============================================================================
// Local Suspense Loading Skeletons
// ============================================================================

function UsersSectionSkeleton() {
  return (
    <section>
      <SectionHeader className="">Cohort Growth & Retention</SectionHeader>
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

function TravelIntentionsSectionSkeleton() {
  return (
    <section>
      <SectionHeader className="">Travel Intentions</SectionHeader>
      <GroupContainer>
        <ListRow
          icon={<Skeleton className="h-5 w-5 rounded-full" />}
          label={<Skeleton className="h-4 w-24" />}
          secondary={<Skeleton className="h-3 w-36 mt-1" />}
          showChevron={false}
        />
        <div className="divide-y divide-border border-t border-border">
          {[1, 2, 3, 4, 5].map((i) => (
            <ListRow
              key={i}
              icon={<Skeleton className="h-4 w-4 rounded-full" />}
              label={<Skeleton className="h-4 w-32" />}
              secondary={<Skeleton className="h-3 w-24 mt-1" />}
              trailing={<Skeleton className="h-4 w-12" />}
              showChevron={false}
            />
          ))}
        </div>
      </GroupContainer>
    </section>
  );
}

function MatchInterestsSectionSkeleton() {
  return (
    <section>
      <SectionHeader className="">Matchmaking & Signal Funnel</SectionHeader>
      <GroupContainer>
        {[1, 2].map((i) => (
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
    <section>
      <SectionHeader className="">Conversations & Direct Messaging</SectionHeader>
      <div className="space-y-4">
        <GroupContainer>
          {[1, 2].map((i) => (
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
        <GroupContainer>
          <ListRow
            icon={<Skeleton className="h-5 w-5 rounded-full" />}
            label={<Skeleton className="h-4 w-24" />}
            secondary={<Skeleton className="h-3 w-36 mt-1" />}
            showChevron={false}
          />
          <div className="h-[180px] border-t border-border flex items-center justify-center p-6 bg-secondary/5">
            <Skeleton className="h-full w-full rounded-lg" />
          </div>
        </GroupContainer>
      </div>
    </section>
  );
}

function ConversationsLeaderboardSectionSkeleton() {
  return (
    <section>
      <SectionHeader className="">Cohort Messaging Leaderboard</SectionHeader>
      <GroupContainer className="h-full flex flex-col justify-between">
        <ListRow
          icon={<Skeleton className="h-5 w-5 rounded-full" />}
          label={<Skeleton className="h-4 w-24" />}
          secondary={<Skeleton className="h-3 w-36 mt-1" />}
          showChevron={false}
        />
        <div className="flex-1 border-t border-border p-4 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="w-20 h-3" />
                  <Skeleton className="w-28 h-2" />
                </div>
              </div>
            ))}
          </div>
          <Skeleton className="h-3 w-1/2 mx-auto mt-4" />
        </div>
      </GroupContainer>
    </section>
  );
}

function FunnelSectionSkeleton() {
  return (
    <section>
      <SectionHeader className="">9-Stage Interaction Funnel</SectionHeader>
      <GroupContainer>
        <ListRow
          icon={<Skeleton className="h-5 w-5 rounded-full" />}
          label={<Skeleton className="h-4 w-24" />}
          secondary={<Skeleton className="h-3 w-36 mt-1" />}
          showChevron={false}
        />
        <div className="border-t border-border p-6 space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-2.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      </GroupContainer>
    </section>
  );
}
