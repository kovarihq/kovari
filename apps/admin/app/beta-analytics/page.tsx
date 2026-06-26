import { requireAdminPage } from "@/admin-lib/adminAuth";
import { AnalyticsService } from "@/src/lib/analytics/analytics.service";
import { DateRange } from "@/src/types/analytics";
import { MetricGrid } from "@/components/admin/MetricGrid";
import { AnalyticsMetricCard } from "@/components/admin/AnalyticsMetricCard";
import { AnalyticsSection } from "@/components/admin/AnalyticsSection";
import { PercentageIndicator } from "@/components/admin/PercentageIndicator";
import { AnalyticsStatGroup } from "@/components/admin/AnalyticsStatGroup";
import { BetaAnalyticsFilters } from "@/components/admin/BetaAnalyticsFilters";
import { GroupContainer } from "@/components/ui/ios/GroupContainer";
import { ListRow } from "@/components/ui/ios/ListRow";
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
  MailOpen
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

  // 3. Fetch data concurrently from AnalyticsService (cached in Redis)
  const [
    totalUsers,
    activatedUsers,
    returnedUsers,
    travelIntentions,
    interestMetrics,
    conversationMetrics
  ] = await Promise.all([
    AnalyticsService.getTotalUsers(),
    AnalyticsService.getActivatedUsers(),
    AnalyticsService.getReturnedUsers(),
    AnalyticsService.getTravelIntentionMetrics(filters),
    AnalyticsService.getInterestMetrics(filters),
    AnalyticsService.getConversationMetrics(filters)
  ]);

  // Calculate user conversion rates
  const activationRate = totalUsers > 0 ? Math.round((activatedUsers / totalUsers) * 100) : 0;
  const returnRate = activatedUsers > 0 ? Math.round((returnedUsers / activatedUsers) * 100) : 0;

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
        {/* Section 1: Users */}
        <AnalyticsSection
          title="1. Cohort Growth & Retention"
          description="Basic acquisition and return activity metrics for the beta group"
        >
          <div className="space-y-6">
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
          </div>
        </AnalyticsSection>

        {/* Section 2 & 3: Travel Intentions & Match Interests */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Section 2: Travel Intentions */}
          <AnalyticsSection
            title="2. Travel Intentions"
            description={`Unnested locations added by cohort members (Total intentions: ${travelIntentions.totalIntentionsCount})`}
          >
            {travelIntentions.rows.length === 0 ? (
              <GroupContainer>
                <div className="py-12 text-center text-muted-foreground text-sm">
                  No travel intentions found for this cohort filter
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

          {/* Section 3: Match Interests */}
          <AnalyticsSection
            title="3. Matchmaking & Signal Funnel"
            description="Conversion milestones through matchmaking signals"
          >
            <div className="space-y-4">
              {/* Funnel Metrics Grid */}
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

              {/* Interaction Funnel Progress */}
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
                      Funnel steps data is not loaded
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
        </div>

        {/* Section 4: Conversations */}
        <AnalyticsSection
          title="4. Conversations & Direct Messaging"
          description="Cohort interactions, stranger connections, and messaging leaderboard"
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Conversation Totals */}
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

            {/* Top Active Users Leaderboard */}
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
                      No cohort messaging activity logged yet
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
      </div>
    </div>
  );
}
