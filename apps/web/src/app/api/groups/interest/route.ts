import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth/resolveUser";
import { createClient } from "@supabase/supabase-js";
import { invalidateMatchingCache } from "@/lib/api/matching/cache";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

export async function POST(request: NextRequest) {
  try {
    const authResult = await resolveUser(request, { mode: 'protected' });
    if (!authResult.ok || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userUuid = authResult.user.userId;

    const body = await request.json();
    const { toGroupId } = body;
    const destinationId = body.destinationId || "Global";

    if (!toGroupId || !destinationId) {
      console.error("Group Interest API: Missing parameters", {
        userUuid,
        toGroupId,
        destinationId,
      });
      return NextResponse.json(
        { success: false, error: "Missing parameters" },
        { status: 400 }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
      console.error("Group Interest API: Missing Supabase environment variables");
      return NextResponse.json(
        { success: false, error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Group ID should already be a UUID
    const groupId = toGroupId;

    // Check for existing membership or request
    const { data: existing } = await supabaseAdmin
      .from("group_memberships")
      .select("id, status")
      .eq("user_id", userUuid)
      .eq("group_id", groupId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: true,
        message: existing.status === 'pending_request' 
          ? "Join request already sent" 
          : "Already a member or requested",
        membershipId: existing.id,
        status: existing.status
      });
    }

    // Insert into group_memberships
    const { data: membershipData, error: membershipError } = await supabaseAdmin
      .from("group_memberships")
      .insert([
        {
          user_id: userUuid,
          group_id: groupId,
          status: "pending_request",
          role: "member"
        },
      ])
      .select("id")
      .single();

    if (membershipError) {
      console.error("Group Interest API: Database insert error (group_memberships)", {
        message: membershipError.message,
        code: membershipError.code,
        details: membershipError.details,
        hint: membershipError.hint,
      });
      return NextResponse.json(
        { success: false, error: membershipError.message || String(membershipError) },
        { status: 500 }
      );
    }

    // Also record in match_interests for compatibility/history
    const { data: interestData, error: interestError } = await supabaseAdmin
      .from("match_interests")
      .upsert([
        {
          from_user_id: userUuid,
          to_user_id: groupId, // For groups, to_user_id stores the group ID
          destination_id: destinationId,
          match_type: "group",
          status: "pending",
        },
      ], { onConflict: "from_user_id,to_user_id,destination_id,match_type", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();

    if (interestError) {
      // Don't fail the request if just the interest log fails, but log it
      console.warn("Group Interest API: match_interests insert failed (non-critical)", {
        error: interestError
      });
    }

    // Send notification to group creator
    try {
      const { data: groupData } = await supabaseAdmin
        .from("groups")
        .select("creator_id, name")
        .eq("id", groupId)
        .single();

      if (groupData && groupData.creator_id && groupData.creator_id !== userUuid) {
        // Dynamically import notification helpers
        const { createNotification } = await import(
          "@/lib/notifications/createNotification"
        );
        const { NotificationType } = await import(
          "@kovari/types"
        );
        
        // Get user name for the notification message
        const { data: userData } = await supabaseAdmin
          .from("profiles")
          .select("name")
          .eq("user_id", userUuid)
          .single();
          
        const userName = userData?.name || "Someone";

        await createNotification({
          userId: groupData.creator_id,
          type: NotificationType.GROUP_JOIN_REQUEST_RECEIVED,
          title: "Join Request",
          message: `${userName} wants to join ${groupData.name || "your group"}`,
          entityType: "group",
          entityId: groupId,
        });
      }
    } catch (notifyError) {
      console.error("Group Interest API: Failed to send notification", notifyError);
      // Don't fail the request
    }

    // Invalidate matching cache for the user expressing interest in the group
    await invalidateMatchingCache(userUuid);

    return NextResponse.json({
      success: true,
      membershipId: membershipData?.id,
      interestId: interestData?.id
    });
  } catch (error: any) {
    console.error("Group Interest API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to create group interest",
      },
      { status: 500 }
    );
  }
}

