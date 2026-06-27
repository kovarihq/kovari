import { NextRequest } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/get-user";
import { createAdminSupabaseClient } from "@kovari/api";
import {
  formatStandardResponse,
  formatErrorResponse,
} from "@/lib/api/responseHelpers";
import { ApiErrorCode } from "@/types/api";
import { logPerformanceMetric, logInvocation } from "@/lib/observability/performance";
import { generateRequestId } from "@/lib/api/requestId";

/**
 * GET /api/notifications
 * Fetch notifications for the current user
 * Query params:
 * - limit: number (default: 50)
 * - offset: number (default: 0)
 * - unreadOnly: boolean (default: false)
 */
export async function GET(request: NextRequest) {
  const start = performance.now();
  const requestId = generateRequestId();
  try {
    const authUser = await getAuthenticatedUser(request);

    if (!authUser) {
      return formatErrorResponse(
        "Unauthorized",
        ApiErrorCode.UNAUTHORIZED,
        requestId,
        401
      );
    }

    const userId = authUser.id;
    const supabase = createAdminSupabaseClient();
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const reason = searchParams.get("reason") || "unknown";

    logInvocation("notifications_invocation", { requestId, reason });

    // Build query
    let query = supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .neq("type", "NEW_MESSAGE")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (unreadOnly) {
      query = query.eq("is_read", false);
    }

    const queryStart = performance.now();
    const { data: notificationsData, error } = await query;
    logPerformanceMetric("notifications_query_ms", performance.now() - queryStart, { requestId, reason });

    if (error) {
      console.error("Error fetching notifications:", error);
      return formatErrorResponse(
        "Failed to fetch notifications",
        ApiErrorCode.INTERNAL_SERVER_ERROR,
        requestId,
        500
      );
    }

    const notifications = notificationsData || [];

    // Enrichment: Fetch images for notifications
    const userIdsToFetch = new Set<string>();
    const groupIdsToFetch = new Set<string>();

    notifications.forEach((n) => {
      if (!n.entity_id) return;
      
      if (
        n.entity_type === "match" || 
        n.entity_type === "chat"
      ) {
         // for match/chat, entity_id is the user ID
         userIdsToFetch.add(n.entity_id);
      } else if (n.entity_type === "group") {
         groupIdsToFetch.add(n.entity_id);
      }
    });

    // Fetch in parallel
    const [profilesResult, groupsResult] = await Promise.all([
      userIdsToFetch.size > 0
        ? supabase
            .from("profiles")
            .select("user_id, profile_photo")
            .in("user_id", Array.from(userIdsToFetch))
        : Promise.resolve({ data: [] }),
      groupIdsToFetch.size > 0
        ? supabase
            .from("groups")
            .select("id, cover_image, status")
            .in("id", Array.from(groupIdsToFetch))
        : Promise.resolve({ data: [] }),
    ]);

    const profileMap = new Map();
    if (profilesResult.data) {
      profilesResult.data.forEach((p: any) => {
        profileMap.set(p.user_id, p.profile_photo);
      });
    }

    const groupMap = new Map();
    if (groupsResult.data) {
      groupsResult.data.forEach((g: any) => {
        if (g?.status === "removed") {
          groupMap.set(g.id, null);
          return;
        }
        groupMap.set(g.id, g.cover_image);
      });
    }

    const enrichedNotifications = notifications.map((n) => {
      let image_url;
      if (n.entity_type === "match" || n.entity_type === "chat") {
        image_url = profileMap.get(n.entity_id);
      } else if (n.entity_type === "group") {
        image_url = groupMap.get(n.entity_id);
      }
      return { ...n, image_url };
    });

    logPerformanceMetric("notifications_total_ms", performance.now() - start, { requestId, reason });

    return formatStandardResponse(
      { notifications: enrichedNotifications },
      {},
      { requestId, latencyMs: Math.round(performance.now() - start) }
    );
  } catch (error: any) {
    console.error("Exception in GET /api/notifications:", error);
    return formatErrorResponse(
      "Internal server error",
      ApiErrorCode.INTERNAL_SERVER_ERROR,
      "fetch-notifs",
      500
    );
  }
}


