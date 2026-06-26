import { Suspense } from "react";
import { requireAdminPage } from "@/admin-lib/adminAuth";
import { AnalyticsService } from "@/src/lib/analytics/analytics.service";
import { DateRange, AnalyticsFilter } from "@/src/types/analytics";
import { MetricGrid } from "@/components/admin/MetricGrid";
import { AnalyticsMetricCard } from "@/components/admin/AnalyticsMetricCard";
import { AnalyticsSection } from "@/components/admin/AnalyticsSection";
import { PercentageIndicator } from "@/components/admin/PercentageIndicator";
import { AnalyticsStatGroup } from "@/components/admin/AnalyticsStatGroup";
import { BetaAnalyticsFilters } from "@/components/admin/BetaAnalyticsFilters";
import { GroupContainer } from "@/components/ui/ios/GroupContainer";
import { ListRow } from "@/components/ui/ios/ListRow";
import { Skeleton } from "@/components/ui/skeleton";
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
    <div className="max-w-full mx-auto space-y-8 pb-12">
      {/* Page Header with Filter Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Beta Analytics</h1>
          <p className="text-md text-muted-foreground">
            Monitor cohort growth, matchmaking signals, and user interaction metrics
          </p>
        </div>
        <div className="shrink-0">
          <BetaAnalyticsFilters initialDateRange={dateRange} />
        </div>
      </div>

      <div className="space-y-8">
        {/* Section 1: Users (Wrapped in Suspense) */}
        <Suspense fallback={<UsersSectionSkeleton />}>
          <UsersSection />
        </Suspense>

        {/* Responsive Row for Intentions and Interests */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Section 2: Travel Intentions */}
          <Suspense fallback={<TravelIntentionsSectionSkeleton />}>
            <TravelIntentionsSection filters={filters} />
          </Suspense>

          {/* Section 3: Match Interests */}
          <Suspense fallback={<MatchInterestsSectionSkeleton />}>
            <MatchInterestsSection filters={filters} />
          </Suspense>
        </div>

        {/* Section 4: Conversations */}
        <Suspense fallback={<ConversationsSectionSkeleton />}>
          <ConversationsSection filters={filters} />
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
        <AnalyticsSection title="1. Cohort Growth & Retention">
          <GroupContainer>
            <div className="py-12 flex flex-col items-center justify-center text-center p-6 space-y-2">
              <Inbox className="h-8 w-8 text-muted-foreground/40" />
              <span className="text-sm font-semibold text-foreground">No Users Registered</span>
              <span className="text-xs text-muted-foreground">There are no cohort members registered in the system yet.</span>
            </div>
          </GroupContainer>
        </AnalyticsSection>
      );
    }

    const activationRate = totalUsers > 0 ? Math.round((activatedUsers / totalUsers) * 100) : 0;
    const returnRate = activatedUsers > 0 ? Math.round((returnedUsers / activatedUsers) * 100) : 0;

    return (
      <AnalyticsSection
        title="1. Cohort Growth & Retention"
        description="Basic acquisition and return activity metrics for the beta group"
      >
        <MetricGrid cols={3}>
          <AnalyticsMetricCard
            title="Total Users"
            value={totalUsers.toLocaleString()}
            icon={Users}
            description="Registered organic cohort size"
            tooltipText="Excludes Kovari admins and founders to track only organic metrics."
          />
          <AnalyticsMetricCard
            title="Activated Users"
            value={activatedUsers.toLocaleString()}
            icon={Activity}
            description="Users who joined the platform"
            trend={{
              value: activationRate,
              isPositive: true
            }}
            tooltipText="Percentage of organic users who completed the invitation flow."
          />
          <AnalyticsMetricCard
            title="Returned Users"
            value={returnedUsers.toLocaleString()}
            icon={ArrowRightLeft}
            description="Users active after activation day"
            trend={{
              value: returnRate,
              isPositive: true
            }}
            tooltipText="Activation return rate. Note: Requires telemetry tracking updates to capture full sessions."
          />
        </MetricGrid>
      </AnalyticsSection>
    );
  } catch (error) {
    console.error("UsersSection data loading crashed:", error);
    return <SectionErrorState title="1. Cohort Growth & Retention" errorText="Failed to fetch cohort user statistics." />;
  }
}

/**
 * Renders Popular Travel Destinations list safely.
 */
async function TravelIntentionsSection({ filters }: { filters: AnalyticsFilter }) {
  try {
    const travelIntentions = await AnalyticsService.getTravelIntentionMetrics(filters);

    return (
      <AnalyticsSection
        title="2. Travel Intentions"
        description={`Unnested locations added by cohort members (Total intentions: ${travelIntentions?.totalIntentionsCount ?? 0})`}
      >
        {!travelIntentions || travelIntentions.rows.length === 0 ? (
          <GroupContainer>
            <div className="py-12 flex flex-col items-center justify-center text-center p-6 space-y-2">
              <MapPin className="h-8 w-8 text-muted-foreground/40" />
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
              icon: MapPin,
              secondary: `${row.percentage}% of overall intent`
            }))}
          />
        )}
      </AnalyticsSection>
    );
  } catch (error) {
    console.error("TravelIntentionsSection data loading crashed:", error);
    return <SectionErrorState title="2. Travel Intentions" errorText="Failed to retrieve travel destination lists." />;
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
        <AnalyticsSection title="3. Matchmaking & Signal Funnel" description="Conversion milestones through matchmaking signals">
          <GroupContainer>
            <div className="py-12 flex flex-col items-center justify-center text-center p-6 space-y-2">
              <Layers className="h-8 w-8 text-muted-foreground/40" />
              <span className="text-sm font-semibold text-foreground">No Match Activity</span>
              <span className="text-xs text-muted-foreground">No matchmaking signal exchanges or actions have occurred yet.</span>
            </div>
          </GroupContainer>
        </AnalyticsSection>
      );
    }

    return (
      <AnalyticsSection
        title="3. Matchmaking & Signal Funnel"
        description="Conversion milestones through matchmaking signals"
      >
        <div className="space-y-4">
          <MetricGrid cols={2}>
            <AnalyticsMetricCard
              title="Interests Sent"
              value={interestMetrics.interestsSent.toLocaleString()}
              icon={Share2}
              description="Total matching signals dispatched"
            />
            <AnalyticsMetricCard
              title="Acceptance Rate"
              value={`${interestMetrics.acceptanceRate}%`}
              icon={TrendingUp}
              description="Accept/Decide connection ratio"
              trend={{
                value: interestMetrics.acceptanceRate,
                isPositive: interestMetrics.acceptanceRate >= 50
              }}
            />
          </MetricGrid>

          <GroupContainer>
            <ListRow
              icon={<Layers className="text-primary h-4 w-4" />}
              label="9-Stage Interaction Funnel"
              secondary="Step-by-step conversion of the cohort"
              showChevron={false}
            />
            <div className="border-t border-border p-6 space-y-4">
              {interestMetrics.funnelSteps.length === 0 ? (
                <div className="text-center text-xs text-muted-foreground py-4">
                  No funnel milestone data is recorded
                </div>
              ) : (
                interestMetrics.funnelSteps.map((step) => (
                  <PercentageIndicator
                    key={step.stage}
                    label={step.label}
                    value={step.pct ?? 0}
                    showValue={step.count !== null}
                    variant={step.stage === "message_sent" ? "success" : "default"}
                    size="sm"
                    tooltipText={step.warning}
                  />
                ))
              )}
            </div>
          </GroupContainer>
        </div>
      </AnalyticsSection>
    );
  } catch (error) {
    console.error("MatchInterestsSection data loading crashed:", error);
    return <SectionErrorState title="3. Matchmaking & Signal Funnel" errorText="Failed to compile matching signals." />;
  }
}

/**
 * Renders Conversation messaging volumes and leaderboard safely.
 */
async function ConversationsSection({ filters }: { filters: AnalyticsFilter }) {
  try {
    const conversationMetrics = await AnalyticsService.getConversationMetrics(filters);

    // Empty state: no conversation connections
    if (!conversationMetrics || conversationMetrics.totalConversations === 0) {
      return (
        <AnalyticsSection title="4. Conversations & Direct Messaging" description="Cohort interactions, connections, and leaderboard">
          <GroupContainer>
            <div className="py-12 flex flex-col items-center justify-center text-center p-6 space-y-2">
              <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
              <span className="text-sm font-semibold text-foreground">No Conversations Exchanged</span>
              <span className="text-xs text-muted-foreground">No chat connections or message histories have been recorded.</span>
            </div>
          </GroupContainer>
        </AnalyticsSection>
      );
    }

    return (
      <AnalyticsSection
        title="4. Conversations & Direct Messaging"
        description="Cohort interactions, stranger connections, and messaging leaderboard"
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <MetricGrid cols={2}>
              <AnalyticsMetricCard
                title="Total Connections"
                value={conversationMetrics.totalConversations.toLocaleString()}
                icon={ArrowRightLeft}
                description="Stranger connections formed"
              />
              <AnalyticsMetricCard
                title="Messages Sent"
                value={conversationMetrics.totalMessagesSent.toLocaleString()}
                icon={MessageSquare}
                description="Exchanged direct texts"
              />
            </MetricGrid>
            
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

          <div>
            <GroupContainer className="h-full flex flex-col justify-between">
              <ListRow
                icon={<Sparkles className="text-primary h-4 w-4" />}
                label="Cohort Messaging Leaderboard"
                secondary="Most active messaging members"
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
                      <div key={user.userId} className="flex justify-between items-center px-4 py-3 text-xs">
                        <div className="flex flex-col min-w-0">
                          <span className="font-semibold text-foreground truncate">{user.name}</span>
                          <span className="text-muted-foreground truncate text-[10px]">{user.email}</span>
                        </div>
                        <div className="flex flex-col items-end shrink-0">
                          <span className="font-bold text-foreground font-mono">{user.messagesSent} sent</span>
                          <span className="text-[10px] text-muted-foreground font-mono">{user.messagesReceived} rcvd</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </GroupContainer>
          </div>
        </div>
      </AnalyticsSection>
    );
  } catch (error) {
    console.error("ConversationsSection data loading crashed:", error);
    return <SectionErrorState title="4. Conversations & Direct Messaging" errorText="Failed to compile conversation timelines." />;
  }
}

// ============================================================================
// Error Fallback UI Helper
// ============================================================================

function SectionErrorState({ title, errorText }: { title: string; errorText: string }) {
  return (
    <AnalyticsSection title={title}>
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
    </AnalyticsSection>
  );
}

// ============================================================================
// Local Suspense Loading Skeletons
// ============================================================================

function UsersSectionSkeleton() {
  return (
    <AnalyticsSection title="1. Cohort Growth & Retention">
      <MetricGrid cols={3}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-4 rounded-full" />
            </div>
            <div className="px-6 pb-6 space-y-2">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </MetricGrid>
    </AnalyticsSection>
  );
}

function TravelIntentionsSectionSkeleton() {
  return (
    <AnalyticsSection title="2. Travel Intentions">
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center px-4 py-3 min-h-[52px]">
          <div className="flex items-center gap-3 w-full">
            <Skeleton className="h-5 w-5 rounded-full" />
            <Skeleton className="h-4 w-1/4" />
          </div>
        </div>
        <div className="border-t border-border p-6 min-h-[300px] flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
                <div className="flex items-center gap-3 w-1/2">
                  <Skeleton className="h-3 w-4" />
                  <Skeleton className="h-3 w-full" />
                </div>
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
          <Skeleton className="h-3 w-1/3 mx-auto" />
        </div>
      </div>
    </AnalyticsSection>
  );
}

function MatchInterestsSectionSkeleton() {
  return (
    <AnalyticsSection title="3. Matchmaking & Signal Funnel">
      <div className="space-y-4">
        <MetricGrid cols={2}>
          {[1, 2].map((i) => (
            <div key={i} className="rounded-xl border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-6 pt-6 pb-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-4" />
              </div>
              <div className="px-6 pb-6 space-y-2">
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-3.5 w-32" />
              </div>
            </div>
          ))}
        </MetricGrid>

        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center px-4 py-3 min-h-[52px]">
            <div className="flex items-center gap-3 w-full">
              <Skeleton className="h-5 w-5 rounded-full" />
              <Skeleton className="h-4 w-1/4" />
            </div>
          </div>
          <div className="border-t border-border p-6 min-h-[300px] flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-2.5 w-full rounded-full" />
                </div>
              ))}
            </div>
            <Skeleton className="h-3 w-1/3 mx-auto" />
          </div>
        </div>
      </div>
    </AnalyticsSection>
  );
}

function ConversationsSectionSkeleton() {
  return (
    <AnalyticsSection title="4. Conversations & Direct Messaging">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <MetricGrid cols={2}>
            {[1, 2].map((i) => (
              <div key={i} className="rounded-xl border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-6 pt-6 pb-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-4" />
                </div>
                <div className="px-6 pb-6 space-y-2">
                  <Skeleton className="h-7 w-20" />
                  <Skeleton className="h-3.5 w-32" />
                </div>
              </div>
            ))}
          </MetricGrid>
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 min-h-[52px]">
              <div className="flex items-center gap-3 w-full">
                <Skeleton className="h-5 w-5 rounded-full" />
                <div className="space-y-1 w-2/3">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            </div>
            <div className="h-[180px] border-t border-border flex items-center justify-center p-6">
              <Skeleton className="h-full w-full rounded-lg" />
            </div>
          </div>
        </div>

        <div>
          <div className="rounded-xl border bg-card overflow-hidden h-full flex flex-col">
            <div className="flex items-center px-4 py-3 min-h-[52px]">
              <div className="flex items-center gap-3 w-full">
                <Skeleton className="h-5 w-5 rounded-full" />
                <div className="space-y-1 w-2/3">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            </div>
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
          </div>
        </div>
      </div>
    </AnalyticsSection>
  );
}
