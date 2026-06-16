"use client";

import { useEffect, useState } from "react";
import { 
  Users, 
  Mail, 
  TrendingUp,
  RefreshCwIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GroupContainer } from "@/components/ui/ios/GroupContainer";
import { ListRow } from "@/components/ui/ios/ListRow";
import { SectionHeader } from "@/components/ui/ios/SectionHeader";
import { GrowthChart } from "@/components/admin/GrowthChart";
import { SourceBreakdown } from "@/components/admin/SourceBreakdown";
import { Funnel } from "@/components/admin/Funnel";
import { EmailHealth } from "@/components/admin/EmailHealth";
import { toast } from "sonner";
import { useLoading } from "@/components/AdminLayoutWrapper";

interface AnalyticsData {
  totalSignups: number;
  emailsSent: number;
  pendingEmails: number;
  conversionRate: number;
  landingViews: number;
  waitlistClicks: number;
  signupTrend: number;
  sourceBreakdown: { source: string; count: number; percentage: string | number }[];
  dailySignups: { date: string; count: number }[];
  avgEmailDelayMinutes: number;
}

export default function WaitlistDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { setIsLoading } = useLoading();

  const fetchAnalytics = async (isInitial = false) => {
    if (isInitial) setIsLoading(true);
    setIsRefreshing(true);
    try {
      const response = await fetch("/api/admin/waitlist-analytics");
      if (!response.ok) throw new Error("Failed to fetch analytics");
      const result = await response.json();
      setData(result);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load waitlist analytics");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAnalytics(true);
  }, []);

  if (!data) return null;

  return (
    <div className="max-w-full space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
        <div className="">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">Waitlist Analytics</h1>
          <p className="text-md text-muted-foreground">Monitor growth and email pipeline health</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => fetchAnalytics(false)}
          disabled={isRefreshing}
          className="bg-card border-border disabled:opacity-100 rounded-lg h-9 gap-2.5 shadow-none"
        >
          <RefreshCwIcon className={cn("h-4 w-4 text-primary", isRefreshing && "animate-spin")} />
          <span className="font-medium">{isRefreshing ? "Refreshing" : "Refresh"}</span>
        </Button>
      </div>

      <div className="space-y-6">
        {/* KPI Section */}
        <section>
          <SectionHeader className="">Performance Metrics</SectionHeader>
          <GroupContainer>
            <ListRow
              icon={<div className="rounded-xl"><Users className="h-4 w-4 text-primary" /></div>}
              label="Total Signups"
              secondary={`${data.signupTrend >= 0 ? "+" : "-"}${Math.abs(data.signupTrend)}% vs last 30 days`}
              trailing={<span className="text-foreground">{data.totalSignups.toLocaleString()}</span>}
              showChevron={false}
              className="gap-4"
            />
            <ListRow
              icon={<div className="rounded-xl"><TrendingUp className="h-4 w-4 text-primary" /></div>}
              label="Conversion Rate"
              secondary="Landing views to signup ratio"
              trailing={<span className="text-foreground">{data.conversionRate}%</span>}
              showChevron={false}
              className="gap-4"
            />
            <ListRow
              icon={<div className="rounded-xl"><Mail className="h-4 w-4 text-primary" /></div>}
              label="Email Success"
              secondary="Confirmation delivery rate"
              trailing={<span className="text-foreground">{Math.round((data.emailsSent / (data.totalSignups || 1)) * 100)}%</span>}
              showChevron={false}
              className="gap-4"
            />
            <ListRow
              icon={<div className="rounded-xl"><RefreshCwIcon className="h-4 w-4 text-primary" /></div>}
              label="Avg. Pipeline Delay"
              secondary="Creation to delivery time"
              trailing={<span className="text-foreground">{data.avgEmailDelayMinutes}m</span>}
              showChevron={false}
              className="gap-4"
            />
          </GroupContainer>
        </section>

        {/* Growth & Funnel Row */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-3">
            <SectionHeader className="">Growth Trend</SectionHeader>
            <div className="rounded-xl border border-border bg-card overflow-hidden p-6 h-[400px] transition-all">
              <GrowthChart data={data.dailySignups} />
            </div>
          </div>
          <div className="md:col-span-2">
            <SectionHeader className="">Conversion Funnel</SectionHeader>
            <div className="rounded-xl border border-border bg-card overflow-hidden p-2 h-full md:h-[400px] transition-all flex flex-col justify-center">
              <Funnel data={{
                views: data.landingViews,
                clicks: data.waitlistClicks,
                submissions: data.totalSignups,
              }} />
            </div>
          </div>
        </div>

        {/* Sources & Health Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <section>
            <SectionHeader className="mt-4 md:mt-0">Traffic Sources</SectionHeader>
            <div className="rounded-lg border border-border bg-card overflow-hidden transition-all h-full md:h-[220px]">
              <SourceBreakdown data={data.sourceBreakdown} />
            </div>
          </section>
          <section className="mt-10 md:mt-0">
            <SectionHeader className="">Pipeline Health</SectionHeader>
            <div className="rounded-lg border border-border bg-card overflow-hidden transition-all h-full md:h-[220px]">
              <EmailHealth 
                sent={data.emailsSent} 
                pending={data.pendingEmails} 
                avgDelayMinutes={data.avgEmailDelayMinutes} 
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
