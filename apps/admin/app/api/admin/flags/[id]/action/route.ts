// apps/admin/app/api/admin/flags/[id]/action/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@kovari/api";
import { enforceBanSideEffects } from "@kovari/api/server";
import { revokeClerkSessionsForUser } from "@/admin-lib/revokeClerkSessions";
import { requireAdmin } from "@/admin-lib/adminAuth";
import { logAdminAction } from "@/admin-lib/logAdminAction";
import * as Sentry from "@sentry/nextjs";
import { incrementErrorCounter } from "@/admin-lib/incrementErrorCounter";
import { sendEmail } from "@/admin-lib/send-email";
import {
  categorizeRemovalReason,
  handleOrganizerTrustImpact,
} from "@/admin-lib/groupSafetyHandler";
import {
  userWarningEmail,
  groupWarningEmail,
  userSuspensionEmail,
  groupRemovedEmail,
  userBanEmail,
} from "@/admin-lib/email-templates/admin-actions";

interface Params {
  params: Promise<{ id: string }>;
}

type FlagAction = "dismiss" | "warn" | "suspend" | "ban" | "resolve";

/**
 * POST /api/admin/flags/:id/action
 * 
 * Handles admin actions on flags:
 * - dismiss: Mark flag as dismissed
 * - warn: Send warning email + mark reviewed
 * - suspend: Set users.banned=true + expiry
 * - ban: Permanent ban
 * 
 * Always updates:
 * - user_flags.status
 * - user_flags.reviewed_by
 * - user_flags.reviewed_at
 * - Calls logAdminAction()
 */
export async function POST(req: NextRequest, { params }: Params) {
  let adminId: string;
  let email: string;
  
  try {
    const admin = await requireAdmin();
    adminId = admin.adminId;
    email = admin.email;
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
    const flagId = id;
    
    console.log("=== FLAG ACTION API ===");
    console.log("Flag ID:", flagId);
    console.log("Admin ID:", adminId);
    
    const body = await req.json();
    console.log("Request body:", JSON.stringify(body, null, 2));
    
    const action: FlagAction = body.action;
    const reason: string | undefined = body.reason;
    const banUntil: string | undefined = body.banUntil; // For suspend action

    console.log("Parsed action:", action);
    console.log("Reason:", reason);
    console.log("Ban until:", banUntil);

    // Validate action
    if (!["dismiss", "warn", "suspend", "ban", "resolve"].includes(action)) {
      console.error("Invalid action:", action);
      return NextResponse.json(
        { error: "Invalid action. Must be: dismiss, warn, suspend, ban, or resolve" },
        { status: 400 }
      );
    }

    // Load flag - check both user_flags and group_flags
    let flag: { id: string; user_id: string; type: string | null; status: string } | null = null;
    let targetId: string | null = null;
    let targetType: "user" | "group" = "user";

    const { data: userFlag, error: userFlagError } = await supabaseAdmin
      .from("user_flags")
      .select("id, user_id, type, status")
      .eq("id", flagId)
      .maybeSingle();

    if (userFlagError) {
      console.error("Flag lookup error:", userFlagError);
    }

    if (userFlag) {
      flag = userFlag;
      targetId = userFlag.user_id;
      targetType = (userFlag.type || "user") as "user" | "group";
    } else {
      // Try group_flags table
      try {
        const { data: groupFlag, error: groupFlagError } = await supabaseAdmin
          .from("group_flags")
          .select("id, group_id, status")
          .eq("id", flagId)
          .maybeSingle();

        if (groupFlagError) {
          console.error("Group flag lookup error:", groupFlagError);
        }

        if (groupFlag) {
          flag = {
            id: groupFlag.id,
            user_id: groupFlag.group_id,
            type: "group",
            status: groupFlag.status,
          };
          targetId = groupFlag.group_id;
          targetType = "group";
        }
      } catch {
        // group_flags table doesn't exist
      }
    }

    if (!flag || !targetId) {
      return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    }

    const userId = flag.user_id;
    const now = new Date().toISOString();

    // Helper: update flag status with reviewed_by and reviewed_at
    const updateFlagStatus = async (status: string) => {
      // Build update data
      const updateData: {
        status: string;
        reviewed_by?: string;
        reviewed_at?: string;
      } = {
        status,
        reviewed_by: adminId,
        reviewed_at: now,
      };

      if (targetType === "group") {
        // Update group_flags
        const { error: groupFlagUpdateError } = await supabaseAdmin
          .from("group_flags")
          .update(updateData)
          .eq("id", flagId);

        if (groupFlagUpdateError) {
          // Retry without reviewed columns if typical schema error
          if (
            groupFlagUpdateError.code === "42703" ||
            groupFlagUpdateError.message?.includes("column")
          ) {
            console.log(
              "reviewed_by/reviewed_at columns may not exist in group_flags"
            );
            const { error: retryError } = await supabaseAdmin
              .from("group_flags")
              .update({ status })
              .eq("id", flagId);

            if (retryError) throw new Error("Failed to update group flag status");
          } else {
            console.error("Flag status update error:", groupFlagUpdateError);
            throw new Error("Failed to update flag status");
          }
        }
      } else {
        // Update user_flags (default)
        const { error: userFlagUpdateError } = await supabaseAdmin
          .from("user_flags")
          .update(updateData)
          .eq("id", flagId);

        if (userFlagUpdateError) {
          if (
            userFlagUpdateError.code === "42703" ||
            userFlagUpdateError.message?.includes("column")
          ) {
            console.log(
              "reviewed_by/reviewed_at columns may not exist in user_flags"
            );
            const { error: retryError } = await supabaseAdmin
              .from("user_flags")
              .update({ status })
              .eq("id", flagId);

            if (retryError) throw new Error("Failed to update user flag status");
          } else {
            console.error("Flag status update error:", userFlagUpdateError);
            throw new Error("Failed to update flag status");
          }
        }
      }
    };

    // Handle dismiss action
    if (action === "dismiss") {
      console.log("Processing dismiss action...");
      await updateFlagStatus("dismissed");
      console.log("Flag status updated to dismissed");

      await logAdminAction({
        adminId,
        targetType: "user_flag",
        targetId: flagId,
        action: "DISMISS_FLAG",
        reason,
        metadata: { flagId, targetType, targetId: userId },
      });
      console.log("Admin action logged");

      return NextResponse.json({ success: true, message: "Flag dismissed successfully" });
    }

    // Handle resolve action
    if (action === "resolve") {
      console.log("Processing resolve action...");
      await updateFlagStatus("actioned");
      console.log("Flag status updated to actioned");

      await logAdminAction({
        adminId,
        targetType: targetType === "group" ? "group_flag" : "user_flag",
        targetId: flagId,
        action: "RESOLVE_FLAG",
        reason: reason || "Flag marked as resolved",
        metadata: { flagId, targetType, targetId: userId },
      });
      console.log("Admin action logged (RESOLVE)");

      return NextResponse.json({ success: true, message: "Flag resolved successfully" });
    }

    // Handle warn action
    if (action === "warn") {
      // Shared email variables
      let contactEmail: string | null = null;
      let emailSubject = "";
      let emailHtml = "";
      let loggingTargetId = userId; // default to user ID (which is userId variable)

      if (targetType === "group") {
        const groupId = userId; // userId var holds group ID here
        loggingTargetId = groupId;
        
        // 1. Fetch group details to find creator
        const { data: groupData } = await supabaseAdmin
          .from("groups")
          .select("name, creator_id")
          .eq("id", groupId)
          .maybeSingle();

        if (!groupData) {
          return NextResponse.json({ error: "Group not found" }, { status: 404 });
        }

        const creatorId = groupData.creator_id;
        
        // 2. Fetch creator email
        if (creatorId) {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("email")
            .eq("user_id", creatorId)
            .maybeSingle();
          if (profile?.email) contactEmail = profile.email;
        }

        emailSubject = `Warning: Issue reported in your group "${groupData.name}"`;
        emailHtml = groupWarningEmail({
          groupName: groupData.name,
          reason,
        });
      } else {
        // USER TARGET
        try {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("email")
            .eq("user_id", userId)
            .maybeSingle();

          if (profile?.email) {
            contactEmail = profile.email;
          }
        } catch (error) {
          console.error("Error fetching user email:", error);
        }

        emailSubject = "Warning: Account Violation";
        emailHtml = userWarningEmail({ reason });
      }

      // Send warning email using Brevo
      let emailSent = false;
      let emailError: string | undefined = undefined;
      
      if (contactEmail) {
        const result = await sendEmail({
             to: contactEmail,
             subject: emailSubject,
             html: emailHtml,
             category: targetType === "group" ? "group_warning" : "user_warning"
        });
        emailSent = result.success;
        if (!result.success) emailError = result.error;
      } else {
        console.log("Contact email not found, skipping email send");
      }

      // Mark flag as reviewed (status = "actioned" for non-dismiss actions)
      console.log("Updating flag status to actioned...");
      await updateFlagStatus("actioned");
      
      await logAdminAction({
        adminId,
        targetType: targetType === "group" ? "group" : "user",
        targetId: loggingTargetId,
        action: targetType === "group" ? "WARN_GROUP_FROM_FLAG" : "WARN_USER_FROM_FLAG",
        reason,
        metadata: { flagId, emailSent, email: contactEmail },
      });

      // Also log as RESOLVE_FLAG
      await logAdminAction({
        adminId,
        targetType: targetType === "group" ? "group_flag" : "user_flag",
        targetId: flagId,
        action: "RESOLVE_FLAG",
        reason: targetType === "group" ? `Warned group: ${reason}` : `Warned user: ${reason}`,
        metadata: { flagId, action: "warn", emailSent },
      });
      console.log("Admin action logged (WARN & RESOLVE)");

      return NextResponse.json({ 
        success: true, 
        emailSent,
        emailError: emailError || undefined,
        message: emailSent 
          ? "Warning email sent successfully" 
          : "Warning action completed but email not sent"
      });
    }

    // Handle suspend action (only for users, not groups)
    if (action === "suspend") {
      if (targetType === "group") {
        return NextResponse.json(
          { error: "Suspend action is only available for user flags" },
          { status: 400 }
        );
      }

      if (!banUntil) {
        return NextResponse.json(
          { error: "banUntil is required for suspend action" },
          { status: 400 }
        );
      }

      // Get user email for notification
      let userEmail: string | null = null;
      try {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("email")
          .eq("user_id", userId)
          .maybeSingle();

        if (profile?.email) {
          userEmail = profile.email;
        }
      } catch (error) {
        console.error("Error fetching user email:", error);
      }

      // Set users.banned=true with expiry
      const { error: banError } = await supabaseAdmin
        .from("users")
        .update({
          banned: true,
          ban_reason: reason ?? "Suspended due to flag report",
          ban_expires_at: banUntil,
        })
        .eq("id", userId);

      if (banError) {
        console.error("Suspend user error:", banError);
        return NextResponse.json(
          { error: "Failed to suspend user" },
          { status: 500 }
        );
      }

      // Send suspension notification email using Brevo
      let emailSent = false;
      let emailError: string | undefined = undefined;
      
      if (userEmail) {
        const suspendUntilDate = new Date(banUntil).toLocaleString();
        const result = await sendEmail({
             to: userEmail,
             subject: "Account Suspension Notice",
             html: userSuspensionEmail({
               reason,
               suspendUntil: suspendUntilDate,
             }),
             category: "user_suspension"
        });
        emailSent = result.success;
        if (!result.success) emailError = result.error;
      } else {
        console.log("User email not found, skipping email send");
      }

      // Mark flag as reviewed
      await updateFlagStatus("actioned");

      await logAdminAction({
        adminId,
        targetType: "user",
        targetId: userId,
        action: "SUSPEND_USER_FROM_FLAG",
        reason,
        metadata: { flagId, ban_expires_at: banUntil, suspendUntil: banUntil, emailSent, userEmail },
      });

      // Also log as RESOLVE_FLAG
      await logAdminAction({
        adminId,
        targetType: "user_flag",
        targetId: flagId,
        action: "RESOLVE_FLAG",
        reason: `Suspended user: ${reason || "No reason provided"}`,
        metadata: { flagId, action: "suspend", ban_expires_at: banUntil },
      });
      console.log("Admin action logged (SUSPEND & RESOLVE)");

      await enforceBanSideEffects({ userId });
      await revokeClerkSessionsForUser(userId);

      return NextResponse.json({ 
        success: true,
        suspendUntil: banUntil,
        emailSent,
        emailError: emailError || undefined,
        message: emailSent 
          ? `User suspended until ${new Date(banUntil).toLocaleString()}. Notification email sent.`
          : `User suspended until ${new Date(banUntil).toLocaleString()}`
      });
    }

    // Handle ban action
    if (action === "ban") {
      let emailSent = false;
      let emailError: string | undefined = undefined;

      if (targetType === "group") {
        const groupId = userId; // userId var holds group ID here
        
        // 1. Fetch group details
        const { data: groupData } = await supabaseAdmin
          .from("groups")
          .select("name, creator_id")
          .eq("id", groupId)
          .maybeSingle();

        if (!groupData) {
          return NextResponse.json({ error: "Group not found" }, { status: 404 });
        }
        
        // 2. Remove the group (update status to removed)
        const { error: removeError } = await supabaseAdmin
          .from("groups")
          .update({
            status: "removed",
            removed_reason: reason ?? "Removed due to flag report",
            removed_at: new Date().toISOString()
          })
          .eq("id", groupId);

        if (removeError) {
          console.error("Group remove error:", removeError);
          return NextResponse.json({ error: "Failed to remove group" }, { status: 500 });
        }

        const creatorId = groupData.creator_id;

        // 3. Handle trust impact (scoring)
        if (reason && creatorId) {
             const severity = categorizeRemovalReason(reason);
             await handleOrganizerTrustImpact(creatorId, severity, adminId, groupId);
        }

        // 4. Send email to creator
        if (creatorId) {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("email")
            .eq("user_id", creatorId)
            .maybeSingle();
          
          if (profile?.email) {
             const result = await sendEmail({
                 to: profile.email,
                 subject: `Group Removed: ${groupData.name}`,
                 html: groupRemovedEmail({
                   groupName: groupData.name,
                   reason,
                 }),
                 category: "group_removed"
             });
             emailSent = result.success;
             if (!result.success) emailError = result.error;
          }
        }

        // 5. Logs & status
        await updateFlagStatus("actioned");
        await logAdminAction({
            adminId,
            targetType: "group",
            targetId: groupId,
            action: "REMOVE_GROUP_FROM_FLAG",
            reason,
            metadata: { flagId, emailSent },
        });
        await logAdminAction({
            adminId,
            targetType: "group_flag",
            targetId: flagId,
            action: "RESOLVE_FLAG",
            reason: `Removed group: ${reason}`,
            metadata: { flagId, action: "ban/remove", emailSent },
        });

         return NextResponse.json({ 
            success: true,
            emailSent,
            emailError: emailError || undefined,
            message: emailSent 
            ? "Group removed. Notification email sent."
            : "Group removed"
        });

      } else {
        // USER BAN LOGIC (Original)
        // Get user email for notification
        let userEmail: string | null = null;
        try {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("email")
            .eq("user_id", userId)
            .maybeSingle();

          if (profile?.email) {
            userEmail = profile.email;
          }
        } catch (error) {
          console.error("Error fetching user email:", error);
        }

        // Permanent ban (no expiry)
        const { error: banError } = await supabaseAdmin
          .from("users")
          .update({
            banned: true,
            ban_reason: reason ?? "Permanently banned due to flag report",
            ban_expires_at: null, // Permanent ban
          })
          .eq("id", userId);

        if (banError) {
          console.error("Ban user error:", banError);
          return NextResponse.json(
            { error: "Failed to ban user" },
            { status: 500 }
          );
        }

        // Send ban notification email using Brevo
        if (userEmail) {
          const result = await sendEmail({
              to: userEmail,
              subject: "Account Permanently Banned",
              html: userBanEmail({ reason }),
              category: "user_ban"
          });
          emailSent = result.success;
          if (!result.success) emailError = result.error;
        } else {
            console.log("User email not found, skipping email send");
        }

        // Mark flag as reviewed
        await updateFlagStatus("actioned");

        await logAdminAction({
          adminId,
          targetType: "user",
          targetId: userId,
          action: "BAN_USER_FROM_FLAG",
          reason,
          metadata: { flagId, permanent: true, emailSent, userEmail },
        });

        // Also log as RESOLVE_FLAG
        await logAdminAction({
          adminId,
          targetType: "user_flag",
          targetId: flagId,
          action: "RESOLVE_FLAG",
          reason: `Banned user: ${reason || "No reason provided"}`,
          metadata: { flagId, action: "ban", permanent: true },
        });
        console.log("Admin action logged (BAN & RESOLVE)");

        await enforceBanSideEffects({ userId });
        await revokeClerkSessionsForUser(userId);

        return NextResponse.json({ 
          success: true,
          permanent: true,
          emailSent,
          emailError: emailError || undefined,
          message: emailSent 
            ? "User permanently banned. Notification email sent."
            : "User permanently banned"
        });
      }
    }

    console.error("Invalid action reached end of handler:", action);
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("=== FLAG ACTION API ERROR ===");
    console.error("Error:", error);
    console.error("Error type:", error instanceof Error ? error.constructor.name : typeof error);
    console.error("Error message:", error instanceof Error ? error.message : String(error));
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack");
    
    await incrementErrorCounter();
    Sentry.captureException(error, {
      tags: {
        scope: "admin-api",
        route: "POST /api/admin/flags/[id]/action",
      },
    });
    
    // Return error response instead of throwing
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "Internal server error",
        details: error instanceof Error ? error.stack : String(error)
      },
      { status: 500 }
    );
  }
}
