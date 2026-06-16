// apps/admin/app/api/admin/users/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@kovari/api";
import { requireAdmin } from "@/admin-lib/adminAuth";
import * as Sentry from "@sentry/nextjs";
import { incrementErrorCounter } from "@/admin-lib/incrementErrorCounter";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { adminId, email } = await requireAdmin();
    Sentry.setUser({
      id: adminId,
      email: email,
    });
  } catch (error) {
    // requireAdmin throws NextResponse for unauthorized/forbidden
    if (error instanceof NextResponse) {
      return error;
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const profileId = id;

    // Get profile + banned state
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select(
        `
        id,
        user_id,
        name,
        email,
        age,
        gender,
        nationality,
        bio,
        languages,
        profile_photo,
        verified,
        deleted,
        smoking,
        drinking,
        religion,
        personality,
        interests,
        users!profiles_user_id_fkey(
          banned,
          ban_reason,
          ban_expires_at,
          beta_status,
          invite_date,
          activation_date
        )
      `
      )
      .eq("id", profileId)
      .maybeSingle();

    if (profileError) {
      console.error("Error fetching profile:", profileError);
      return NextResponse.json(
        { error: "Failed to fetch user" },
        { status: 500 }
      );
    }

    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch feedback count for the user
    let feedbackCount = 0;
    if (profile.user_id) {
      const { count } = await supabaseAdmin
        .from("feedback")
        .select("*", { count: "exact", head: true })
        .eq("user_id", profile.user_id);
      feedbackCount = count || 0;
    }

    // Fetch flags
    const { data: flags, error: flagsError } = await supabaseAdmin
      .from("user_flags")
      .select("*")
      .eq("user_id", profile.user_id)
      .order("created_at", { ascending: false });

    if (flagsError) {
      console.error("Error fetching user flags:", flagsError);
    }

    // Fetch user sessions from Redis
    const sessions: unknown[] = [];
    try {
      const { redis, ensureRedisConnection } = await import("@kovari/api");
      await ensureRedisConnection();
      // Test Redis connection
      try {
        await redis.ping();
      } catch (pingErr) {
        console.error("Redis ping failed:", pingErr);
      }

      // Try to find sessions for this user
      // Sessions might be stored as session:${clerk_user_id} or session:user:${user_id}
      // We need to get clerk_user_id from users table first
      const { data: userData } = await supabaseAdmin
        .from("users")
        .select("clerk_user_id")
        .eq("id", profile.user_id)
        .maybeSingle();

      if (userData?.clerk_user_id) {
        const sessionKeys = [
          `session:${userData.clerk_user_id}`,
          `session:user:${profile.user_id}`,
        ];

        for (const key of sessionKeys) {
          try {
            const sessionData = await redis.get(key);
            if (sessionData) {
              sessions.push({
                key,
                data: JSON.parse(sessionData),
              });
            }
          } catch (e) {
            // Session not found or invalid, continue
          }
        }
      }
    } catch (e) {
      console.error("Error fetching user sessions:", e);
    }

    return NextResponse.json({
      profile,
      flags: flags ?? [],
      sessions,
      feedback_count: feedbackCount,
    });
  } catch (error) {
    await incrementErrorCounter();
    Sentry.captureException(error, {
      tags: {
        scope: "admin-api",
        route: "GET /api/admin/users/[id]",
      },
    });
    throw error;
  }
}
