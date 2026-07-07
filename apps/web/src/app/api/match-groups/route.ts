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
import { groupTransformer } from "@/lib/transformers/groupTransformer";
import { validateGoMatchResponse, safeBatchValidate } from "@/lib/api/validators/v1/matchValidator";
import { GoGroupMatchSchema } from "@/lib/api/validators/v1/matchSchemas";
import { ApiErrorCode } from "@/types/api";
import { logger } from "@/lib/api/logger";
import { 
  getMatchingCache, 
  setMatchingCache, 
  generateMatchCacheKey,
  tryAcquireRefreshLock 
} from "@/lib/api/matching/cache";
import { matchingServiceBreaker } from "@/lib/api/matching/circuitBreaker";
import { performGroupDbMatchingFallback } from "@/lib/api/matching/fallback";
import { profileMapper } from "@/lib/mappers/profileMapper";

const GO_URL = process.env.GO_SERVICE_URL || "http://localhost:8080";

/**
 * 🏛️ HARDENED GROUP MATCHING API v2
 */
export async function POST(request: NextRequest) {
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

    // Force a fresh fetch to purge the empty cache caused by previous payload failures
    const userVersion = "v1-stable-groups-v10";

    const body = await request.json();
    const { userId: reqUserId, ...payloadContext } = body;
    const cacheKey = generateMatchCacheKey(userId, "group", payloadContext);

    // 1. Try Cache
    const cache = await getMatchingCache(cacheKey);
    if (cache && !cache.isExpired && cache.version === userVersion) {
      if (cache.isStale) {
        triggerBackgroundRefresh(userId, clerkId, userVersion, cacheKey, payloadContext);
      }
      const filteredGroups = await filterInteractedGroups(userId, cache.data);
      return formatStandardResponse(
        { groups: filteredGroups },
        { source: "cache", degraded: false, hasMore: false },
        { requestId, latencyMs: Date.now() - start }
      );
    }

    // 2. Gather Candidates First (Go service acts as a scoring engine for groups)
    const rawCandidates = await performGroupDbMatchingFallback(userId, payloadContext);

    // 3. Try Go Service (ML Scoring)
    const isGoConfigured = !!process.env.GO_SERVICE_URL && !GO_URL.includes("localhost");
    const canUseGoService = isGoConfigured || process.env.NODE_ENV === "development";
    
    if (canUseGoService && rawCandidates.length > 0 && await matchingServiceBreaker.shouldAllowRequest()) {
      try {
        const goPayload = {
          userId: clerkId || userId,
          context: payloadContext,
          candidates: rawCandidates.map((g: any) => ({
            groupId: g.id,
            name: g.name,
            description: g.description,
            destination: { name: g.destination },
            averageBudget: g.budget || g.averageBudget || 0,
            size: g.membersCount,
            privacy: g.is_public ? "public" : "private",
            creator: { 
              userId: g.creatorId,
              name: g.creator?.name || "Unknown",
              username: g.creator?.username || "unknown" 
            }
          })),
          configVersion: "DEFAULT"
        };

        const goResponse = await fetchWithTimeout(`${GO_URL}/v1/match/group`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "X-Request-Id": requestId
          },
          body: JSON.stringify(goPayload),
          timeout: 30000,
        });

        const rawData = await safeParseJson(goResponse);
        if (goResponse.ok && validateGoMatchResponse(rawData)) {
          const rawItems = Array.isArray(rawData) ? rawData : (rawData.groups || []);

          // PHASE 4: Hardened Validation & Adaptive Threshold
          const { validItems, droppedCount, state } = safeBatchValidate(rawItems, GoGroupMatchSchema, requestId);

          // 🛡️ [FALLBACK] Trigger DB if Go returns too few valid matches (< 3)
          if (state === 'degraded' || validItems.length < 3) {
            logger.warn(requestId, "Go group response insufficient (< 3 valid) - Falling back to DB", { 
              validCount: validItems.length,
              state 
            });
            // Continue to DB fallback at the end of the function
          } else {
            // HYDRATION PIPELINE: Merge the stripped Go ML response back onto the rich database candidates
            const hydratedData = validItems.map((goMatch: any) => {
              const parsedGroupId = goMatch.group?.groupId || goMatch.groupId || goMatch.id;
              const originalCandidate = rawCandidates.find((c: any) => c.id === parsedGroupId);
              
              if (!originalCandidate) return null; 
              
              return {
                ...originalCandidate, 
                score: goMatch.score ?? 0.5,
                breakdown: goMatch.breakdown ?? null
              };
            }).filter(Boolean);

            // 🧪 [ENRICHMENT] Batch fetch missing member counts or status
            const enrichedData = await enrichGroups(hydratedData, userId, supabase);
            
            const transformed = transformGroups(enrichedData);
            
            // 🔍 [PRODUCTION LOG] Requested by objective
            logger.info(requestId, "Group Matching Completed", {
              source: "go",
              total: rawItems.length,
              valid: validItems.length,
              dropped: droppedCount,
              contractState: state
            });

            await setMatchingCache(userId, cacheKey, transformed, userVersion);
            await matchingServiceBreaker.recordSuccess();

            const filteredGroups = await filterInteractedGroups(userId, transformed);

            return formatStandardResponse(
              { groups: filteredGroups },
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
          }
        }
        await matchingServiceBreaker.recordFailure();
      } catch (err) {
        await matchingServiceBreaker.recordFailure();
        logger.debug(requestId, { error: "Go Service Error (Group)", message: err instanceof Error ? err.message : String(err) });
    }
  }

    // 4. Fallback: Return Unscored Candidates
    const enrichedCandidates = await enrichGroups(rawCandidates, userId, supabase);
    const transformedCandidates = transformGroups(enrichedCandidates);
    const filteredCandidates = await filterInteractedGroups(userId, transformedCandidates);
    return formatStandardResponse(
      { groups: filteredCandidates },
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
async function triggerBackgroundRefresh(userId: string, clerkId: string | undefined, version: string, key: string, context: any) {
  if (!(await tryAcquireRefreshLock(key))) return;

  (async () => {
    try {
      const goResponse = await fetch(`${GO_URL}/v1/match/group`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: clerkId || userId, context }),
      });

      const rawData = await goResponse.json();
      if (goResponse.ok && validateGoMatchResponse(rawData)) {
        await setMatchingCache(userId, key, transformGroups(rawData), version);
      }
    } catch (err) {
      logger.error("SWR-Background", "SWR Refresh Error (Group)", err);
    }
  })().catch(() => {});
}

function transformGroups(rawData: any[]) {
  return rawData.map((item: any) => {
    const res = safeTransform(groupTransformer, item);
    return res.ok ? res.data : null;
  }).filter(Boolean);
}

/**
 * 🧪 BATCH ENRICHMENT LAYER
 * Fetches memberCount and userStatus in ONE query for all groups.
 */
async function enrichGroups(groups: any[], currentUserId: string, supabase: any) {
  const groupIds = groups.map(g => g.id).filter(Boolean);
  const creatorIds = groups.map(g => g.creatorId || g.creator_id).filter(Boolean);
  
  if (groupIds.length === 0) return groups;

  try {
    // 1. Fetch member counts
    const { data: memberCounts, error: countError } = await supabase
      .from("group_memberships")
      .select("group_id")
      .in("group_id", groupIds);

    // 2. Fetch current user's status in these groups
    const { data: userMemberships, error: memberError } = await supabase
      .from("group_memberships")
      .select("group_id, role, status")
      .eq("user_id", currentUserId)
      .in("group_id", groupIds);

    // 3. 🏛️ HYDRATE CREATORS (JOINed fetch with identity master)
    const { data: creatorRows } = creatorIds.length > 0 
      ? await supabase.from("users").select("*, profiles(*)").in("id", creatorIds)
      : { data: [] };

    const creatorMap = (creatorRows || []).reduce((acc: any, curr: any) => {
      // Map via standardized logic
      acc[curr.id] = profileMapper.fromDb(curr, curr.profiles);
      return acc;
    }, {});

    if (countError || memberError) throw new Error("Enrichment query failed");

    // 4. Map aggregates
    const countMap = memberCounts.reduce((acc: any, curr: any) => {
      acc[curr.group_id] = (acc[curr.group_id] || 0) + 1;
      return acc;
    }, {});

    const statusMap = userMemberships.reduce((acc: any, curr: any) => {
      acc[curr.group_id] = curr.status; 
      return acc;
    }, {});

    // 5. Merge back
    return groups.map(g => {
      const cid = g.creatorId || g.creator_id;
      const creatorDto = creatorMap[cid];

      return {
        ...g,
        memberCount: g.memberCount || countMap[g.id] || 0,
        userStatus: g.userStatus || statusMap[g.id] || null,
        creator: creatorDto ? {
          userId: creatorDto.id,
          name: creatorDto.displayName,
          username: creatorDto.username,
          avatar: creatorDto.avatar,
          age: creatorDto.age,
          gender: creatorDto.gender,
          location: creatorDto.location,
          bio: creatorDto.bio,
          interests: creatorDto.interests,
          languages: creatorDto.languages,
          nationality: creatorDto.nationality,
          religion: creatorDto.religion,
          profession: creatorDto.profession,
          smoking: creatorDto.smoking,
          drinking: creatorDto.drinking,
          personality: creatorDto.personality,
          foodPreference: creatorDto.foodPreference
        } : (g.creator || { name: "Traveler" })
      };
    });

  } catch (err) {
    logger.warn("Enrichment", "Batch enrichment failed, using available data", err);
    return groups;
  }
}

async function filterInteractedGroups(userId: string, groups: any[]) {
  if (!groups || groups.length === 0) return [];
  const supabase = createRouteHandlerSupabaseClientWithServiceRole();
  
  // Get caller's internal status
  const { data: callerUser } = await supabase.from("users").select("is_internal").eq("id", userId).single();
  const isCallerInternal = callerUser?.is_internal || false;

  const creatorIds = groups.map(g => g.creatorId || g.creator_id || g.creator?.userId).filter(Boolean);
  const internalCreatorSet = new Set<string>();

  if (creatorIds.length > 0) {
    const { data: creators } = await supabase
      .from("users")
      .select("id, is_internal")
      .in("id", creatorIds);
    creators?.forEach(u => {
      if (isCallerInternal ? !u.is_internal : u.is_internal) {
        internalCreatorSet.add(u.id);
      }
    });
  }

  // Get users I blocked
  const { data: iBlocked } = await supabase.from("blocked_users").select("blocked_id").eq("blocker_id", userId);
  
  // Get users who blocked me
  const { data: theyBlockedMe } = await supabase.from("blocked_users").select("blocker_id").eq("blocked_id", userId);

  // Get groups I showed interest in
  const { data: interests } = await supabase.from("match_interests").select("to_user_id").eq("from_user_id", userId).eq("match_type", "group");

  // Get groups I skipped
  const { data: skips } = await supabase.from("match_skips").select("skipped_user_id").eq("user_id", userId).eq("match_type", "group");

  // Get groups I am already a member of or requested to join
  const { data: memberships } = await supabase.from("group_memberships").select("group_id").eq("user_id", userId);

  const blockedUserSet = new Set<string>();
  iBlocked?.forEach((b: any) => blockedUserSet.add(b.blocked_id));
  theyBlockedMe?.forEach((b: any) => blockedUserSet.add(b.blocker_id));

  const excludeGroupSet = new Set<string>();
  interests?.forEach(i => excludeGroupSet.add(i.to_user_id));
  skips?.forEach(s => excludeGroupSet.add(s.skipped_user_id));
  memberships?.forEach(m => excludeGroupSet.add(m.group_id));

  return groups.filter(g => {
    const creatorId = g.creatorId || g.creator_id || g.creator?.userId;
    const groupId = g.id || g.groupId;
    
    if (creatorId && blockedUserSet.has(creatorId)) return false;
    if (creatorId && internalCreatorSet.has(creatorId)) return false;
    if (groupId && excludeGroupSet.has(groupId)) return false;
    
    return true;
  });
}
