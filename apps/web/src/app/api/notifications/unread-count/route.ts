import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/get-user";
import { createAdminSupabaseClient } from "@kovari/api";
import { generateRequestId } from "@/lib/api/requestId";
import { formatStandardResponse, formatErrorResponse } from "@/lib/api/responseHelpers";
import { ApiErrorCode } from "@/types/api";
import { logPerformanceMetric, logInvocation } from "@/lib/observability/performance";

/**
 * GET /api/notifications/unread-count
 * Get the count of unread notifications for the current user
 */
export async function GET(request: NextRequest) {
  const start = performance.now();
  const requestId = generateRequestId();
  logInvocation("unread_count_invocation", { requestId });

  try {
    const authUser = await getAuthenticatedUser(request);

    if (!authUser) {
      return formatErrorResponse("Unauthorized", ApiErrorCode.UNAUTHORIZED, requestId, 401);
    }

    const userId = authUser.id;
    const supabase = createAdminSupabaseClient();

    // Count unread notifications
    const queryStart = performance.now();
    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false)
      .neq("type", "NEW_MESSAGE");
    logPerformanceMetric("unread_count_query_ms", performance.now() - queryStart, { requestId });

    if (error) {
      console.error("Error counting unread notifications:", error);
      return formatErrorResponse("Failed to count notifications", ApiErrorCode.INTERNAL_SERVER_ERROR, requestId, 500);
    }

    logPerformanceMetric("unread_count_total_ms", performance.now() - start, { requestId });
    return formatStandardResponse({ count: count || 0 }, {}, { requestId, latencyMs: Math.round(performance.now() - start) });
  } catch (error: any) {
    console.error("Exception in GET /api/notifications/unread-count:", error);
    return formatErrorResponse("Internal server error", ApiErrorCode.INTERNAL_SERVER_ERROR, requestId, 500);
  }
}


