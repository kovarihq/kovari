import { NextResponse } from 'next/server';
import { supabaseAdmin } from "@kovari/api";
import { requireAdmin } from '@/admin-lib/adminAuth';
import * as Sentry from '@sentry/nextjs';

export async function GET() {
  try {
    const { adminId, email } = await requireAdmin();
    Sentry.setUser({ id: adminId, email });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    // 1. Basic Counts & Trends
    const { count: totalSignups } = await supabaseAdmin
      .from('waitlist')
      .select('*', { count: 'exact', head: true });

    const { count: signupsLast30Days } = await supabaseAdmin
      .from('waitlist')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', thirtyDaysAgo.toISOString());

    const { count: signupsPrev30Days } = await supabaseAdmin
      .from('waitlist')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', sixtyDaysAgo.toISOString())
      .lt('created_at', thirtyDaysAgo.toISOString());

    const signupTrend = signupsPrev30Days 
      ? Number(((signupsLast30Days || 0) / signupsPrev30Days * 100 - 100).toFixed(1))
      : (signupsLast30Days ? 100 : 0);

    const { count: emailsSent } = await supabaseAdmin
      .from('waitlist')
      .select('*', { count: 'exact', head: true })
      .not('confirmation_email_sent_at', 'is', null);

    // 2. Statistics by Source
    const { data: sourceData } = await supabaseAdmin
      .from('waitlist')
      .select('source');

    const sourceBreakdownRaw: Record<string, number> = {};
    (sourceData as any[])?.forEach((row: any) => {
      const src = row.source || 'unknown';
      sourceBreakdownRaw[src] = (sourceBreakdownRaw[src] || 0) + 1;
    });

    const sourceBreakdown = Object.entries(sourceBreakdownRaw)
      .map(([source, count]) => ({
        source,
        count,
        percentage: totalSignups ? ((count / totalSignups) * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // 3. Growth Timeline (Last 30 days)
    const { data: timelineData } = await supabaseAdmin
      .from('waitlist')
      .select('created_at')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    const dailySignupsRaw: Record<string, number> = {};
    (timelineData as any[])?.forEach((row: any) => {
      const date = new Date(row.created_at).toISOString().split('T')[0];
      dailySignupsRaw[date] = (dailySignupsRaw[date] || 0) + 1;
    });

    // Fill in gaps for the last 30 days
    const dailySignups = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      dailySignups.push({
        date: dateStr,
        count: dailySignupsRaw[dateStr] || 0,
      });
    }

    // 4. Robust Analytics (Views & Clicks)
    const { count: landingViews } = await supabaseAdmin
      .from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_name', 'landing_view');

    const { count: waitlistClicks } = await supabaseAdmin
      .from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_name', 'waitlist_click');

    const conversionRate = landingViews 
      ? ((totalSignups || 0) / landingViews * 100).toFixed(1) 
      : 0;

    // 5. Email Pipeline Analytics
    const pendingEmails = (totalSignups || 0) - (emailsSent || 0);
    
    // Average delay calculation
    const { data: delayData } = await supabaseAdmin
      .from('waitlist')
      .select('created_at, confirmation_email_sent_at')
      .not('confirmation_email_sent_at', 'is', null)
      .limit(100); // Sample last 100 for performance

    let totalDelayMs = 0;
    let delayCount = 0;
    (delayData as any[])?.forEach((row: any) => {
      const created = new Date(row.created_at).getTime();
      const sent = new Date(row.confirmation_email_sent_at).getTime();
      totalDelayMs += (sent - created);
      delayCount++;
    });

    const avgEmailDelayMinutes = delayCount 
      ? Math.round((totalDelayMs / delayCount) / 60000) 
      : 0;

    return NextResponse.json({
      totalSignups: totalSignups || 0,
      emailsSent: emailsSent || 0,
      pendingEmails,
      conversionRate: Number(conversionRate),
      landingViews: landingViews || 0,
      waitlistClicks: waitlistClicks || 0,
      sourceBreakdown,
      dailySignups,
      avgEmailDelayMinutes,
      signupTrend,
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { scope: 'admin-api', route: 'GET /api/admin/waitlist-analytics' },
    });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
