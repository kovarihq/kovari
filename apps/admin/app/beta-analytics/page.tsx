import { requireAdminPage } from "@/admin-lib/adminAuth";
import { GroupContainer } from "@/components/ui/ios/GroupContainer";
import { ListRow } from "@/components/ui/ios/ListRow";
import { SectionHeader } from "@/components/ui/ios/SectionHeader";
import { 
  Users, 
  MapPin, 
  TrendingUp, 
  MessageSquare, 
  Layers, 
  Activity, 
  Sparkles,
  ArrowRightLeft
} from "lucide-react";

export default async function BetaAnalyticsPage() {
  // Ensure the user has admin credentials before rendering the page
  await requireAdminPage();

  return (
    <div className="max-w-full mx-auto space-y-8 pb-12">
      {/* Header Section */}
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">Beta Analytics</h1>
        <p className="text-md text-muted-foreground">
          Cohort performance, matchmaking funnel progression, and travel intentions
        </p>
      </div>

      <div className="space-y-8">
        {/* Section 1: Users */}
        <section className="space-y-3">
          <SectionHeader>1. Users & Retention</SectionHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Users Placeholder List */}
            <div className="md:col-span-2">
              <GroupContainer>
                <ListRow
                  icon={<Users className="text-primary h-4 w-4" />}
                  label="Cohort Size & Active Users"
                  secondary="Daily active users (DAU) and weekly active users (WAU)"
                  trailing={<span className="text-sm font-medium text-muted-foreground font-mono">Placeholder Chart</span>}
                  showChevron={false}
                />
                <div className="h-[220px] bg-secondary/30 flex items-center justify-center border-t border-border">
                  <div className="flex flex-col items-center space-y-2 text-center p-4">
                    <Activity className="h-8 w-8 text-muted-foreground/40 animate-pulse" />
                    <span className="text-sm font-medium text-muted-foreground">User Growth & Retention Trend Chart Placeholder</span>
                    <span className="text-xs text-muted-foreground/70">Will render DAU/MAU timeline analysis</span>
                  </div>
                </div>
              </GroupContainer>
            </div>

            {/* Retention Metrics Placeholder */}
            <div>
              <GroupContainer className="h-full flex flex-col">
                <ListRow
                  icon={<Activity className="text-primary h-4 w-4" />}
                  label="Stickiness & Retention"
                  showChevron={false}
                />
                <div className="flex-1 p-6 flex flex-col justify-center space-y-4 border-t border-border">
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <span>DAU / MAU Ratio</span>
                      <span className="font-mono">--%</span>
                    </div>
                    <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                      <div className="bg-primary/20 h-full rounded-full" style={{ width: "35%" }} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <span>Day 1 Retention</span>
                      <span className="font-mono">--%</span>
                    </div>
                    <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                      <div className="bg-primary/20 h-full rounded-full" style={{ width: "45%" }} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <span>Day 7 Retention</span>
                      <span className="font-mono">--%</span>
                    </div>
                    <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                      <div className="bg-primary/20 h-full rounded-full" style={{ width: "20%" }} />
                    </div>
                  </div>
                </div>
              </GroupContainer>
            </div>
          </div>
        </section>

        {/* Responsive Row for Intentions and Interests */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Section 2: Travel Intentions */}
          <section className="space-y-3">
            <SectionHeader>2. Travel Intentions</SectionHeader>
            <GroupContainer>
              <ListRow
                icon={<MapPin className="text-primary h-4 w-4" />}
                label="Popular Destinations"
                secondary="Ranking of target locations submitted by users"
                showChevron={false}
              />
              <div className="border-t border-border p-6 min-h-[300px] flex flex-col justify-between">
                <div className="space-y-4">
                  {/* Top Destinations Placeholder List */}
                  {[1, 2, 3].map((rank) => (
                    <div key={rank} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-muted-foreground/60 w-4">#{rank}</span>
                        <div className="w-24 h-4 bg-secondary/80 rounded animate-pulse" />
                      </div>
                      <div className="w-12 h-4 bg-secondary/80 rounded animate-pulse" />
                    </div>
                  ))}
                </div>
                <div className="text-center text-xs text-muted-foreground py-4 mt-4">
                  <span>Destination ranking table placeholder</span>
                </div>
              </div>
            </GroupContainer>
          </section>

          {/* Section 3: Match Interests */}
          <section className="space-y-3">
            <SectionHeader>3. Match Interests & Interaction Funnel</SectionHeader>
            <GroupContainer>
              <ListRow
                icon={<Layers className="text-primary h-4 w-4" />}
                label="Engagement Funnel"
                secondary="User conversion through system signals"
                showChevron={false}
              />
              <div className="border-t border-border p-6 min-h-[300px] flex flex-col justify-between">
                <div className="space-y-3">
                  {/* Funnel Step Placeholder Indicators */}
                  {["Invited & Onboarded", "Travel Intent Completed", "Matches Interacted", "Chat Initiated"].map((stage, idx) => (
                    <div key={stage} className="space-y-1">
                      <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                        <span>{stage}</span>
                        <span className="font-mono">Stage {idx + 1}</span>
                      </div>
                      <div className="w-full bg-secondary h-2.5 rounded-full overflow-hidden">
                        <div className="bg-primary/35 h-full rounded-full" style={{ width: `${100 - idx * 25}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="text-center text-xs text-muted-foreground py-2 mt-4">
                  <span>9-Stage interactive signal funnel placeholder</span>
                </div>
              </div>
            </GroupContainer>
          </section>
        </div>

        {/* Section 4: Conversations */}
        <section className="space-y-3">
          <SectionHeader>4. Conversations & Direct Messaging</SectionHeader>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Timeline Placeholder */}
            <div className="lg:col-span-2">
              <GroupContainer>
                <ListRow
                  icon={<MessageSquare className="text-primary h-4 w-4" />}
                  label="Direct Messaging Timelines"
                  secondary="Total messages exchanged (excluding system initialization)"
                  trailing={<span className="text-sm font-medium text-muted-foreground font-mono">Real-time Volume</span>}
                  showChevron={false}
                />
                <div className="h-[240px] bg-secondary/30 flex items-center justify-center border-t border-border">
                  <div className="flex flex-col items-center space-y-2 text-center p-4">
                    <ArrowRightLeft className="h-8 w-8 text-muted-foreground/40 animate-pulse" />
                    <span className="text-sm font-medium text-muted-foreground">Direct Message Flow & Conversation Growth Chart</span>
                    <span className="text-xs text-muted-foreground/70">Will display message rates vs. mutual connections</span>
                  </div>
                </div>
              </GroupContainer>
            </div>

            {/* Top Active Users Leaderboard Placeholder */}
            <div>
              <GroupContainer className="h-full flex flex-col">
                <ListRow
                  icon={<Sparkles className="text-primary h-4 w-4" />}
                  label="Top Active Cohort Members"
                  secondary="Strangers interacting the most"
                  showChevron={false}
                />
                <div className="flex-1 border-t border-border p-4 flex flex-col justify-between">
                  <div className="space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-secondary animate-pulse shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="w-24 h-3 bg-secondary rounded animate-pulse" />
                          <div className="w-32 h-2.5 bg-secondary/60 rounded animate-pulse" />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="text-center text-xs text-muted-foreground pt-4 border-t border-border/50 mt-4">
                    <span>Active users leaderboard placeholder</span>
                  </div>
                </div>
              </GroupContainer>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
