import { requireAdminPage } from '@/admin-lib/adminAuth';
import { supabaseAdmin, redis } from '@kovari/api';
import Link from 'next/link';
import {
  Clock,
  Flag,
  Users,
  TrendingUp,
  Power,
  PowerOff,
  MessageSquare,
  Layers,
} from 'lucide-react';
import { GroupContainer } from '@/components/ui/ios/GroupContainer';
import { ListRow } from '@/components/ui/ios/ListRow';
import { SectionHeader } from '@/components/ui/ios/SectionHeader';
import { DashboardAutoRefresh } from '@/components/DashboardAutoRefresh';
import { BetaInvitePanel } from '@/components/BetaInvitePanel';

interface Metrics {
  sessionsActive: number;
  pendingFlags: number;
  matches24h: number;
}

interface BetaMetrics {
  invitedUsers: number;
  activatedUsers: number;
  activationRate: number;
  feedbackSubmitted: number;
}

interface Settings {
  maintenance_mode: boolean;
}

interface AdminAction {
  id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  reason: string | null;
  created_at: string;
  admins?:
    | {
        email: string;
      }
    | Array<{ email: string }>;
}

async function getMetrics(): Promise<Metrics> {
  let activeSessions = 0;
  let matches24h = 0;
  let pendingFlags = 0;

  try {
    const [{ count: userFlagsCount }, { count: groupFlagsCount }] =
      await Promise.all([
        supabaseAdmin
          .from('user_flags')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabaseAdmin
          .from('group_flags')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending'),
      ]);
    pendingFlags = (userFlagsCount ?? 0) + (groupFlagsCount ?? 0);
  } catch (error) {
    console.error('Error fetching pending flags:', error);
  }

  try {
    if (!redis.isOpen) {
      await redis.connect();
    }
    try {
      const keys = await redis.sMembers('sessions:index');
      if (keys && keys.length > 0) {
        let count = 0;
        for (const rawKey of keys) {
          const key = rawKey.startsWith("session:") ? rawKey : `session:${rawKey}`;
          const exists = await redis.exists(key);
          if (exists) count++;
        }
        activeSessions = count;
      } else {
        const sessionKeys = await redis.keys('session:*');
        activeSessions = sessionKeys.length;
      }
    } catch (e) {
      try {
        const sessionKeys = await redis.keys('session:*');
        activeSessions = sessionKeys.length;
      } catch (e2) {}
    }
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: dbMatchesCount } = await supabaseAdmin
        .from('match_interests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'accepted')
        .gte('created_at', oneDayAgo);
      matches24h = dbMatchesCount ?? 0;
    } catch (e) {
      console.error('Error fetching database matches count:', e);
    }
  } catch (error) {}

  return {
    sessionsActive: activeSessions,
    pendingFlags: pendingFlags,
    matches24h: matches24h,
  };
}

async function getBetaMetrics(): Promise<BetaMetrics> {
  let invitedUsers = 0;
  let activatedUsers = 0;
  let feedbackSubmitted = 0;

  try {
    const { count: invitedCount } = await supabaseAdmin
      .from('waitlist')
      .select('*', { count: 'exact', head: true })
      .in('status', ['beta_invited', 'beta_active']);
    invitedUsers = invitedCount ?? 0;

    const { count: activatedCount } = await supabaseAdmin
      .from('waitlist')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'beta_active');
    activatedUsers = activatedCount ?? 0;

    const { data: feedbackData } = await supabaseAdmin
      .from('feedback')
      .select('user_id');
    
    if (feedbackData) {
      const uniqueUsers = new Set((feedbackData as any[]).map((f: any) => f.user_id).filter(Boolean));
      feedbackSubmitted = uniqueUsers.size;
    }
  } catch (error) {
    console.error('Error fetching beta metrics:', error);
  }

  const activationRate = invitedUsers > 0 ? Math.round((activatedUsers / invitedUsers) * 100) : 0;

  return {
    invitedUsers,
    activatedUsers,
    activationRate,
    feedbackSubmitted,
  };
}

interface BatchStat {
  batch: string;
  count: number;
}

async function getBatchBreakdown(): Promise<BatchStat[]> {
  try {
    const { data } = await supabaseAdmin
      .from('waitlist')
      .select('beta_batch')
      .not('beta_batch', 'is', null)
      .in('status', ['beta_invited', 'beta_active']);

    if (!data) return [];

    const counts: Record<string, number> = {};
    for (const row of data as any[]) {
      const b = row.beta_batch as string;
      counts[b] = (counts[b] || 0) + 1;
    }

    return Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([batch, count]) => ({ batch, count }));
  } catch {
    return [];
  }
}

async function getTotalUsers(): Promise<number> {
  try {
    const { count, error } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('deleted', false);
    if (error) return 0;
    return count ?? 0;
  } catch (error) {
    return 0;
  }
}

async function getSettings(): Promise<Settings> {
  try {
    const { data, error } = await supabaseAdmin
      .from('system_settings')
      .select('key, value')
      .in('key', ['maintenance_mode', 'matching_preset', 'session_ttl_hours']);

    if (error) return { maintenance_mode: false };
    const settingsMap = new Map((data as any[])?.map((item: any) => [item.key, item.value]) || []);
    const maintenanceValue = settingsMap.get('maintenance_mode') as { enabled: boolean } | undefined;
    return { maintenance_mode: maintenanceValue?.enabled ?? false };
  } catch (error) {
    return { maintenance_mode: false };
  }
}

async function getRecentActions(): Promise<AdminAction[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('admin_actions')
      .select(`id, admin_id, target_type, target_id, action, reason, created_at, admins:admin_id (id, email)`)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) return [];
    return (data || []).map((action: any) => ({
      id: action.id,
      action: action.action,
      target_type: action.target_type,
      target_id: action.target_id,
      reason: action.reason,
      created_at: action.created_at,
      admins: Array.isArray(action.admins) && action.admins.length > 0 ? action.admins[0] : action.admins,
    }));
  } catch (error) {
    return [];
  }
}

export default async function DashboardPage() {
  await requireAdminPage();

  const [metrics, totalUsers, settings, recentActions, betaMetrics, batchBreakdown] = await Promise.all([
    getMetrics(),
    getTotalUsers(),
    getSettings(),
    getRecentActions(),
    getBetaMetrics(),
    getBatchBreakdown(),
  ]);

  return (
    <div className="max-w-full mx-auto space-y-6">
      <DashboardAutoRefresh />
      
      <div className="space-y-0">
        <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
        <p className="text-md text-muted-foreground">
          Command center overview and quick actions
        </p>
      </div>

      <div className="space-y-6">
        <section>
          <SectionHeader>System Overview</SectionHeader>
          <GroupContainer>
            <ListRow
              icon={<Clock className="text-primary h-4 w-4" />}
              label="Active Sessions"
              secondary="Currently active user sessions"
              trailing={<span className="text-foreground">{metrics.sessionsActive}</span>}
              showChevron={false}
              className="gap-4"
            />
            <ListRow
              icon={<Flag className="text-primary h-4 w-4" />}
              label="Pending Flags"
              secondary="Flags awaiting review"
              trailing={<span className={metrics.pendingFlags > 0 ? "text-foreground" : "text-foreground"}>{metrics.pendingFlags}</span>}
              showChevron={false}
              className="gap-4"
            />
            <ListRow
              icon={<Users className="text-primary h-4 w-4" />}
              label="Total Users"
              secondary="Registered users in system"
              trailing={<span className="text-foreground">{totalUsers}</span>}
              showChevron={false}
              className="gap-4"
            />
            <ListRow
              icon={<TrendingUp className="text-primary h-4 w-4" />}
              label="Matches (24h)"
              secondary="Matches generated today"
              trailing={<span className="text-foreground">{metrics.matches24h}</span>}
              showChevron={false}
              className="gap-4"
            />
          </GroupContainer>
        </section>

        {/* Closed Beta Analytics */}
        <section>
          <SectionHeader>Closed Beta Analytics</SectionHeader>
          <GroupContainer>
            <ListRow
              icon={<Users className="text-primary h-4 w-4" />}
              label="Invited Users"
              secondary="Total beta invitations sent out"
              trailing={<span className="text-foreground">{betaMetrics.invitedUsers}</span>}
              showChevron={false}
              className="gap-4"
            />
            <ListRow
              icon={<Users className="text-primary h-4 w-4" />}
              label="Activated Users"
              secondary="Users who joined the platform"
              trailing={<span className="text-foreground">{betaMetrics.activatedUsers}</span>}
              showChevron={false}
              className="gap-4"
            />
            <ListRow
              icon={<TrendingUp className="text-primary h-4 w-4" />}
              label="Activation Rate"
              secondary="Percentage of invites activated"
              trailing={<span className="text-foreground">{betaMetrics.activationRate}%</span>}
              showChevron={false}
              className="gap-4"
            />
            <ListRow
              icon={<MessageSquare className="text-primary h-4 w-4" />}
              label="Feedback Submitted"
              secondary="Users who submitted platform feedback"
              trailing={<span className="text-foreground">{betaMetrics.feedbackSubmitted}</span>}
              showChevron={false}
              className="gap-4"
            />
          </GroupContainer>
        </section>

        {/* Invite -> Activation Funnel */}
        <section>
          <SectionHeader>Invite ➔ Activation Funnel</SectionHeader>
          <GroupContainer className="p-6 space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-semibold">
                <span>Invited Users</span>
                <span>{betaMetrics.invitedUsers}</span>
              </div>
              <div className="w-full bg-secondary h-3 rounded-full overflow-hidden">
                <div className="bg-primary h-full rounded-full" style={{ width: '100%' }} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm font-semibold">
                <span>Activated Users</span>
                <span>{betaMetrics.activatedUsers} ({betaMetrics.activationRate}%)</span>
              </div>
              <div className="w-full bg-secondary h-3 rounded-full overflow-hidden">
                <div className="bg-green-500 h-full rounded-full transition-all duration-500" style={{ width: `${betaMetrics.activationRate}%` }} />
              </div>
            </div>
          </GroupContainer>
        </section>

        {/* Beta Cohort Breakdown */}
        {batchBreakdown.length > 0 && (
          <section>
            <SectionHeader>Beta Cohort Breakdown</SectionHeader>
            <GroupContainer>
              {batchBreakdown.map(({ batch, count }) => {
                const maxCount = Math.max(...batchBreakdown.map(b => b.count), 1);
                const pct = Math.round((count / maxCount) * 100);
                const label = batch
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (c) => c.toUpperCase());
                return (
                  <ListRow
                    key={batch}
                    icon={<Layers className="text-primary h-4 w-4" />}
                    label={label}
                    secondary={
                      <div className="flex items-center gap-2 mt-1 w-full">
                        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    }
                    trailing={<span className="text-foreground font-semibold tabular-nums">{count}</span>}
                    showChevron={false}
                    className="gap-4"
                  />
                );
              })}
            </GroupContainer>
          </section>
        )}

        <section>
          <SectionHeader>Quick Actions</SectionHeader>
          <GroupContainer>
            <Link href="/flags" className="block">
              <ListRow
                icon={<Flag className="text-primary h-4 w-4" />}
                label="Review Flags"
                secondary="Manage user and group reports"
                className="gap-4"
              />
            </Link>
            <Link href="/sessions" className="block">
              <ListRow
                icon={<Clock className="text-primary h-4 w-4" />}
                label="Monitor Sessions"
                secondary="Real-time session tracking"
                className="gap-4"
              />
            </Link>
            <Link href="/settings" className="block">
              <ListRow
                icon={settings.maintenance_mode ? <PowerOff className="text-primary h-4 w-4" /> : <Power className="text-primary h-4 w-4" />}
                label="Maintenance Mode"
                secondary={settings.maintenance_mode ? "Maintenance is currently active" : "System is running normally"}
                trailing={
                  <span className={settings.maintenance_mode ? "text-primary font-medium" : "text-primary font-medium"}>
                    {settings.maintenance_mode ? "Active" : "Off"}
                  </span>
                }
                className="gap-4"
              />
            </Link>
          </GroupContainer>
        </section>

        <section>
          <SectionHeader>Beta Access Management</SectionHeader>
          <BetaInvitePanel />
        </section>

        <section>
          <SectionHeader>Recent Admin Actions</SectionHeader>
          <GroupContainer>
            {recentActions.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-[15px]">
                No recent admin actions
              </div>
            ) : (
              recentActions.map((action) => {
                const adminEmail = typeof action.admins === 'object' && action.admins !== null && 'email' in action.admins 
                  ? action.admins.email 
                  : 'Unknown';
                
                return (
                  <ListRow
                    key={action.id}
                    label={action.action}
                    secondary={`${adminEmail} • ${new Date(action.created_at).toLocaleDateString()}`}
                    trailing={
                      <div className="flex flex-col items-end">
                        <span className="text-sm uppercase tracking-wider font-medium text-muted-foreground">{action.target_type}</span>
                        <span className="text-sm text-muted-foreground">{new Date(action.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    }
                    showChevron={false}
                  />
                );
              })
            )}
            {recentActions.length > 0 && (
              <Link href="/audit" className="block">
                <div className="px-4 py-4 text-center border-none hover:bg-secondary transition-colors">
                  <span className="text-sm font-medium text-primary">View All Actions</span>
                </div>
              </Link>
            )}
          </GroupContainer>
        </section>
      </div>
    </div>
  );
}