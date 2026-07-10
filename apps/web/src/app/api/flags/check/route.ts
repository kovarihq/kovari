import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@kovari/api";
import { getAuthenticatedUser } from "@/lib/auth/get-user";

/**
 * GET /api/flags/check
 * Public endpoint for checking if a user has an active report against a target.
 *
 * Query Parameters:
 * ?targetType=user|group
 * &targetId=uuid
 */
export async function GET(req: NextRequest) {
  try {
    // Validate authentication using unified mobile-safe helper
    const authUser = await getAuthenticatedUser(req);

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const targetType = searchParams.get("targetType");
    const targetId = searchParams.get("targetId");

    if (!targetType || !targetId) {
      return NextResponse.json(
        { error: "Missing required fields: targetType, targetId" },
        { status: 400 }
      );
    }

    if (targetType !== "user" && targetType !== "group") {
      return NextResponse.json(
        { error: "targetType must be 'user' or 'group'" },
        { status: 400 }
      );
    }

    const reporterId = authUser.id;
    let hasActiveReport = false;
    const supabase = createAdminSupabaseClient();

    // Check if an active report exists
    if (targetType === "user") {
      const { data, error } = await supabase
        .from("user_flags")
        .select("id")
        .eq("reporter_id", reporterId)
        .eq("user_id", targetId)
        .neq("status", "dismissed")
        .maybeSingle();

      if (!error && data) {
        hasActiveReport = true;
      }
    } else {
      const { data, error } = await supabase
        .from("group_flags")
        .select("id")
        .eq("reporter_id", reporterId)
        .eq("group_id", targetId)
        .neq("status", "dismissed")
        .maybeSingle();

      if (!error && data) {
        hasActiveReport = true;
      }
    }

    return NextResponse.json({ hasActiveReport });
  } catch (error) {
    console.error("Error in GET /api/flags/check:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}


