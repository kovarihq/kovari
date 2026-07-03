import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@kovari/api";
import { enforceBanSideEffects } from "@kovari/api/server";
import { revokeClerkSessionsForUser } from "@/admin-lib/revokeClerkSessions";
import { requireAdmin } from "@/admin-lib/adminAuth";
import { logAdminAction } from "@/admin-lib/logAdminAction";
import * as Sentry from "@sentry/nextjs";
import { incrementErrorCounter } from "@/admin-lib/incrementErrorCounter";
import { sendEmail } from "@/admin-lib/send-email";
import { userWarningEmail, userBanEmail, userSuspensionEmail } from "@/admin-lib/email-templates/admin-actions";

interface Params {
  params: Promise<{ id: string }>;
}

type UserAction = "verify" | "ban" | "suspend" | "unban" | "warn";

export async function POST(req: NextRequest, { params }: Params) {
  let adminId: string;
  try {
    const admin = await requireAdmin();
    adminId = admin.adminId;
    Sentry.setUser({
      id: admin.adminId,
      email: admin.email,
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
    const body = await req.json();
    const action: UserAction = body.action;
    const reason: string | undefined = body.reason;
    const banUntil: string | undefined = body.banUntil;
    const flagId: string | undefined = body.flagId; // Handle specific flag resolution

    // 1) find profile to get user_id
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, user_id, verified, name, email")
      .eq("id", profileId)
      .maybeSingle();

    if (profileError || !profile) {
      console.error("Profile lookup error:", profileError);
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const userId = profile.user_id as string;

    // Rate limit dangerous actions (ban, suspend, unban)
    const dangerousActions: UserAction[] = ["ban", "suspend", "unban"];
    if (dangerousActions.includes(action)) {
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
      const { data: recent } = await supabaseAdmin
        .from("admin_actions")
        .select("id")
        .eq("admin_id", adminId)
        .eq("target_id", userId)
        .eq("target_type", "user")
        .eq(
          "action",
          action === "ban"
            ? "BAN_USER"
            : action === "suspend"
              ? "SUSPEND_USER"
              : action === "unban"
                ? "UNBAN_USER"
                : "WARN_USER"
        )
        .gt("created_at", oneMinuteAgo)
        .limit(1);

      if (recent && recent.length > 0) {
        return NextResponse.json(
          { error: "Please wait before repeating this action" },
          { status: 429 }
        );
      }
    }

    // Helper to resolve result logging
    const logResolution = async (flagId: string, actionType: string, targetType: "user_flag" | "group_flag") => {
       await logAdminAction({
            adminId,
            targetType: targetType,
            targetId: flagId,
            action: "RESOLVE_FLAG",
            reason: `${actionType.charAt(0).toUpperCase() + actionType.slice(1)} user: ${reason || "No reason provided"}`,
            metadata: { flagId, action: actionType },
          });
    };

    // Helper to resolve a specific flag if provided
    const resolveFlag = async (flagId: string, actionType: string) => {
      try {
        console.log(`Resolving flag ${flagId} with action ${actionType} from user action...`);
        
        const now = new Date().toISOString();
        const fullUpdateData = { 
          status: "actioned",
          reviewed_by: adminId,
          reviewed_at: now
        };
        const simpleUpdateData = { status: "actioned" };

        // 1. Try updating user_flags
        let { data: userRows, error: updateError } = await supabaseAdmin
          .from("user_flags")
          .update(fullUpdateData)
          .eq("id", flagId)
          .select('id'); 

        // Handle missing column error
        if (updateError && (updateError.code === "42703" || updateError.message?.includes("column") || updateError.code === "PGRST204")) {
           // console.log("reviewed_by/reviewed_at columns might be missing, retrying with simple status update...");
           const retry = await supabaseAdmin
             .from("user_flags")
             .update(simpleUpdateData)
             .eq("id", flagId)
             .select('id');
           updateError = retry.error;
           userRows = retry.data;
        }

        if (updateError) {
          console.error("Error updating user_flags:", updateError);
        } else if (userRows && userRows.length > 0) {
           // console.log(`Successfully updated user_flags id=${flagId}`);
           await logResolution(flagId, actionType, "user_flag");
           return;
        }

        // 2. If no user_flag matched, try group_flags
        // console.log("Flag not found in user_flags or update failed, trying group_flags...");
        
        let { data: groupRows, error: groupError } = await supabaseAdmin
          .from("group_flags")
          .update(fullUpdateData)
          .eq("id", flagId)
          .select('id');
          
        if (groupError && (groupError.code === "42703" || groupError.message?.includes("column") || groupError.code === "PGRST204")) {
           const retry = await supabaseAdmin
             .from("group_flags")
             .update(simpleUpdateData)
             .eq("id", flagId)
             .select('id');
            groupError = retry.error;
            groupRows = retry.data;
        }

        if (!groupError && groupRows && groupRows.length > 0) {
           // console.log(`Successfully updated group_flags id=${flagId}`);
           await logResolution(flagId, actionType, "group_flag");
           return;
        }

        console.warn(`Could not find/update flag ${flagId} in user_flags or group_flags.`);

      } catch (error) {
        console.error("Error resolving flag:", error);
      }
    };

    if (action === "verify") {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update({ verified: true })
        .eq("id", profileId);

      if (error) {
        console.error("Verify error:", error);
        return NextResponse.json(
          { error: "Failed to verify user" },
          { status: 500 }
        );
      }

      await logAdminAction({
        adminId,
        targetType: "user",
        targetId: userId,
        action: "VERIFY_USER",
        reason,
        metadata: {
          previous_verified_status: profile.verified,
          user_email: profile.email,
          user_name: profile.name,
        },
      });

      return NextResponse.json({ success: true });
    }

    if (action === "warn") {
      if (!reason || !reason.trim()) {
        return NextResponse.json(
          { error: "Reason is required for warning" },
          { status: 400 }
        );
      }

      // Send warning email using Brevo
      let emailSent = false;
      let emailError: string | undefined = undefined;
      
      if (profile.email) {
        const result = await sendEmail({
          to: profile.email,
          subject: "Warning: Account Violation",
          html: userWarningEmail({ reason }),
           category: "user_warning"
        });
        emailSent = result.success;
        if (!result.success) emailError = result.error;
      }

      await logAdminAction({
        adminId,
        targetType: "user",
        targetId: userId,
        action: "WARN_USER",
        reason,
        metadata: {
          emailSent,
          user_email: profile.email,
          user_name: profile.name,
        },
      });

      // Resolve flag if provided
      if (flagId) {
        await resolveFlag(flagId, "warn");
      }

      return NextResponse.json({ 
        success: true,
        emailSent,
        emailError 
      });
    }

    if (action === "ban" || action === "suspend") {
      // Require reason for ban and suspend actions
      if (!reason || !reason.trim()) {
        return NextResponse.json(
          { error: "Reason is required for ban and suspend actions" },
          { status: 400 }
        );
      }

      // Convert datetime-local format to ISO string for proper storage
      let banExpiresAt: string | null = null;
      if (action === "suspend") {
        // Require banUntil for suspend action
        if (!banUntil || !banUntil.trim()) {
          return NextResponse.json(
            { error: "Suspension expiry date is required" },
            { status: 400 }
          );
        }
        // datetime-local gives format like "2024-01-01T12:00"
        // Convert to ISO string with timezone
        const date = new Date(banUntil);
        if (isNaN(date.getTime())) {
          return NextResponse.json(
            { error: "Invalid date format" },
            { status: 400 }
          );
        }
        banExpiresAt = date.toISOString();
      }

      const { error } = await supabaseAdmin
        .from("users")
        .update({
          banned: true,
          ban_reason: reason.trim(),
          ban_expires_at: banExpiresAt,
        })
        .eq("id", userId);

      if (error) {
        console.error("Ban/suspend error:", error);
        return NextResponse.json(
          { error: "Failed to ban/suspend user" },
          { status: 500 }
        );
      }

      // Send notification email
      let emailSent = false;
      let emailError: string | undefined = undefined;
      
      if (profile.email) {
        const isBan = action === "ban";
        const subject = isBan ? "Account Permanently Banned" : "Account Suspension Notice";
        const title = isBan ? "Account Permanently Banned" : "Account Suspended";
        const suspendUntilDate = banExpiresAt ? new Date(banExpiresAt).toLocaleString() : "";
        
        const html = isBan
          ? userBanEmail({ reason: reason?.trim() })
          : userSuspensionEmail({
              reason: reason?.trim(),
              suspendUntil: suspendUntilDate,
            });

        const result = await sendEmail({
          to: profile.email,
          subject,
          html,
          category: isBan ? "user_ban" : "user_suspension"
        });
        emailSent = result.success;
        if (!result.success) emailError = result.error;
      }

      await logAdminAction({
        adminId,
        targetType: "user",
        targetId: userId,
        action: action === "ban" ? "BAN_USER" : "SUSPEND_USER",
        reason,
        metadata: { ban_expires_at: banExpiresAt, emailSent },
      });

      // Resolving flag if provided
      if (flagId) {
        await resolveFlag(flagId, action);
      }

      await enforceBanSideEffects({ userId });
      await revokeClerkSessionsForUser(userId);

      return NextResponse.json({ success: true, emailSent });
    }

    if (action === "unban") {
      const { error } = await supabaseAdmin
        .from("users")
        .update({
          banned: false,
          ban_reason: null,
          ban_expires_at: null,
        })
        .eq("id", userId);

      if (error) {
        console.error("Unban error:", error);
        return NextResponse.json(
          { error: "Failed to unban user" },
          { status: 500 }
        );
      }

      await logAdminAction({
        adminId,
        targetType: "user",
        targetId: userId,
        action: "UNBAN_USER",
        reason,
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    await incrementErrorCounter();
    Sentry.captureException(error, {
      tags: {
        scope: "admin-api",
        route: "POST /api/admin/users/[id]/action",
      },
    });
    throw error;
  }
}
