import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@kovari/api";
import { resolveUser } from "@/lib/auth/resolveUser";
import { invalidateMatchingCache } from "@/lib/api/matching/cache";

export async function POST(request: NextRequest) {
  try {
    const authResult = await resolveUser(request, { mode: 'protected' });
    if (!authResult.ok || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const reporterUuid = authResult.user.userId;
    const supabaseAdmin = createAdminSupabaseClient();

    const body = await request.json();
    const {
      reportedUserId,
      targetId, // generic alias
      reason,
      type = "user",
      evidenceUrl,
      evidencePublicId,
    } = body;

    // Normalize type: 'solo' (legacy) -> 'user'
    const reportType =
      type === "solo" || type === "user"
        ? "user"
        : type === "group"
          ? "group"
          : type;

    // Determine target ID (reportedUserId is legacy for matching)
    let targetIdentifier = targetId || reportedUserId;

    // Normalize evidenceUrl
    const normalizedEvidenceUrl =
      evidenceUrl && typeof evidenceUrl === "string" && evidenceUrl.trim()
        ? evidenceUrl.trim()
        : null;

    if (!reporterUuid || !targetIdentifier || !reason) {
      console.error("Report API: Missing parameters", {
        reporterUuid,
        targetIdentifier,
        reason,
        type: reportType,
      });
      return NextResponse.json(
        { success: false, error: "Missing parameters" },
        { status: 400 },
      );
    }



    // Validate reason
    if (!reason.trim()) {
      return NextResponse.json(
        { success: false, error: "Report reason cannot be empty" },
        { status: 400 },
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

    let targetUuid = targetIdentifier;
    // For user/solo type, resolve the target user ID (in case it's a clerk ID)
    // For groups, we assume it's already a UUID (group ID)
    if (reportType === "user") {
      targetUuid = await resolve(targetIdentifier);
      if (!targetUuid) {
        return NextResponse.json(
          { success: false, error: "Invalid target user ID" },
          { status: 400 },
        );
      }
    }

    if (reportType === "user") {
      // Check duplicate in user_flags
      const { data: existing } = await supabaseAdmin
        .from("user_flags")
        .select("id")
        .eq("reporter_id", reporterUuid)
        .eq("user_id", targetUuid)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({
          success: true,
          message: "User already reported",
        });
      }

      // Insert into user_flags
      const { data, error } = await supabaseAdmin
        .from("user_flags")
        .insert([
          {
            reporter_id: reporterUuid,
            user_id: targetUuid,
            reason,
            status: "pending",
            evidence_url: normalizedEvidenceUrl,
            evidence_public_id: evidencePublicId || null,
          },
        ])
        .select("id")
        .single();

      if (error) throw error;

      // Send notification to reporter
      try {
        const { createNotification } = await import(
          "@/lib/notifications/createNotification"
        );
        const { NotificationType } = await import(
          "@kovari/types"
        );

        await createNotification({
          userId: reporterUuid,
          type: NotificationType.REPORT_SUBMITTED,
          title: "Report received",
          message: "We've received your report and will review it shortly.",
          entityType: "report",
          entityId: data.id,
        });
      } catch (notifError) {
        console.error("Report API: Failed to send notification", notifError);
      }

      await invalidateMatchingCache(reporterUuid);
      return NextResponse.json({ success: true, reportId: data.id });
    } else if (reportType === "group") {
      // Check duplicate in group_flags
      const { data: existing } = await supabaseAdmin
        .from("group_flags")
        .select("id")
        .eq("reporter_id", reporterUuid)
        .eq("group_id", targetUuid)
        .maybeSingle();

      if (existing) {
        return NextResponse.json({
          success: true,
          message: "Group already reported",
        });
      }

      // Insert into group_flags
      const { data, error } = await supabaseAdmin
        .from("group_flags")
        .insert([
          {
            reporter_id: reporterUuid,
            group_id: targetUuid, // targetUuid is group ID
            reason,
            status: "pending",
            evidence_url: normalizedEvidenceUrl,
            evidence_public_id: evidencePublicId || null,
          },
        ])
        .select("id")
        .single();

      if (error) throw error;

      // Send notification to reporter
      try {
        const { createNotification } = await import(
          "@/lib/notifications/createNotification"
        );
        const { NotificationType } = await import(
          "@kovari/types"
        );

        await createNotification({
          userId: reporterUuid,
          type: NotificationType.REPORT_SUBMITTED,
          title: "Report received",
          message: "We've received your report and will review it shortly.",
          entityType: "report",
          entityId: data.id,
        });
      } catch (notifError) {
        console.error("Report API: Failed to send notification", notifError);
      }

      await invalidateMatchingCache(reporterUuid);
      return NextResponse.json({ success: true, reportId: data.id });
    } else {
      // Unknown report type
      return NextResponse.json(
        { success: false, error: "Invalid report type" },
        { status: 400 },
      );
    }
  } catch (error: any) {
    console.error("Report API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to create report",
      },
      { status: 500 },
    );
  }
}


