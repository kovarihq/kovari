import * as Sentry from "@sentry/nextjs";
import { createAdminSupabaseClient, ProfileResponseSchema, ProfileResponse } from "@kovari/api";
import { getAuthenticatedUser } from "@/lib/auth/get-user";
import { NextRequest } from "next/server";
import { generateRequestId } from "@/lib/api/requestId";
import { formatStandardResponse, formatErrorResponse } from "@/lib/api/responseHelpers";
import { ApiErrorCode } from "@/types/api";
import { logger } from "@/lib/api/logger";
import { profileMapper } from "@/lib/mappers/profileMapper";
import { logPerformanceMetric, logInvocation } from "@/lib/observability/performance";
import { activationService } from "@/lib/activation/activation.service";

export async function GET(request: NextRequest) {
  const start = performance.now();
  const requestId = generateRequestId();
  logInvocation("profile_current_invocation", { requestId });
  const authStart = performance.now();
  const authUser = await getAuthenticatedUser(request);
  logPerformanceMetric("profile_auth_ms", performance.now() - authStart, { requestId });
  if (!authUser) {
    return formatErrorResponse("Unauthorized", ApiErrorCode.UNAUTHORIZED, requestId, 401);
  }

  const userId = authUser.clerkUserId;
  const internalUserId = authUser.id;

  const supabase = createAdminSupabaseClient();

  try {
    // 1. Unified Fetch: users + profiles (LEFT JOIN)
    const queryStart = performance.now();
    const { data: dbUser, error: dbError } = await supabase
      .from("users")
      .select("*, profiles(*)")
      .eq("id", internalUserId)
      .single();
    logPerformanceMetric("profile_user_query_ms", performance.now() - queryStart, { requestId });

    if (dbError || !dbUser) {
      logger.error(requestId, "Core identity not found", dbError);
      return formatErrorResponse("User not found", ApiErrorCode.NOT_FOUND, requestId, 404);
    }

    const dbProfile = dbUser.profiles || {}; // Handle missing profile row safely

    // 2. Map to standardized DTO
    const userDto = profileMapper.fromDb(dbUser, dbProfile);

    const activation = activationService.verifyActivation({
      onboarding_completed: dbUser.onboarding_completed,
      avatar: userDto.avatar,
      travel_intentions: userDto.travel_intentions,
    });

    const isFullyActivated = activation.isActivated && activation.isOnboardingCompletedFlag;

    // Counts are optimized to use single PostgREST count queries with joins filtering deleted users
    const countStart = performance.now();
    const { count: followersCount } = await supabase
      .from("user_follows")
      .select("follower_id!inner(isDeleted)", { count: "exact", head: true })
      .eq("following_id", internalUserId)
      .eq("follower_id.isDeleted", false);

    const { count: followingCount } = await supabase
      .from("user_follows")
      .select("following_id!inner(isDeleted)", { count: "exact", head: true })
      .eq("follower_id", internalUserId)
      .eq("following_id.isDeleted", false);
    logPerformanceMetric("profile_count_query_ms", performance.now() - countStart, { requestId });

    // ✅ Map to ProfileResponse (Final Contract)
    const profileData: ProfileResponse = {
      ...userDto,
      name: userDto.displayName, // Map DTO displayName to Contract name
      onboardingCompleted: activation.isOnboardingCompletedFlag,
      followers: followersCount || 0,
      following: followingCount || 0,
    };


    const serialStart = performance.now();
    const parsed = ProfileResponseSchema.parse(profileData);
    logPerformanceMetric("profile_serialization_ms", performance.now() - serialStart, { requestId });
    logPerformanceMetric("profile_total_ms", performance.now() - start, { requestId });
    
    return formatStandardResponse(
      parsed,
      { contractState: 'clean', degraded: false },
      { requestId, latencyMs: Math.round(performance.now() - start) }
    );
  } catch (error) {
    logger.error(requestId, "Error in profile fetch", error);
    Sentry.captureException(error, {
      tags: { endpoint: "/api/profile/current", action: "handler_error" },
      extra: { clerkUserId: userId, internalUserId },
    });
    return formatErrorResponse("Internal failure", ApiErrorCode.INTERNAL_SERVER_ERROR, requestId, 500);
  }
}


