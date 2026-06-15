import { NextResponse } from "next/server";
import { createAdminSupabaseClient, AI } from "@kovari/api";
import { auth } from "@clerk/nextjs/server";
import { createNotification } from "@/lib/notifications/createNotification";
import { NotificationType } from "@kovari/types";
import { createClient } from "@supabase/supabase-js";
import { assertUUID } from "@/lib/validation/uuid";

const { logMatchEvent, createMatchEventLog } = AI.Logging;
const { extractFeaturesForSoloMatch } = AI.FeatureExtraction;
import { getSetting } from "@kovari/utils";

export async function POST(request: Request) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const supabaseAdmin = createAdminSupabaseClient();

    const body = await request.json();
    const { toUserId } = body;
    const destinationId = body.destinationId || "Global";

    // Use authenticated user as sender
    const fromUserId = clerkUserId;

    if (!toUserId || !destinationId) {
      return NextResponse.json(
        { success: false, error: "Missing parameters" },
        { status: 400 }
      );
    }

    // Resolve identifiers to UUIDs if needed
    const resolve = async (identifier: string) => {
      const uuidRegex =
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
      const isUuid = uuidRegex.test(identifier);
      const { data, error } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq(isUuid ? "id" : "clerk_user_id", identifier)
        .eq("isDeleted", false)
        .maybeSingle();
      if (error) throw error;
      return data?.id || null;
    };

    const fromUuid = await resolve(fromUserId);
    const toUuid = await resolve(toUserId);
    if (!fromUuid || !toUuid) {
      return NextResponse.json(
        {
          success: false,
          error: "Could not resolve user identifiers to UUIDs",
        },
        { status: 400 }
      );
    }

    // Prevent duplicate
    const { data: existing } = await supabaseAdmin
      .from("match_interests")
      .select("id")
      .eq("from_user_id", fromUuid)
      .eq("to_user_id", toUuid)
      .eq("destination_id", destinationId)
      .eq("match_type", "solo")
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: true,
        message: "Already expressed interest",
      });
    }

    const { data, error } = await supabaseAdmin
      .from("match_interests")
      .insert([
        {
          from_user_id: fromUuid,
          to_user_id: toUuid,
          destination_id: destinationId,
          match_type: "solo",
          status: "pending",
        },
      ])
      .select("id")
      .single();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message || error },
        { status: 500 }
      );
    }

    // Get from user's name for notification
    const { data: fromUserProfile } = await supabaseAdmin
      .from("profiles")
      .select("name")
      .eq("user_id", fromUuid)
      .single();

    const { data: destinationData } = await supabaseAdmin
      .from("destinations")
      .select("name")
      .eq("id", destinationId)
      .single();

    const fromUserName = fromUserProfile?.name || "Someone";
    const destinationName = destinationData?.name || "your destination";

    // Create notification for the recipient
    await createNotification({
      userId: toUuid,
      type: NotificationType.MATCH_INTEREST_RECEIVED,
      title: "Match interest",
      message: `${fromUserName} is interested in traveling with you to ${destinationName}`,
      entityType: "match",
      entityId: fromUuid,
    });

    // Check reverse interest and create match if mutual
    // First check all interests between these two users (both directions)
    try {
      assertUUID(fromUuid, "fromUuid");
      assertUUID(toUuid, "toUuid");
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e.message }, { status: 400 });
    }

    const { data: allInterestsBetween } = await supabaseAdmin
      .from("match_interests")
      .select(
        "id, status, destination_id, match_type, from_user_id, to_user_id"
      )
      .or(
        `and(from_user_id.eq.${fromUuid},to_user_id.eq.${toUuid}),and(from_user_id.eq.${toUuid},to_user_id.eq.${fromUuid})`
      )
      .eq("match_type", "solo");

    console.log("[matching/interest] All interests between users:", {
      fromUuid,
      toUuid,
      count: allInterestsBetween?.length || 0,
      data: allInterestsBetween,
    });

    // Check all interests from toUuid to fromUuid (any status, any destination)
    const { data: allReverseInterests } = await supabaseAdmin
      .from("match_interests")
      .select("id, status, destination_id, match_type")
      .eq("from_user_id", toUuid)
      .eq("to_user_id", fromUuid)
      .eq("match_type", "solo");

    console.log(
      "[matching/interest] All reverse interests (any status, any destination):",
      {
        found: !!allReverseInterests && allReverseInterests.length > 0,
        count: allReverseInterests?.length || 0,
        data: allReverseInterests,
      }
    );

    // Now check with exact destination and pending status
    const { data: reverse } = await supabaseAdmin
      .from("match_interests")
      .select("id, status")
      .eq("from_user_id", toUuid)
      .eq("to_user_id", fromUuid)
      .eq("destination_id", destinationId)
      .eq("match_type", "solo")
      .eq("status", "pending")
      .maybeSingle();

    console.log("[matching/interest] Reverse interest check (exact match):", {
      found: !!reverse,
      reverseStatus: reverse?.status,
      fromUuid,
      toUuid,
      destinationId,
      destinationIdType: typeof destinationId,
    });

    // Log ML event for interest creation (positive engagement)
    try {
      // Get Clerk IDs for both users
      const { data: fromUser } = await supabaseAdmin
        .from("users")
        .select("clerk_user_id")
        .eq("id", fromUuid)
        .single();
      
      const { data: toUser } = await supabaseAdmin
        .from("users")
        .select("clerk_user_id")
        .eq("id", toUuid)
        .single();

      if (fromUser?.clerk_user_id && toUser?.clerk_user_id) {
        // Get matching preset for logging
        const presetSetting = await getSetting("matching_preset");
        const presetMode = (presetSetting as { mode: string } | null)?.mode || "balanced";

        const features = await extractFeaturesForSoloMatch(
          fromUser.clerk_user_id, // Current user (showing interest)
          toUser.clerk_user_id,    // Target user
          destinationId
        );

        if (features) {
          // Log as "accept" since showing interest is positive engagement
          logMatchEvent(
            createMatchEventLog(
              "user_user",
              features,
              "accept",
              presetMode.toLowerCase()
            )
          );
        }
      }
    } catch (logError) {
      // Don't fail the interest creation if logging fails
      console.error("Error logging interest event:", logError);
    }

    if (reverse) {
      console.log(
        "[matching/interest] Mutual interest found! Creating match..."
      );
      // Update both to accepted
      await supabaseAdmin
        .from("match_interests")
        .update({ status: "accepted" })
        .eq("from_user_id", fromUuid)
        .eq("to_user_id", toUuid)
        .eq("destination_id", destinationId)
        .eq("match_type", "solo");

      await supabaseAdmin
        .from("match_interests")
        .update({ status: "accepted" })
        .eq("from_user_id", toUuid)
        .eq("to_user_id", fromUuid)
        .eq("destination_id", destinationId)
        .eq("match_type", "solo");

      const userA = fromUuid < toUuid ? fromUuid : toUuid;
      const userB = fromUuid < toUuid ? toUuid : fromUuid;

      const { data: matchData, error: matchError } = await supabaseAdmin
        .from("matches")
        .insert([
          {
            user_a_id: userA,
            user_b_id: userB,
            destination_id: destinationId,
            match_type: "solo",
            status: "active",
          },
        ])
        .select("id")
        .single();

      if (matchError) {
        console.error("[matching/interest] Error creating match:", matchError);
      } else {
        console.log(
          "[matching/interest] Match created successfully:",
          matchData?.id
        );
      }

      // Get user names for match notifications
      const { data: userAProfile } = await supabaseAdmin
        .from("profiles")
        .select("name")
        .eq("user_id", userA)
        .single();

      const { data: userBProfile } = await supabaseAdmin
        .from("profiles")
        .select("name")
        .eq("user_id", userB)
        .single();

      const userAName = userAProfile?.name || "Someone";
      const userBName = userBProfile?.name || "Someone";

      // Notify both users about the match
      if (matchData) {
        console.log("[matching/interest] Creating match notifications:", {
          matchId: matchData.id,
          userA,
          userB,
          userAName,
          userBName,
        });

        const notifA = await createNotification({
          userId: userA,
          type: NotificationType.MATCH_ACCEPTED,
          title: "It's a match!",
          message: `You matched with ${userBName}. Start a conversation.`,
          entityType: "match",
          entityId: userB,
        });

        const notifB = await createNotification({
          userId: userB,
          type: NotificationType.MATCH_ACCEPTED,
          title: "It's a match!",
          message: `You matched with ${userAName}. Start a conversation.`,
          entityType: "match",
          entityId: userA,
        });

        console.log("[matching/interest] Notification results:", {
          notifA,
          notifB,
        });

        if (!notifA.success || !notifB.success) {
          console.error("[matching/interest] Failed to create notifications:", {
            notifAError: notifA.error,
            notifBError: notifB.error,
          });
        }
      } else {
        console.error(
          "[matching/interest] No matchData available for notifications"
        );
      }
    }

    return NextResponse.json({ success: true, interestId: data?.id });
  } catch (err: any) {
    console.error("/api/matching/interest error:", err);
    return NextResponse.json(
      { success: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}


