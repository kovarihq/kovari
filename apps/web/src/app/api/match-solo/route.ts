import { NextRequest, NextResponse } from "next/server";
import { resolveUser } from "@/lib/auth/resolveUser";
import { createRouteHandlerSupabaseClientWithServiceRole } from "@kovari/api";
import { generateRequestId } from "@/lib/api/requestId";
import { detectClient } from "@/lib/api/clientDetection";
import { fetchWithTimeout, safeParseJson } from "@/lib/api/fetcher";
import { 
  formatStandardResponse, 
  formatErrorResponse, 
  safeTransform 
} from "@/lib/api/responseHelpers";
import { matchTransformer } from "@/lib/transformers/matchTransformer";
import { validateGoMatchResponse, safeBatchValidate } from "@/lib/api/validators/v1/matchValidator";
import { GoSoloMatchSchema } from "@/lib/api/validators/v1/matchSchemas";
import { ApiErrorCode } from "@/types/api";
import { logger } from "@/lib/api/logger";
import { 
  getMatchingCache, 
  setMatchingCache, 
  generateMatchCacheKey,
  tryAcquireRefreshLock 
} from "@/lib/api/matching/cache";
import { matchingServiceBreaker } from "@/lib/api/matching/circuitBreaker";
import { performSoloDbMatchingFallback } from "@/lib/api/matching/fallback";
import { getInternalAuthHeaders } from "@/lib/api/internalAuth";

const GO_URL = process.env.GO_SERVICE_URL || "http://localhost:8080";

/**
 * 🏛️ HARDENED SOLO MATCHING API v2
 */
export async function GET(request: NextRequest) {
  const start = Date.now();
  const requestId = generateRequestId();
  const { client } = detectClient(request);

  try {
    const authResult = await resolveUser(request, { mode: 'protected' });
    if (!authResult.ok || !authResult.user) return formatErrorResponse("Unauthorized", ApiErrorCode.UNAUTHORIZED, requestId, 401);

    const userId = authResult.user.userId;
    const clerkId = authResult.user.providerId;

    const supabase = createRouteHandlerSupabaseClientWithServiceRole();
    const { data: dbUser, error: fetchError } = await supabase.from("users").select("id, email").eq("id", userId).single();
    
    if (fetchError && fetchError.code !== 'PGRST116') {
      logger.error(requestId, "Metadata lookup failed", fetchError);
    }

    // Force a fresh fetch by bumping the version string
    const userVersion = "v1-stable-final-v10";

    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    const cacheKey = generateMatchCacheKey(userId, "solo", params);

    // 1. Try Cache
    const cache = await getMatchingCache(cacheKey);
    if (cache && !cache.isExpired && cache.version === userVersion) {
      // SWR Trigger: If stale, refresh in background
      if (cache.isStale) {
        triggerBackgroundRefresh(userId, clerkId, userVersion, cacheKey, params);
      }
      const filteredMatches = await filterInteractedMatches(userId, cache.data);
      return formatStandardResponse(
        { matches: await enrichMatchesWithFollowing(userId, filteredMatches) },
        { source: "cache", degraded: false, hasMore: false },
        { requestId, latencyMs: Date.now() - start }
      );
    }

    // 2. Try Go Service (with Circuit Breaker)
    const isGoConfigured = !!process.env.GO_SERVICE_URL && !GO_URL.includes("localhost");
    const canUseGoService = isGoConfigured || process.env.NODE_ENV === "development";
    
    if (canUseGoService && await matchingServiceBreaker.shouldAllowRequest()) {
      try {
        const internalHeaders = getInternalAuthHeaders(clerkId || userId, requestId);

        const goResponse = await fetchWithTimeout(`${GO_URL}/v1/match/solo`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            ...internalHeaders
          },
          body: JSON.stringify({ userId: clerkId || userId, context: params }),
          timeout: 30000,
        });

        const rawData = await safeParseJson(goResponse);
        const goValid = validateGoMatchResponse(rawData);

        logger.debug(requestId, { 
          source: "Go Service Raw Response",
          ok: goResponse.ok, 
          valid: goValid,
          rawItemCount: (rawData?.matches || rawData)?.length || 0 
        });

        if (goResponse.ok && goValid) {
          const rawItems = Array.isArray(rawData) ? rawData : (rawData.data?.matches || rawData.matches || []);
          
          // PHASE 4: Hardened Validation & Adaptive Threshold
          const { validItems, droppedCount, state } = safeBatchValidate(rawItems, GoSoloMatchSchema, requestId);

          if (state !== 'degraded') {
            const transformed = transformMatches(validItems);
            await setMatchingCache(userId, cacheKey, transformed, userVersion);
            await matchingServiceBreaker.recordSuccess();
            
            const filteredMatches = await filterInteractedMatches(userId, transformed);

            return formatStandardResponse(
              { matches: await enrichMatchesWithFollowing(userId, filteredMatches) },
              { 
                source: "go", 
                contractState: state,
                filtered: droppedCount > 0,
                droppedCount,
                degraded: false, 
                hasMore: false 
              },
              { requestId, latencyMs: Date.now() - start }
            );
          } else {
            logger.warn(requestId, "Go response degraded below threshold - Triggering DB Fallback", { validCount: validItems.length, totalCount: rawItems.length });
          }
        }
        await matchingServiceBreaker.recordFailure();
      } catch (err) {
        await matchingServiceBreaker.recordFailure();
        logger.debug(requestId, { error: "Go Service Error", message: err instanceof Error ? err.message : String(err) });
    }
  }

    // 3. Fallback to DB
    const fallbackResults = await performSoloDbMatchingFallback(userId, params);
    const filteredFallback = await filterInteractedMatches(userId, fallbackResults);
    return formatStandardResponse(
      { matches: await enrichMatchesWithFollowing(userId, filteredFallback) },
      { source: "db", degraded: true, hasMore: false },
      { requestId, latencyMs: Date.now() - start }
    );

  } catch (err: any) {
    return formatErrorResponse("Internal failure", ApiErrorCode.INTERNAL_SERVER_ERROR, requestId, 500);
  }
}

/**
 * Detached background refresh for SWR
 */
async function triggerBackgroundRefresh(userId: string, clerkId: string | undefined, version: string, key: string, params: any) {
  if (!(await tryAcquireRefreshLock(key))) return;

  // Fire and forget
  (async () => {
    try {
      const internalHeaders = getInternalAuthHeaders(clerkId || userId, "swr-" + key.slice(-8));
      const goResponse = await fetch(`${GO_URL}/v1/match/solo`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          ...internalHeaders
        },
        body: JSON.stringify({ userId: clerkId || userId, context: params }),
      });

      const rawData = await goResponse.json();
      if (goResponse.ok && validateGoMatchResponse(rawData)) {
        const matches = rawData.data?.matches || rawData.matches || [];
        await setMatchingCache(userId, key, transformMatches(matches), version);
      }
    } catch (err) {
      logger.error("SWR-Background", "SWR Refresh Error", err);
    }
  })().catch(() => {});
}

async function enrichMatchesWithFollowing(userId: string, matches: any[]) {
  if (matches.length === 0) return [];
  const supabase = createRouteHandlerSupabaseClientWithServiceRole();
  const matchUserIds = matches.map(m => m.userId);
  const { data: followings } = await supabase
    .from("user_follows")
    .select("following_id")
    .eq("follower_id", userId)
    .in("following_id", matchUserIds);

  const followingSet = new Set((followings || []).map(f => f.following_id));
  return matches.map(m => ({
    ...m,
    isFollowing: followingSet.has(m.userId)
  }));
}

function transformMatches(rawData: any[]) {
  return rawData.map((item: any) => {
    const res = safeTransform(matchTransformer, item);
    return res.ok ? res.data : null;
  }).filter(Boolean);
}

async function filterInteractedMatches(userId: string, matches: any[]) {
  if (!matches || matches.length === 0) return [];
  const supabase = createRouteHandlerSupabaseClientWithServiceRole();
  
  // Get users I blocked
  const { data: iBlocked } = await supabase.from("blocked_users").select("blocked_id").eq("blocker_id", userId);
  
  // Get users who blocked me
  const { data: theyBlockedMe } = await supabase.from("blocked_users").select("blocker_id").eq("blocked_id", userId);

  // Get users I showed interest in
  const { data: interests } = await supabase.from("match_interests").select("to_user_id").eq("from_user_id", userId).eq("match_type", "solo");

  // Get users who showed interest in me and I accepted or rejected
  const { data: incomingInterests } = await supabase
    .from("match_interests")
    .select("from_user_id")
    .eq("to_user_id", userId)
    .eq("match_type", "solo")
    .in("status", ["accepted", "rejected"]);

  // Get users I skipped
  const { data: skips } = await supabase.from("match_skips").select("skipped_user_id").eq("user_id", userId).eq("match_type", "solo");

  // Get my active matches (so I don't see them in discovery again)
  const { data: matchesA } = await supabase.from("matches").select("user_b_id").eq("user_a_id", userId).eq("match_type", "solo").neq("status", "ended");
  const { data: matchesB } = await supabase.from("matches").select("user_a_id").eq("user_b_id", userId).eq("match_type", "solo").neq("status", "ended");

  // 1. Collect all UUIDs to exclude
  const excludeUuidSet = new Set<string>();
  iBlocked?.forEach(b => excludeUuidSet.add(b.blocked_id));
  theyBlockedMe?.forEach(b => excludeUuidSet.add(b.blocker_id));
  interests?.forEach(i => excludeUuidSet.add(i.to_user_id));
  incomingInterests?.forEach(i => excludeUuidSet.add(i.from_user_id));
  skips?.forEach(s => excludeUuidSet.add(s.skipped_user_id));
  matchesA?.forEach(m => excludeUuidSet.add(m.user_b_id));
  matchesB?.forEach(m => excludeUuidSet.add(m.user_a_id));

  // 2. Resolve those UUIDs to Clerk IDs (Go service returns Clerk IDs)
  const uuidsToResolve = Array.from(excludeUuidSet).filter(id => id.includes("-"));
  let clerkIds = new Set<string>();
  if (uuidsToResolve.length > 0) {
    const { data: usersData } = await supabase.from("users").select("id, clerk_user_id").in("id", uuidsToResolve);
    usersData?.forEach(u => {
      if (u.clerk_user_id) clerkIds.add(u.clerk_user_id);
    });
  }

  // 3. Filter out if m.userId matches EITHER a UUID or a Clerk ID
  return matches.filter(m => {
    const id = m.userId;
    if (!id) return true;
    return !excludeUuidSet.has(id) && !clerkIds.has(id);
  });
}
