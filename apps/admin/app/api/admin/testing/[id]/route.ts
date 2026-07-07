import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, redis, ensureRedisConnection } from "@kovari/api";
import { requireAdmin } from "@/admin-lib/adminAuth";
import { logAdminAction } from "@/admin-lib/logAdminAction";
import { TestingResetService } from "@/src/lib/testing/reset.service";
import * as Sentry from "@sentry/nextjs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const targetUserId = resolvedParams.id;

  try {
    const { adminId, email } = await requireAdmin();
    Sentry.setUser({ id: adminId, email: email });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { data: userRow, error } = await supabaseAdmin
      .from("users")
      .select(`
        id,
        name,
        email,
        account_type,
        test_role,
        last_seen_at,
        created_at,
        onboarding_completed,
        profiles(username, profile_photo, age, gender, nationality, job, location, bio)
      `)
      .eq("id", targetUserId)
      .single();

    if (error || !userRow) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user: userRow });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch user" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const targetUserId = resolvedParams.id;
  let adminId = "";
  let adminEmail = "";

  try {
    const authResult = await requireAdmin();
    adminId = authResult.adminId;
    adminEmail = authResult.email;
    Sentry.setUser({ id: adminId, email: adminEmail });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. Rate Limiting Check (max 10 actions per minute per admin)
    try {
      await ensureRedisConnection();
      const rateLimitKey = `rate-limit:admin-testing-reset:${adminId}`;
      const count = await redis.incr(rateLimitKey);
      if (count === 1) {
        await redis.expire(rateLimitKey, 60);
      }
      if (count > 10) {
        return NextResponse.json(
          { error: "Rate limit exceeded. Max 10 actions per minute." },
          { status: 429 }
        );
      }
    } catch (redisErr) {
      console.warn("[Admin Testing API] Redis rate limit check failed, bypassing...", redisErr);
    }

    // 2. Load the target user and ensure they are an INTERNAL user
    const { data: targetUser, error: targetUserError } = await supabaseAdmin
      .from("users")
      .select("id, name, email, account_type, test_role")
      .eq("id", targetUserId)
      .single();

    if (targetUserError || !targetUser) {
      return NextResponse.json({ error: "Target user not found" }, { status: 404 });
    }

    if (targetUser.account_type !== "INTERNAL") {
      return NextResponse.json(
        { error: "Action rejected. Resets can only be run on Internal Test Accounts." },
        { status: 403 }
      );
    }

    // 3. Parse action and reason
    const body = await req.json().catch(() => ({}));
    const { action, reason = "Manual reset from testing control panel" } = body;

    if (!action) {
      return NextResponse.json({ error: "Action is required" }, { status: 400 });
    }

    const testRole = targetUser.test_role || "GENERAL";
    let result;

    switch (action) {
      case "resetProfile":
        result = await TestingResetService.resetProfile(targetUserId, testRole);
        break;
      case "resetOnboarding":
        result = await TestingResetService.resetOnboarding(targetUserId);
        break;
      case "resetChats":
        result = await TestingResetService.resetChats(targetUserId);
        break;
      case "resetMatches":
        result = await TestingResetService.resetMatches(targetUserId);
        break;
      case "resetGroups":
        result = await TestingResetService.resetGroups(targetUserId);
        break;
      case "resetNotifications":
        result = await TestingResetService.resetNotifications(targetUserId);
        break;
      case "resetFollows":
        result = await TestingResetService.resetFollows(targetUserId);
        break;
      case "resetEverything":
        result = await TestingResetService.resetEverything(targetUserId, testRole);
        break;
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    if (!result.success) {
      return NextResponse.json({ error: result.message, details: result.error }, { status: 500 });
    }

    // 4. Log Admin Action
    await logAdminAction({
      adminId,
      targetType: "user",
      targetId: targetUserId,
      action: `TESTING_${action.toUpperCase()}`,
      reason,
      metadata: {
        testRole,
        targetEmail: targetUser.email,
        targetName: targetUser.name
      }
    });

    return NextResponse.json({ success: true, message: result.message });
  } catch (err: any) {
    Sentry.captureException(err);
    return NextResponse.json({ error: err.message || "Failed to execute reset action" }, { status: 500 });
  }
}
