// src/app/api/flags/route.ts
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createAdminSupabaseClient } from "@kovari/api";
import { sendSecurityAlert } from "@/lib/alerts/security";

import { getAuthenticatedUser } from "@/lib/auth/get-user";

/**
 * POST /api/flags
 * Public endpoint for creating flags (reports)
 *
 * Payload:
 * {
 *   "targetType": "user" | "group",
 *   "targetId": "uuid",
 *   "reason": "Harassment / fake profile / unsafe behavior",
 *   "evidenceUrl": "https://cloudinary/..." (optional)
 * }
 */
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "production") {
    console.log("=== FLAG API CALLED ===");
    console.log("Timestamp:", new Date().toISOString());
  }

  try {
    // Validate authentication using unified mobile-safe helper
    const authUser = await getAuthenticatedUser(req);

    if (!authUser) {
      console.error("❌ Unauthorized - no valid user session");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    if (process.env.NODE_ENV !== "production") {
      console.log("Request body:", JSON.stringify(body, null, 2));
    }
    const { targetType, targetId, reason, evidenceUrl, evidencePublicId } =
      body;

    // Normalize evidenceUrl: convert undefined, empty string, or whitespace to null
    const normalizedEvidenceUrl =
      evidenceUrl && typeof evidenceUrl === "string" && evidenceUrl.trim()
        ? evidenceUrl.trim()
        : null;

    if (process.env.NODE_ENV !== "production") {
      console.log("Parsed values:");
      console.log("- targetType:", targetType);
      console.log("- targetId:", targetId);
      console.log("- reason:", reason);
      console.log("- evidenceUrl (raw):", evidenceUrl);
      console.log("- evidenceUrl (normalized):", normalizedEvidenceUrl);
      console.log("- evidencePublicId:", evidencePublicId);
    }

    // Validate required fields
    if (!targetType || !targetId || !reason) {
      return NextResponse.json(
        { error: "Missing required fields: targetType, targetId, reason" },
        { status: 400 }
      );
    }

    // Validate targetType
    if (targetType !== "user" && targetType !== "group") {
      return NextResponse.json(
        { error: "targetType must be 'user' or 'group'" },
        { status: 400 }
      );
    }

    // Validate reason
    if (!reason.trim()) {
      return NextResponse.json(
        { error: "Reason cannot be empty" },
        { status: 400 }
      );
    }

    // Create Supabase client
    const supabase = createAdminSupabaseClient();
    const reporterId = authUser.id;

    // PHASE 7: Prevent self-reporting
    if (targetType === "user" && targetId === reporterId) {
      return NextResponse.json(
        { error: "Cannot report yourself" },
        { status: 400 }
      );
    }

    // PHASE 7: Rate limiting - Check if user has exceeded daily limit (3 flags/day)
    // Count flags from both user_flags and group_flags tables
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStartISO = todayStart.toISOString();

    // Count user flags
    const { count: userFlagCount, error: userRateLimitError } = await supabase
      .from("user_flags")
      .select("*", { count: "exact", head: true })
      .eq("reporter_id", reporterId)
      .gte("created_at", todayStartISO);

    // Count group flags
    const { count: groupFlagCount, error: groupRateLimitError } = await supabase
      .from("group_flags")
      .select("*", { count: "exact", head: true })
      .eq("reporter_id", reporterId)
      .gte("created_at", todayStartISO);

    const todayFlagCount = (userFlagCount || 0) + (groupFlagCount || 0);

    if (userRateLimitError || groupRateLimitError) {
      console.error(
        "Error checking rate limit:",
        userRateLimitError || groupRateLimitError
      );
    } else if (todayFlagCount >= 3) {
      await sendSecurityAlert({
        event: "Report Rate Limit Exceeded",
        severity: "medium",
        userId: reporterId,
        details: { count: todayFlagCount, targetId, targetType }
      });
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          details:
            "You have reached the daily limit of 3 reports. Please try again tomorrow.",
          limit: 3,
          remaining: 0,
        },
        { status: 429 }
      );
    }

    // Validate target exists and prevent self-reporting for groups
    if (targetType === "user") {
      const { data: targetUser, error: targetError } = await supabase
        .from("users")
        .select("id")
        .eq("id", targetId)
        .single();

      if (targetError || !targetUser) {
        return NextResponse.json(
          { error: "Target user not found" },
          { status: 404 }
        );
      }
    } else if (targetType === "group") {
      const { data: targetGroup, error: targetError } = await supabase
        .from("groups")
        .select("id, creator_id")
        .eq("id", targetId)
        .single();

      if (targetError || !targetGroup) {
        return NextResponse.json(
          { error: "Target group not found" },
          { status: 404 }
        );
      }

      // Prevent group creators from reporting their own groups
      if (targetGroup.creator_id === reporterId) {
        return NextResponse.json(
          { error: "Cannot report your own group" },
          { status: 400 }
        );
      }
    }

    // PHASE 7: Check for duplicate flag (same reporter, same target)
    // 1 report per entity, but allow re-report ONLY if previous is dismissed
    console.log("=== DUPLICATE CHECK ===");
    console.log("Checking for open/active flags for");
    console.log("Reporter ID:", reporterId);
    console.log("Target ID:", targetId);

    if (targetType === "user") {
      const { data: existingFlag, error: duplicateCheckError } = await supabase
        .from("user_flags")
        .select("id, created_at, status")
        .eq("user_id", targetId)
        .eq("reporter_id", reporterId)
        .neq("status", "dismissed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log("Duplicate check result:");
      console.log("- Existing flag:", existingFlag);
      console.log("- Check error:", duplicateCheckError);

      if (existingFlag) {
        console.log(
          "⚠️ DUPLICATE FOUND: User has an active report for this user"
        );
        console.log("Existing flag ID:", existingFlag.id);
        console.log("Existing flag created_at:", existingFlag.created_at);
        console.log("Existing flag status:", existingFlag.status);

        return NextResponse.json(
          {
            error: "You have already reported this user",
            details: `You have an active report for this user. You can only report again if your previous report is dismissed.`,
            existingFlagId: existingFlag.id,
          },
          { status: 429 }
        );
      }

      console.log("✅ No duplicate found - proceeding with insert");
    } else {
      // For groups, check group_flags table for duplicates
      const { data: existingFlag, error: duplicateCheckError } = await supabase
        .from("group_flags")
        .select("id, created_at, status")
        .eq("group_id", targetId)
        .eq("reporter_id", reporterId)
        .neq("status", "dismissed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      console.log("Duplicate check result for group:");
      console.log("- Existing flag:", existingFlag);
      console.log("- Check error:", duplicateCheckError);

      if (existingFlag) {
        console.log(
          "⚠️ DUPLICATE FOUND: User has an active report for this group"
        );
        console.log("Existing flag ID:", existingFlag.id);
        console.log("Existing flag created_at:", existingFlag.created_at);
        console.log("Existing flag status:", existingFlag.status);

        return NextResponse.json(
          {
            error: "You have already reported this group",
            details: `You have an active report for this group. You can only report again if your previous report is dismissed.`,
            existingFlagId: existingFlag.id,
          },
          { status: 429 }
        );
      }

      console.log("✅ No duplicate found - proceeding with insert");
    }

    // Insert flag into appropriate table based on target type
    let flagResult;
    if (targetType === "user") {
      // Insert into user_flags with user_id (matches schema)
      // Schema: user_id (NOT NULL), reporter_id (nullable), type (nullable), reason (nullable), evidence_url (nullable), evidence_public_id (nullable), status (NOT NULL, default 'pending')
      const insertPayload = {
        user_id: targetId,
        reporter_id: reporterId,
        reason: reason.trim(),
        evidence_url: normalizedEvidenceUrl,
        evidence_public_id: evidencePublicId || null,
        type: "user", // Optional but useful for filtering
        status: "pending", // Explicitly set (though it has a default)
      };

      console.log("=== FLAG INSERT DEBUG ===");
      console.log(
        "Inserting user flag with payload:",
        JSON.stringify(insertPayload, null, 2)
      );
      console.log("Reporter ID:", reporterId);
      console.log("Target ID:", targetId);
      console.log("Evidence URL:", evidenceUrl);
      console.log("Evidence Public ID:", evidencePublicId);

      const { data, error: insertError } = await supabase
        .from("user_flags")
        .insert(insertPayload)
        .select("id")
        .single();

      console.log("=== INSERT RESULT ===");
      console.log("Data:", data);
      console.log("Error:", insertError);
      console.log("Error code:", insertError?.code);
      console.log("Error message:", insertError?.message);
      console.log("Error details:", JSON.stringify(insertError, null, 2));

      if (insertError) {
        console.error("❌ ERROR creating user flag:", insertError);
        console.error("Insert payload:", insertPayload);
        console.error("Full error:", JSON.stringify(insertError, null, 2));

        // Check for specific error types
        if (insertError.code === "23503") {
          // Foreign key violation - user_id doesn't exist
          return NextResponse.json(
            {
              error: "Failed to create flag",
              details: "The reported user does not exist in the database",
              code: insertError.code,
            },
            { status: 404 }
          );
        }

        if (insertError.code === "42501") {
          // Permission denied - RLS policy blocking
          return NextResponse.json(
            {
              error: "Failed to create flag",
              details:
                "Permission denied. Please check Row Level Security policies.",
              code: insertError.code,
              hint: "RLS policy may be blocking the insert. Check Supabase dashboard.",
            },
            { status: 403 }
          );
        }

        return NextResponse.json(
          {
            error: "Failed to create flag",
            details: insertError.message || "Database error occurred",
            code: insertError.code,
            hint: insertError.hint,
          },
          { status: 500 }
        );
      }

      flagResult = data;
      console.log("✅ SUCCESS: User flag created successfully!");
      console.log("Flag ID:", flagResult.id);
      console.log("Flag data:", JSON.stringify(flagResult, null, 2));

      // Create notification for reporter
      if (reporterId) {
        try {
          const { createNotification } = await import(
            "@/lib/notifications/createNotification"
          );
          const { NotificationType } = await import(
            "@kovari/types"
          );

          await createNotification({
            userId: reporterId,
            type: NotificationType.REPORT_SUBMITTED,
            title: "Report received",
            message: "Thanks for reporting. Our team will review this shortly.",
            entityType: undefined,
            entityId: undefined,
          });
        } catch (notifError) {
          // Don't fail the report if notification fails
          console.error("Error creating report notification:", notifError);
        }
      }

      // Verify the insert actually happened by querying the database
      const { data: verifyData, error: verifyError } = await supabase
        .from("user_flags")
        .select("*")
        .eq("id", flagResult.id)
        .single();

      if (verifyError) {
        console.error(
          "⚠️ WARNING: Could not verify flag was inserted:",
          verifyError
        );
      } else {
        console.log(
          "✅ VERIFIED: Flag exists in database:",
          JSON.stringify(verifyData, null, 2)
        );
      }
    } else {
      // Insert into group_flags table
      // Schema: group_id (nullable), reporter_id (nullable), reason (nullable),
      // evidence_url (nullable), evidence_public_id (nullable), status (default 'pending')
      // Handle evidencePublicId: convert empty strings and undefined to null
      const finalEvidencePublicId =
        evidencePublicId &&
        typeof evidencePublicId === "string" &&
        evidencePublicId.trim()
          ? evidencePublicId.trim()
          : null;

      // Use normalized evidenceUrl from request parsing
      const insertPayload = {
        group_id: targetId,
        reporter_id: reporterId,
        reason: reason.trim(),
        evidence_url: normalizedEvidenceUrl,
        evidence_public_id: finalEvidencePublicId,
        status: "pending", // Explicitly set (though it has a default)
      };

      console.log("=== GROUP FLAG INSERT DEBUG ===");
      console.log(
        "Inserting group flag with payload:",
        JSON.stringify(insertPayload, null, 2)
      );
      console.log("Reporter ID:", reporterId);
      console.log("Target ID:", targetId);
      console.log("Evidence URL:", normalizedEvidenceUrl);
      console.log("Evidence Public ID:", finalEvidencePublicId);
      console.log("Evidence Public ID:", finalEvidencePublicId);

      const { data, error: insertError } = await supabase
        .from("group_flags")
        .insert(insertPayload)
        .select("id")
        .single();

      console.log("=== INSERT RESULT ===");
      console.log("Data:", data);
      console.log("Error:", insertError);
      console.log("Error code:", insertError?.code);
      console.log("Error message:", insertError?.message);
      console.log("Error details:", JSON.stringify(insertError, null, 2));

      if (insertError) {
        console.error("❌ ERROR creating group flag:", insertError);
        console.error("Insert payload:", insertPayload);
        console.error("Full error:", JSON.stringify(insertError, null, 2));

        // Check for specific error types
        if (insertError.code === "23503") {
          // Foreign key violation - group_id doesn't exist
          return NextResponse.json(
            {
              error: "Failed to create flag",
              details: "The reported group does not exist in the database",
              code: insertError.code,
            },
            { status: 404 }
          );
        }

        if (insertError.code === "42501") {
          // Permission denied - RLS policy blocking
          return NextResponse.json(
            {
              error: "Failed to create flag",
              details:
                "Permission denied. Please check Row Level Security policies.",
              code: insertError.code,
              hint: "RLS policy may be blocking the insert. Check Supabase dashboard.",
            },
            { status: 403 }
          );
        }

        return NextResponse.json(
          {
            error: "Failed to create flag",
            details: insertError.message || "Database error occurred",
            code: insertError.code,
            hint: insertError.hint,
          },
          { status: 500 }
        );
      }

      flagResult = data;
      console.log("✅ SUCCESS: Group flag created successfully!");
      console.log("Flag ID:", flagResult.id);
      console.log("Flag data:", JSON.stringify(flagResult, null, 2));

      // Create notification for reporter
      if (reporterId) {
        try {
          const { createNotification } = await import(
            "@/lib/notifications/createNotification"
          );
          const { NotificationType } = await import(
            "@kovari/types"
          );

          await createNotification({
            userId: reporterId,
            type: NotificationType.REPORT_SUBMITTED,
            title: "Report received",
            message: "Thanks for reporting. Our team will review this shortly.",
            entityType: undefined,
            entityId: undefined,
          });
        } catch (notifError) {
          // Don't fail the report if notification fails
          console.error("Error creating report notification:", notifError);
        }
      }

      // Verify the insert actually happened by querying the database
      const { data: verifyData, error: verifyError } = await supabase
        .from("group_flags")
        .select("*")
        .eq("id", flagResult.id)
        .single();

      if (verifyError) {
        console.error(
          "⚠️ WARNING: Could not verify flag was inserted:",
          verifyError
        );
      } else {
        console.log(
          "✅ VERIFIED: Flag exists in database:",
          JSON.stringify(verifyData, null, 2)
        );
      }
    }

    // Increment flag_count on target table (only for groups)
    // Note: flag_count for users is calculated dynamically in admin app
    if (targetType === "group") {
      const { data: groupData, error: groupFetchError } = await supabase
        .from("groups")
        .select("flag_count")
        .eq("id", targetId)
        .single();

      if (!groupFetchError && groupData) {
        const currentFlagCount = groupData.flag_count || 0;
        const { error: updateError } = await supabase
          .from("groups")
          .update({ flag_count: currentFlagCount + 1 })
          .eq("id", targetId);

        if (updateError) {
          console.warn("Could not increment group flag_count:", updateError);
          // Continue - flag was created successfully, just couldn't update count
        } else {
          console.log("Group flag_count incremented to:", currentFlagCount + 1);
        }
      }
    }

    // Log to Sentry (optional, for monitoring)
    Sentry.captureMessage("Flag created", {
      level: "info",
      tags: {
        targetType,
        reporterId,
        targetId,
      },
      extra: {
        hasEvidence: !!evidenceUrl,
      },
    });

    console.log("=== FINAL SUCCESS RESPONSE ===");
    console.log("Flag ID:", flagResult.id);

    // PHASE 6: Do not expose evidence URLs in public API response
    // Evidence URLs should only be accessible via admin API with signed URLs
    const response = {
      success: true,
      flagId: flagResult.id,
      message: `Report submitted successfully. Thank you for helping keep our community safe.`,
      // Do not include evidenceUrl or evidencePublicId in response
    };

    console.log("Returning response:", JSON.stringify(response, null, 2));

    return NextResponse.json(response);
  } catch (error) {
    console.error("=== ❌ CATCH BLOCK ERROR ===");
    console.error("[FLAGS_ERROR]", error);
    console.error(
      "Error type:",
      error instanceof Error ? error.constructor.name : typeof error
    );
    console.error(
      "Error message:",
      error instanceof Error ? error.message : String(error)
    );
    console.error(
      "Error stack:",
      error instanceof Error ? error.stack : "No stack trace"
    );

    Sentry.captureException(error, {
      tags: {
        scope: "public-api",
        route: "POST /api/flags",
      },
    });

    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}


