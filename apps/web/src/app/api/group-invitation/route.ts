import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createAdminSupabaseClient } from "@kovari/api";
import { getAuthenticatedUser } from "@/lib/auth/get-user";
import { generateRequestId } from "@/lib/api/requestId";
import {
  formatStandardResponse,
  formatErrorResponse,
} from "@/lib/api/responseHelpers";
import { ApiErrorCode } from "@/types/api";
import { createNotification } from "@/lib/notifications/createNotification";
import { NotificationType } from "@kovari/types";
import { absoluteUrl, getProductionAppUrl } from "@/lib/config/site";

// Helper to generate a random token
const generateToken = (length = 24) =>
  randomBytes(length).toString("base64url");

function getInviteBaseUrl(platform?: string): string {
  if (platform === "mobile") {
    return "kovari://invite";
  }
  const explicit = process.env.NEXT_PUBLIC_INVITE_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "development") {
    return `${getProductionAppUrl()}/invite`;
  }
  return absoluteUrl("/invite");
}

export async function GET(req: NextRequest) {
  const start = Date.now();
  const requestId = generateRequestId();

  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return formatErrorResponse(
        "Unauthorized",
        ApiErrorCode.UNAUTHORIZED,
        requestId,
        401
      );
    }

    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("groupId");
    const platform = searchParams.get("platform");
    if (!groupId) {
      return formatErrorResponse(
        "Missing groupId",
        ApiErrorCode.BAD_REQUEST,
        requestId,
        400
      );
    }
    const supabase = createAdminSupabaseClient();
    const currentUser = { id: authUser.id };

    const { data: group, error: groupError } = await supabase
      .from("groups")
      .select("id, status, creator_id, name")
      .eq("id", groupId)
      .maybeSingle();

    if (groupError || !group || group.status === "removed") {
      return formatErrorResponse(
        "Group not found",
        ApiErrorCode.NOT_FOUND,
        requestId,
        404
      );
    }

    const isCreator = group.creator_id === currentUser.id;
    if (!isCreator) {
      const { data: membership } = await supabase
        .from("group_memberships")
        .select("status")
        .eq("group_id", groupId)
        .eq("user_id", currentUser.id)
        .maybeSingle();

      if (membership?.status !== "accepted") {
        return formatErrorResponse(
          "Forbidden",
          ApiErrorCode.FORBIDDEN,
          requestId,
          403
        );
      }
    }

    // Check for existing link
    const { data: linkRow, error: linkError } = await supabase
      .from("group_invite_links")
      .select("token")
      .eq("group_id", groupId)
      .maybeSingle();

    if (linkError) {
      return formatErrorResponse(
        "Database error",
        ApiErrorCode.INTERNAL_SERVER_ERROR,
        requestId,
        500
      );
    }

    let token = linkRow?.token;
    if (!token) {
      // Generate and insert new token
      token = generateToken();
      const { error: insertError } = await supabase
        .from("group_invite_links")
        .insert({ group_id: groupId, token });
      if (insertError) {
        return formatErrorResponse(
          "Database error",
          ApiErrorCode.INTERNAL_SERVER_ERROR,
          requestId,
          500
        );
      }
    }

    const inviteBaseUrl = getInviteBaseUrl(platform ?? undefined);
    const connector = inviteBaseUrl.includes("://") && !inviteBaseUrl.startsWith("http") ? "/" : "/";
    // Actually, for kovari://invite it should be kovari://invite/token
    // For http://.../invite it should be http://.../invite/token
    const link = `${inviteBaseUrl}${inviteBaseUrl.endsWith("/") ? "" : "/"}${token}`;

    return formatStandardResponse(
      { link },
      {},
      { requestId, latencyMs: Date.now() - start }
    );
  } catch (error) {
    console.error("Error in GET group invitation API:", error);
    return formatErrorResponse(
      "Internal server error",
      ApiErrorCode.INTERNAL_SERVER_ERROR,
      requestId,
      500
    );
  }
}

export async function POST(req: NextRequest) {
  const start = Date.now();
  const requestId = generateRequestId();

  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return formatErrorResponse(
        "Unauthorized",
        ApiErrorCode.UNAUTHORIZED,
        requestId,
        401
      );
    }

    const body = await req.json();
    const { groupId, action, invites, platform } = body;

    if (!groupId) {
      return formatErrorResponse(
        "Missing groupId",
        ApiErrorCode.BAD_REQUEST,
        requestId,
        400
      );
    }
    const supabase = createAdminSupabaseClient();
    const userUuid = authUser.id;

    // Check if group exists and is not removed
    const { data: groupCheck, error: groupCheckError } = await supabase
      .from("groups")
      .select("id, status, creator_id, name")
      .eq("id", groupId)
      .single();

    if (groupCheckError || !groupCheck || groupCheck.status === "removed") {
      return formatErrorResponse(
        "Group not found",
        ApiErrorCode.NOT_FOUND,
        requestId,
        404
      );
    }

    // Handle accept/decline actions
    if (action === "accept") {
      // Check if group is full (10 members limit)
      const { data: memberCount, error: countError } = await supabase
        .from("group_memberships")
        .select("id", { count: "exact" })
        .eq("group_id", groupId)
        .eq("status", "accepted");

      if (countError) {
        return formatErrorResponse(
          "Failed to check member count",
          ApiErrorCode.INTERNAL_SERVER_ERROR,
          requestId,
          500
        );
      }

      if (memberCount && memberCount.length >= 10) {
        return formatErrorResponse(
          "Group is full (maximum 10 members)",
          ApiErrorCode.BAD_REQUEST,
          requestId,
          400
        );
      }

      // Update membership status to 'accepted' and role to 'member'
      const { error: updateError } = await supabase
        .from("group_memberships")
        .update({
          status: "accepted",
          role: "member",
          joined_at: new Date().toISOString(),
        })
        .eq("group_id", groupId)
        .eq("user_id", userUuid)
        .eq("status", "pending");

      if (updateError) {
        return formatErrorResponse(
          "Failed to accept invitation",
          ApiErrorCode.INTERNAL_SERVER_ERROR,
          requestId,
          500
        );
      }

      await createNotification({
        userId: userUuid,
        type: NotificationType.GROUP_JOIN_APPROVED,
        title: "Request Approved",
        message: `You're now a member of ${groupCheck.name}`,
        entityType: "group",
        entityId: groupId,
      });

      return formatStandardResponse(
        { success: true },
        {},
        { requestId, latencyMs: Date.now() - start }
      );
    }

    if (action === "decline") {
      const { error: updateError } = await supabase
        .from("group_memberships")
        .update({ status: "declined" })
        .eq("group_id", groupId)
        .eq("user_id", userUuid)
        .eq("status", "pending");

      if (updateError) {
        return formatErrorResponse(
          "Failed to decline invitation",
          ApiErrorCode.INTERNAL_SERVER_ERROR,
          requestId,
          500
        );
      }

      return formatStandardResponse(
        { success: true },
        {},
        { requestId, latencyMs: Date.now() - start }
      );
    }

    // sending invites logic...
    const isCreator = groupCheck.creator_id === userUuid;
    if (!isCreator) {
      const { data: membership } = await supabase
        .from("group_memberships")
        .select("status")
        .eq("group_id", groupId)
        .eq("user_id", userUuid)
        .maybeSingle();
      if (membership?.status !== "accepted") {
        return formatErrorResponse(
          "Forbidden",
          ApiErrorCode.FORBIDDEN,
          requestId,
          403
        );
      }
    }

    if (!Array.isArray(invites) || invites.length === 0) {
      return formatErrorResponse(
        "Missing invites",
        ApiErrorCode.BAD_REQUEST,
        requestId,
        400
      );
    }

    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("name")
      .eq("user_id", userUuid)
      .single();
    const senderName = senderProfile?.name || "Someone";

    for (const invite of invites) {
      let userRow = null;
      if (invite.username) {
        const { data, error } = await supabase
          .from("profiles")
          .select("user_id")
          .ilike("username", invite.username)
          .maybeSingle();

        if (data) userRow = { id: data.user_id };

        if (!userRow?.id) {
          return formatStandardResponse(
            {
              status: "user_not_found",
              message:
                "No account found with this username. Please check the username and try again.",
            },
            {},
            { requestId, latencyMs: Date.now() - start }
          );
        }

        const { data: existing } = await supabase
          .from("group_memberships")
          .select("id, status")
          .eq("group_id", groupId)
          .eq("user_id", userRow.id)
          .maybeSingle();

        if (existing) {
          if (existing.status === "accepted") {
            return formatStandardResponse(
              {
                status: "already_member",
                message: "This user is already a member of the group.",
              },
              {},
              { requestId, latencyMs: Date.now() - start }
            );
          }
          if (existing.status === "pending") {
            return formatStandardResponse(
              {
                status: "already_invited",
                message:
                  "This user already has a pending invitation to the group.",
              },
              {},
              { requestId, latencyMs: Date.now() - start }
            );
          }
          if (existing.status === "declined") {
            await supabase
              .from("group_memberships")
              .update({ status: "pending" })
              .eq("id", existing.id);
            
            await createNotification({
              userId: userRow.id,
              type: NotificationType.GROUP_INVITE_RECEIVED,
              title: "Group Invitation",
              message: `You've been invited back to ${groupCheck.name}!`,
              entityType: "group",
              entityId: groupId,
            });
            continue;
          }
        }

        const { data: memberCount } = await supabase
          .from("group_memberships")
          .select("id", { count: "exact" })
          .eq("group_id", groupId)
          .eq("status", "accepted");

        if (memberCount && memberCount.length >= 10) continue;

        const { error: insertError } = await supabase.from("group_memberships").insert({
          group_id: groupId,
          user_id: userRow.id,
          status: "pending",
          role: "member",
          joined_at: new Date().toISOString(),
        });

        if (insertError) {
          console.error("[API] Failed to insert group membership:", insertError);
          continue; // Skip notification if DB insert failed
        }

        await createNotification({
          userId: userRow.id,
          type: NotificationType.GROUP_INVITE_RECEIVED,
          title: "Group Invitation",
          message: `You've been invited to join ${groupCheck.name}!`,
          entityType: "group",
          entityId: groupId,
        });
      } else if (invite.email) {
        const token = generateToken();
        await supabase.from("group_email_invitations").insert({
          group_id: groupId,
          email: invite.email,
          token,
          status: "pending",
        });

        let groupName = "a group";
        const { data: g } = await supabase
          .from("groups")
          .select("name")
          .eq("id", groupId)
          .maybeSingle();
        if (g?.name) groupName = g.name;

        const inviteBaseUrl = getInviteBaseUrl(platform);
        const { sendGroupInviteEmail } = await import("@kovari/api");
        await sendGroupInviteEmail({
          to: invite.email,
          groupName,
          inviteLink: `${inviteBaseUrl}/${token}`,
          senderName,
        });
      }
    }

    return formatStandardResponse(
      { status: "sent" },
      {},
      { requestId, latencyMs: Date.now() - start }
    );
  } catch (error) {
    console.error("Error in POST group invitation API:", error);
    return formatErrorResponse(
      "Internal server error",
      ApiErrorCode.INTERNAL_SERVER_ERROR,
      requestId,
      500
    );
  }
}


