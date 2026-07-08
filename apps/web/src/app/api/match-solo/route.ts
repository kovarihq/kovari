import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { resolveUser } from "@/lib/auth/resolveUser";
import { 
  createRouteHandlerSupabaseClientWithServiceRole, 
  isActiveBan,
  ensureRedisConnection,
  redis,
  getCoordinatesForLocation,
  getUserProfile
} from "@kovari/api";
import { getSetting } from "@kovari/utils";
import { SoloSession } from "@kovari/types";
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
import { getOrSetInteractionCache } from "@/lib/api/matching/interactionCache";
import { logPerformanceMetric } from "@/lib/observability/performance";

const GO_URL = process.env.GO_SERVICE_URL || "http://localhost:8080";

// Mock user data for testing
const mockUsers: Record<string, any> = {
  user_1: {
    age: 25,
    gender: "female",
    personality: "extrovert",
    location: { lat: 19.076, lon: 72.8777 }, // Mumbai
    smoking: "no",
    drinking: "socially",
    religion: "hindu",
    interests: ["travel", "photography", "food"],
    language: "english",
    nationality: "indian",
    profession: "software_engineer",
  },
  user_2: {
    age: 28,
    gender: "male",
    personality: "ambivert",
    location: { lat: 19.076, lon: 72.8777 }, // Mumbai
    smoking: "no",
    drinking: "socially",
    religion: "agnostic",
    interests: ["travel", "photography", "adventure"],
    language: "english",
    nationality: "indian",
    profession: "designer",
  },
  user_3: {
    age: 30,
    gender: "female",
    personality: "introvert",
    location: { lat: 28.7041, lon: 77.1025 }, // Delhi
    smoking: "no",
    drinking: "no",
    religion: "hindu",
    interests: ["travel", "culture", "history"],
    language: "english",
    nationality: "indian",
    profession: "teacher",
  },
  user_basic_test: {
    age: 25,
    gender: "female",
    personality: "extrovert",
    location: { lat: 19.076, lon: 72.8777 }, // Mumbai
    smoking: "no",
    drinking: "socially",
    religion: "hindu",
    interests: ["travel", "photography", "food"],
    language: "english",
    nationality: "indian",
    profession: "software_engineer",
  },
  user_status_test: {
    age: 25,
    gender: "female",
    personality: "extrovert",
    location: { lat: 19.076, lon: 72.8777 }, // Mumbai
    smoking: "no",
    drinking: "socially",
    religion: "hindu",
    interests: ["travel", "photography", "food"],
    language: "english",
    nationality: "indian",
    profession: "software_engineer",
  },
  user_test_fix_1: {
    age: 25,
    gender: "male",
    personality: "extrovert",
    location: { lat: 19.076, lon: 72.8777 }, // Mumbai
    smoking: "no",
    drinking: "socially",
    religion: "hindu",
    interests: ["travel", "adventure", "food"],
    language: "english",
    nationality: "indian",
    profession: "software_engineer",
  },
  user_test_fix_2: {
    age: 28,
    gender: "female",
    personality: "ambivert",
    location: { lat: 19.076, lon: 72.8777 }, // Mumbai
    smoking: "no",
    drinking: "socially",
    religion: "christian",
    interests: ["travel", "culture", "photography"],
    language: "english",
    nationality: "indian",
    profession: "designer",
  },
  user_test_fix_3: {
    age: 30,
    gender: "male",
    personality: "introvert",
    location: { lat: 28.7041, lon: 77.1025 }, // Delhi
    smoking: "no",
    drinking: "no",
    religion: "hindu",
    interests: ["travel", "history", "museums"],
    language: "english",
    nationality: "indian",
    profession: "teacher",
  },
  user_test_no_overlap: {
    age: 27,
    gender: "female",
    personality: "extrovert",
    location: { lat: 19.076, lon: 72.8777 }, // Mumbai
    smoking: "no",
    drinking: "socially",
    religion: "hindu",
    interests: ["travel", "nightlife", "shopping"],
    language: "english",
    nationality: "indian",
    profession: "marketing",
  },
  user_real_test: {
    age: 25,
    gender: "male",
    personality: "extrovert",
    location: { lat: 28.7041, lon: 77.1025 }, // Delhi - user's home location
    smoking: "no",
    drinking: "socially",
    religion: "hindu",
    interests: ["travel", "adventure", "food"],
    language: "english",
    nationality: "indian",
    profession: "software_engineer",
  },
  user_test_overlap: {
    age: 28,
    gender: "female",
    personality: "ambivert",
    location: { lat: 19.076, lon: 72.8777 }, // Mumbai - different home location
    smoking: "no",
    drinking: "socially",
    religion: "christian",
    interests: ["travel", "culture", "photography"],
    language: "english",
    nationality: "indian",
    profession: "designer",
  },
  user_august_1: {
    age: 26,
    gender: "male",
    personality: "extrovert",
    location: { lat: 12.9716, lon: 77.5946 }, // Bangalore
    smoking: "no",
    drinking: "socially",
    religion: "hindu",
    interests: ["travel", "adventure", "food"],
    language: "english",
    nationality: "indian",
    profession: "software_engineer",
  },
  user_august_2: {
    age: 24,
    gender: "female",
    personality: "ambivert",
    location: { lat: 13.0827, lon: 80.2707 }, // Chennai
    smoking: "no",
    drinking: "no",
    religion: "hindu",
    interests: ["travel", "culture", "photography"],
    language: "english",
    nationality: "indian",
    profession: "designer",
  },
  user_august_3: {
    age: 29,
    gender: "male",
    personality: "introvert",
    location: { lat: 17.385, lon: 78.4867 }, // Hyderabad
    smoking: "no",
    drinking: "socially",
    religion: "muslim",
    interests: ["travel", "history", "museums"],
    language: "english",
    nationality: "indian",
    profession: "teacher",
  },
  user_august_4: {
    age: 27,
    gender: "female",
    personality: "extrovert",
    location: { lat: 15.2993, lon: 74.124 }, // Goa
    smoking: "no",
    drinking: "socially",
    religion: "christian",
    interests: ["travel", "beach", "nightlife"],
    language: "english",
    nationality: "indian",
    profession: "marketing",
  },
  user_real_august: {
    age: 25,
    gender: "male",
    personality: "extrovert",
    location: { lat: 28.7041, lon: 77.1025 }, // Delhi - user's home location
    smoking: "no",
    drinking: "socially",
    religion: "hindu",
    interests: ["travel", "adventure", "food"],
    language: "english",
    nationality: "indian",
    profession: "software_engineer",
  },
  user_mumbai_1: {
    age: 28,
    gender: "female",
    personality: "ambivert",
    location: { lat: 28.7041, lon: 77.1025 }, // Delhi - traveling TO Mumbai
    smoking: "no",
    drinking: "socially",
    religion: "christian",
    interests: ["culture", "photography", "art"],
    language: "english",
    languages: ["english", "hindi"],
    nationality: "indian",
    profession: "ui_ux_designer",
    avatar:
      "https://images.unsplash.com/photo-1494790108755-2616b612b786?w=150&h=150&fit=crop&crop=face",
  },
  user_mumbai_2: {
    age: 30,
    gender: "male",
    personality: "introvert",
    location: { lat: 12.9716, lon: 77.5946 }, // Bangalore - traveling TO Mumbai
    smoking: "no",
    drinking: "no",
    religion: "hindu",
    interests: ["history", "culture", "architecture"],
    language: "english",
    languages: ["english", "hindi", "kannada"],
    nationality: "indian",
    profession: "history_teacher",
    avatar:
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face",
  },
  user_mumbai_3: {
    age: 26,
    gender: "female",
    personality: "extrovert",
    location: { lat: 13.0827, lon: 80.2707 }, // Chennai - traveling TO Mumbai
    smoking: "no",
    drinking: "socially",
    religion: "hindu",
    interests: ["food", "nightlife", "shopping"],
    language: "english",
    languages: ["english", "hindi", "tamil"],
    nationality: "indian",
    profession: "marketing_manager",
    avatar:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face",
  },
  user_mumbai_4: {
    age: 27,
    gender: "male",
    personality: "ambivert",
    location: { lat: 17.385, lon: 78.4867 }, // Hyderabad - traveling TO Mumbai
    smoking: "no",
    drinking: "socially",
    religion: "agnostic",
    interests: ["nature", "photography", "hiking"],
    language: "english",
    languages: ["english", "hindi", "telugu"],
    nationality: "indian",
    profession: "full_stack_developer",
    avatar:
      "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face",
  },
  user_mumbai_5: {
    age: 29,
    gender: "female",
    personality: "introvert",
    location: { lat: 15.2993, lon: 74.124 }, // Goa - traveling TO Mumbai
    smoking: "no",
    drinking: "no",
    religion: "christian",
    interests: ["architecture", "art", "design"],
    language: "english",
    languages: ["english", "hindi", "konkani"],
    nationality: "indian",
    profession: "architect",
    avatar:
      "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&h=150&fit=crop&crop=face",
  },
};

let cachedTtlHours: number | null = null;
let lastTtlFetchTime = 0;

async function getSessionTtlSeconds(): Promise<number> {
  const now = Date.now();
  if (cachedTtlHours !== null && now - lastTtlFetchTime < 300000) { // 5-minute cache
    return cachedTtlHours * 3600;
  }
  const fetchTtl = async () => {
    try {
      const ttlSetting = await getSetting("session_ttl_hours");
      const hours = (ttlSetting as { hours: number } | null)?.hours || 168;
      cachedTtlHours = hours;
      lastTtlFetchTime = Date.now();
    } catch (e) {
      // Ignored
    }
  };
  if (cachedTtlHours === null) {
    try {
      await fetchTtl();
    } catch (e) {
      cachedTtlHours = 168;
    }
  } else {
    fetchTtl().catch(() => {});
  }
  return (cachedTtlHours || 168) * 3600;
}

/**
 * Server-side helper to ensure the user's matching session is persisted in Redis
 * before we call the Go matching service.
 */
async function ensureSessionInitialized(
  userId: string,
  params: Record<string, string>
) {
  const redisClient = await ensureRedisConnection();
  const sessionKey = `session:${userId}`;
  const existingRaw = await redisClient.get(sessionKey);
  
  let existingSession: SoloSession | null = null;
  if (existingRaw) {
    try {
      existingSession = JSON.parse(existingRaw);
    } catch (e) {
      // Ignored
    }
  }

  // Parse incoming parameters
  const incomingDestinationName = params.destination || "";
  const incomingBudget = params.budget ? Number(params.budget) : 20000;
  
  const formatDate = (dStr?: string) => {
    if (!dStr) return "";
    try {
      const d = new Date(dStr);
      return d.toISOString().split("T")[0];
    } catch (e) {
      return dStr.split("T")[0];
    }
  };
  
  const incomingStartDate = formatDate(params.dateStart) || formatDate(new Date().toISOString());
  const incomingEndDate = formatDate(params.dateEnd) || formatDate(new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString());
  
  let incomingDestDetails: any = null;
  if (params.destinationDetails) {
    try {
      incomingDestDetails = JSON.parse(params.destinationDetails);
    } catch (e) {
      // Ignored
    }
  }

  // Optimize: If existing session perfectly matches, skip DB/Supabase/Redis writes
  if (existingSession) {
    const datesMatch = existingSession.startDate === incomingStartDate && existingSession.endDate === incomingEndDate;
    const budgetMatches = existingSession.budget === incomingBudget;
    
    let destMatches = false;
    if (incomingDestDetails && incomingDestDetails.lat && incomingDestDetails.lon) {
      destMatches = existingSession.destination?.lat === incomingDestDetails.lat && 
                    existingSession.destination?.lon === incomingDestDetails.lon &&
                    existingSession.destination?.name === (incomingDestDetails.name || incomingDestDetails.formatted || incomingDestinationName);
    } else {
      destMatches = existingSession.destination?.name === (incomingDestinationName || "Global");
    }
    
    if (datesMatch && budgetMatches && destMatches) {
      return; // Session is already correct and in Redis
    }
  }

  // FAST-PATH: Reuse static attributes if existing session exists
  if (existingSession) {
    let destinationCoords = { lat: 0, lon: 0 };
    let finalDestinationName = incomingDestinationName;

    // If destination name is the same, reuse coordinates from existing session
    if (existingSession.destination?.name === (incomingDestinationName || "Global")) {
      destinationCoords = {
        lat: existingSession.destination?.lat || 0,
        lon: existingSession.destination?.lon || 0
      };
      finalDestinationName = existingSession.destination?.name;
    } else if (incomingDestDetails && incomingDestDetails.lat && incomingDestDetails.lon) {
      destinationCoords = {
        lat: incomingDestDetails.lat,
        lon: incomingDestDetails.lon
      };
      if (incomingDestDetails.name || incomingDestDetails.formatted) {
        finalDestinationName = incomingDestDetails.name || incomingDestDetails.formatted;
      }
    } else if (incomingDestinationName && incomingDestinationName.trim() !== "") {
      const resolved = await getCoordinatesForLocation(incomingDestinationName);
      if (resolved) {
        destinationCoords = resolved;
      }
    }

    const sessionData: SoloSession = {
      userId,
      destination: { 
        name: finalDestinationName || "Global", 
        lat: destinationCoords.lat, 
        lon: destinationCoords.lon 
      },
      budget: incomingBudget,
      startDate: incomingStartDate,
      endDate: incomingEndDate,
      mode: "solo",
      interests: existingSession.interests || ["travel", "exploration"],
      location: existingSession.location || null,
      geoSource: existingSession.geoSource || "pending",
    };

    const ttlSeconds = await getSessionTtlSeconds();
    await redisClient.setEx(
      sessionKey,
      ttlSeconds,
      JSON.stringify(sessionData)
    );

    // Track session metrics in background (non-blocking)
    (async () => {
      try {
        await redisClient.sAdd("sessions:index", userId);
        await redisClient.incr("metrics:sessions:created:1h");
        await redisClient.expire("metrics:sessions:created:1h", 3600);
      } catch (e) {
        // Ignored
      }
    })().catch(() => {});

    return;
  }

  // SLOW-PATH: Session does not exist in Redis, fetch from DB
  const [userProfile, destinationCoords] = await Promise.all([
    (async () => {
      const profileStart = Date.now();
      let profile;
      if (userId.startsWith("user_") && mockUsers[userId]) {
        profile = mockUsers[userId];
      } else {
        profile = await getUserProfile(userId);
      }
      logPerformanceMetric("match_solo_route_profile_fetch_ms", Date.now() - profileStart, { userId });
      return profile;
    })(),
    (async () => {
      if (incomingDestDetails && incomingDestDetails.lat && incomingDestDetails.lon) {
        let name = incomingDestinationName;
        if (incomingDestDetails.name || incomingDestDetails.formatted) {
          name = incomingDestDetails.name || incomingDestDetails.formatted;
        }
        return { name: name || "Global", lat: incomingDestDetails.lat, lon: incomingDestDetails.lon };
      } else if (incomingDestinationName && incomingDestinationName.trim() !== "") {
        const resolved = await getCoordinatesForLocation(incomingDestinationName);
        return {
          name: incomingDestinationName,
          lat: resolved ? resolved.lat : 0,
          lon: resolved ? resolved.lon : 0
        };
      }
      return { name: "Global", lat: 0, lon: 0 };
    })()
  ]);

  if (!userProfile) {
    throw new Error(`Profile not found for user: ${userId}`);
  }

  // Home coordinates resolution logic
  let userHomeCoords = null;
  let homeGeoSource = "pending";
  const profileLocation = userProfile.location;

  if (profileLocation) {
    if (typeof profileLocation !== "string" && profileLocation.lat && profileLocation.lon) {
      userHomeCoords = { lat: profileLocation.lat, lon: profileLocation.lon };
      homeGeoSource = "resolved";
    }
  }

  const sessionData: SoloSession = {
    userId,
    destination: { 
      name: destinationCoords.name || "Global", 
      lat: destinationCoords.lat, 
      lon: destinationCoords.lon 
    },
    budget: incomingBudget,
    startDate: incomingStartDate,
    endDate: incomingEndDate,
    mode: "solo",
    interests: userProfile.interests || ["travel", "exploration"],
    location: userHomeCoords,
    geoSource: homeGeoSource,
  };

  const ttlSeconds = await getSessionTtlSeconds();
  await redisClient.setEx(
    sessionKey,
    ttlSeconds,
    JSON.stringify(sessionData)
  );

  // Trigger background tasks: home coordinates resolution & metrics tracking
  (async () => {
    try {
      // 1. Home location geocoding if it is a string location
      if (profileLocation && typeof profileLocation === "string" && profileLocation.trim() !== "") {
        const coords = await getCoordinatesForLocation(profileLocation);
        if (coords) {
          const freshRaw = await redisClient.get(sessionKey);
          if (freshRaw) {
            const currentSession = JSON.parse(freshRaw);
            // Ensure we don't overwrite if it was since updated
            if (currentSession && (!currentSession.location || (currentSession.location.lat === 0 && currentSession.location.lon === 0))) {
              currentSession.location = coords;
              currentSession.geoSource = "resolved";
              await redisClient.setEx(sessionKey, ttlSeconds, JSON.stringify(currentSession));
            }
          }
        }
      }
    } catch (e) {
      // Ignored
    }
  })().catch(() => {});

  (async () => {
    try {
      // 2. Metrics tracking
      await redisClient.sAdd("sessions:index", userId);
      await redisClient.incr("metrics:sessions:created:1h");
      await redisClient.expire("metrics:sessions:created:1h", 3600);
    } catch (e) {
      // Ignored
    }
  })().catch(() => {});
}

/**
 * 🏛️ HARDENED SOLO MATCHING API v2
 */
export async function GET(request: NextRequest) {
  const start = Date.now();
  const requestId = request.headers.get("X-Request-Id") || generateRequestId();
  const { client } = detectClient(request);

  if (requestId) {
    try {
      await ensureRedisConnection();
      const replayKey = `replay:${requestId}`;
      const setSuccess = await redis.set(replayKey, "1", { NX: true, EX: 60 });
      if (setSuccess !== "OK") {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "REPLAY_ATTACK",
              message: "Replay attack detected"
            },
            meta: { requestId }
          },
          { status: 403 }
        );
      }
    } catch (err) {
      // Gracefully continue if Redis fails for replay check
    }
  }

  try {
    const authStart = Date.now();
    const authResult = await resolveUser(request, { mode: 'protected' });
    logPerformanceMetric("match_solo_route_auth_resolve_ms", Date.now() - authStart, { requestId });
    if (!authResult.ok || !authResult.user) return formatErrorResponse("Unauthorized", ApiErrorCode.UNAUTHORIZED, requestId, 401);

    const userId = authResult.user.userId;
    const clerkId = authResult.user.providerId;

    const supabase = createRouteHandlerSupabaseClientWithServiceRole();

    // Bumped to force invalidation of caches containing duplicate entries (UUID + Clerk ID per user)
    const userVersion = "v1-stable-final-v11";

    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());
    const cacheKey = generateMatchCacheKey(userId, "solo", params);

    // 1. Try Cache
    const cacheStart = Date.now();
    
    // TEST HOOKS: Simulate Slow Redis & Redis Unavailable
    if (request.headers.get("X-Simulate-Slow-Redis") === "true") {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    let cache;
    if (request.headers.get("X-Simulate-Redis-Unavailable") === "true") {
      cache = null;
    } else {
      cache = await getMatchingCache(cacheKey);
    }
    
    logPerformanceMetric("match_solo_route_cache_get_ms", Date.now() - cacheStart, { requestId });
    if (cache && !cache.isExpired && cache.version === userVersion) {
      console.log("DEBUG CACHE GET data count:", cache.data?.length, "items:", JSON.stringify(cache.data));
      // SWR Trigger: If stale, refresh in background
      if (cache.isStale) {
        triggerBackgroundRefresh(userId, clerkId, userVersion, cacheKey, params);
      }
      const filterStart = Date.now();
      const filteredMatches = await filterInteractedMatches(userId, cache.data);
      logPerformanceMetric("match_solo_route_cache_filtering_ms", Date.now() - filterStart, { requestId });

      const enrichStart = Date.now();
      const enriched = await enrichMatchesWithFollowing(userId, filteredMatches);
      logPerformanceMetric("match_solo_route_cache_enrich_following_ms", Date.now() - enrichStart, { requestId });

      const totalRouteTime = Date.now() - start;
      logPerformanceMetric("match_solo_route_total_execution_ms", totalRouteTime, { requestId, cacheHit: true });

      const serializationStart = Date.now();
      const formattedResponse = formatStandardResponse(
        { matches: enriched },
        { source: "cache", degraded: false, hasMore: false },
        { requestId, latencyMs: totalRouteTime }
      );
      logPerformanceMetric("match_solo_route_response_serialization_ms", Date.now() - serializationStart, { requestId });
      return formattedResponse;
    }

    // Initialize or sync Redis matching session synchronously before calling Go matching service
    const sessionInitStart = Date.now();
    try {
      if (request.headers.get("X-Simulate-Redis-Unavailable") === "true") {
        throw new Error("Redis connection failed");
      }
      if (request.headers.get("X-Simulate-Slow-Redis") === "true") {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      await ensureSessionInitialized(clerkId || userId, params);
    } catch (sessionErr: any) {
      logger.warn(requestId, "Session synchronization failed, continuing matching", {
        userId: clerkId || userId,
        error: sessionErr?.message || String(sessionErr),
      });
    } finally {
      logPerformanceMetric("match_solo_route_session_init_ms", Date.now() - sessionInitStart, { requestId });
    }

    // 2. Try Go Service (with Circuit Breaker)
    const isGoConfigured = !!process.env.GO_SERVICE_URL && !GO_URL.includes("localhost");
    const canUseGoService = isGoConfigured || process.env.NODE_ENV === "development";
    
    if (canUseGoService) {
      if (process.env.NODE_ENV === "development" && request.headers.has("X-Reset-Circuit-Breaker")) {
        await matchingServiceBreaker.reset();
      }
      const cbStart = Date.now();
      const circuitAllowed = await matchingServiceBreaker.shouldAllowRequest();
      logPerformanceMetric("match_solo_route_cb_check_ms", Date.now() - cbStart, { requestId });

      if (circuitAllowed) {
        try {
          // TEST HOOK: Simulate Slow Go
          if (request.headers.get("X-Simulate-Slow-Go") === "true") {
            await new Promise(resolve => setTimeout(resolve, 5000));
          }

          const internalHeaders = getInternalAuthHeaders(clerkId || userId, requestId);

          const fetchStart = Date.now();
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
          logPerformanceMetric("match_solo_route_go_service_fetch_ms", Date.now() - fetchStart, { requestId });

          const goResponseTimeHeader = goResponse.headers.get("X-Response-Time") || "";
          const goExecutionMs = parseInt(goResponseTimeHeader, 10) || 0;
          logPerformanceMetric("match_solo_route_go_execution_ms", goExecutionMs, { requestId });

          const validationStart = Date.now();
          const goValid = validateGoMatchResponse(rawData);
          logPerformanceMetric("match_solo_route_go_validation_check_ms", Date.now() - validationStart, { requestId });

          logger.debug(requestId, { 
            source: "Go Service Raw Response",
            ok: goResponse.ok, 
            valid: goValid,
            rawItemCount: (rawData?.matches || rawData)?.length || 0 
          });

          if (goResponse.ok && goValid) {
            const rawItems = Array.isArray(rawData) ? rawData : (rawData.data?.matches || rawData.matches || []);
            
            // PHASE 4: Hardened Validation & Adaptive Threshold
            const zodStart = Date.now();
            const { validItems, droppedCount, state } = safeBatchValidate(rawItems, GoSoloMatchSchema, requestId);
            logPerformanceMetric("match_solo_route_zod_validate_ms", Date.now() - zodStart, { requestId });

            if (state !== 'degraded') {
              const transformStart = Date.now();
              const transformed = transformMatches(validItems);
              logPerformanceMetric("match_solo_route_transform_ms", Date.now() - transformStart, { requestId });

              const setCacheStart = Date.now();
              await setMatchingCache(userId, cacheKey, transformed, userVersion);
              logPerformanceMetric("match_solo_route_set_cache_ms", Date.now() - setCacheStart, { requestId });

              await matchingServiceBreaker.recordSuccess();
              
              const filterStart = Date.now();
              const filteredMatches = await filterInteractedMatches(userId, transformed);
              logPerformanceMetric("match_solo_route_go_filtering_ms", Date.now() - filterStart, { requestId });

              const enrichStart = Date.now();
              const enriched = await enrichMatchesWithFollowing(userId, filteredMatches);
              logPerformanceMetric("match_solo_route_go_enrich_following_ms", Date.now() - enrichStart, { requestId });

              const totalRouteTime = Date.now() - start;
              logPerformanceMetric("match_solo_route_total_execution_ms", totalRouteTime, { requestId, cacheHit: false });

              const serializationStart = Date.now();
              const formattedResponse = formatStandardResponse(
                { matches: enriched },
                { 
                  source: "go", 
                  contractState: state,
                  filtered: droppedCount > 0,
                  droppedCount,
                  degraded: false, 
                  hasMore: false 
                },
                { requestId, latencyMs: totalRouteTime }
              );
              logPerformanceMetric("match_solo_route_response_serialization_ms", Date.now() - serializationStart, { requestId });
              return formattedResponse;
            } else {
              logger.warn(requestId, "Go response degraded below threshold - Triggering DB Fallback", { validCount: validItems.length, totalCount: rawItems.length });
            }
          } else {
            if (goResponse.status === 403) {
              return NextResponse.json(
                {
                  success: false,
                  error: {
                    code: rawData?.error?.code || "FORBIDDEN",
                    message: rawData?.error?.message || "Forbidden"
                  },
                  meta: {
                    requestId
                  }
                },
                { status: 403 }
              );
            }
            await matchingServiceBreaker.recordFailure();
          }
        } catch (err) {
          await matchingServiceBreaker.recordFailure();
          logger.debug(requestId, { error: "Go Service Error", message: err instanceof Error ? err.message : String(err) });
        }
      } else {
        // Circuit breaker is open
        const totalRouteTime = Date.now() - start;
        logPerformanceMetric("match_solo_route_total_execution_ms", totalRouteTime, { requestId, cbOpen: true });
        return formatErrorResponse("Service Unavailable", ApiErrorCode.SERVICE_UNAVAILABLE, requestId, 503);
      }
    }

    // 3. Fallback to DB
    const fallbackDbStart = Date.now();
    
    // TEST HOOK: Simulate Slow Supabase
    if (request.headers.get("X-Simulate-Slow-Supabase") === "true") {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    let fallbackResults;
    if (request.headers.get("X-Simulate-Supabase-Timeout") === "true") {
      throw new Error("Supabase query timeout");
    } else {
      fallbackResults = await performSoloDbMatchingFallback(userId, params);
    }
    
    logPerformanceMetric("match_solo_route_fallback_db_query_ms", Date.now() - fallbackDbStart, { requestId });

    const filterStart = Date.now();
    const filteredFallback = await filterInteractedMatches(userId, fallbackResults);
    logPerformanceMetric("match_solo_route_fallback_filtering_ms", Date.now() - filterStart, { requestId });

    const enrichStart = Date.now();
    const enriched = await enrichMatchesWithFollowing(userId, filteredFallback);
    logPerformanceMetric("match_solo_route_fallback_enrich_following_ms", Date.now() - enrichStart, { requestId });

    const totalRouteTime = Date.now() - start;
    logPerformanceMetric("match_solo_route_total_execution_ms", totalRouteTime, { requestId, fallbackUsed: true });

    const serializationStart = Date.now();
    const formattedResponse = formatStandardResponse(
      { matches: enriched },
      { source: "db", degraded: true, hasMore: false },
      { requestId, latencyMs: totalRouteTime }
    );
    logPerformanceMetric("match_solo_route_response_serialization_ms", Date.now() - serializationStart, { requestId });
    return formattedResponse;

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
      try {
        await ensureSessionInitialized(userId, params);
      } catch (sessionErr: any) {
        logger.error("SWR-Background", "SWR Session synchronization failed, continuing", sessionErr);
      }

      const internalHeaders = getInternalAuthHeaders(clerkId || userId, crypto.randomUUID());
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
  const start = Date.now();
  const supabase = createRouteHandlerSupabaseClientWithServiceRole();
  
  const followings = await getOrSetInteractionCache(userId, "follows", async () => {
    const { data } = await supabase
      .from("user_follows")
      .select("following_id")
      .eq("follower_id", userId);
    return data || [];
  });
  
  logPerformanceMetric("match_solo_route_db_query_follows_ms", Date.now() - start, { userId });

  const followingSet = new Set((followings || []).map((f: any) => f.following_id));
  return matches.map(m => ({
    ...m,
    isFollowing: followingSet.has(m.userId)
  }));
}

function transformMatches(rawData: any[]) {
  const transformed = rawData.map((item: any) => {
    const res = safeTransform(matchTransformer, item);
    return res.ok ? res.data : null;
  }).filter(Boolean);

  // Deduplicate: The Go service can return the same user twice with different ID formats
  // (once with a DB UUID, once with a Clerk ID). Keep the first occurrence per unique userId.
  const seenUserIds = new Set<string>();
  return transformed.filter((m: any) => {
    // Collect all identity tokens for this match
    const tokens = [m.userId, m.id, m.user?.userId].filter(Boolean);
    // If any token was already seen, this is a duplicate
    for (const token of tokens) {
      if (seenUserIds.has(token)) return false;
    }
    // Register all tokens
    for (const token of tokens) {
      seenUserIds.add(token);
    }
    return true;
  });
}

async function filterInteractedMatches(userId: string, matches: any[]) {
  if (!matches || matches.length === 0) return [];
  const totalStart = Date.now();
  const supabase = createRouteHandlerSupabaseClientWithServiceRole();
  
  // Get exclusions via cached, parallelized database queries
  const qStart = Date.now();
  
  const [iBlocked, interests, skips, matchesData] = await Promise.all([
    getOrSetInteractionCache(userId, "blocks", async () => {
      const { data } = await supabase
        .from("blocked_users")
        .select("blocker_id, blocked_id")
        .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
      return data || [];
    }),
    getOrSetInteractionCache(userId, "interests", async () => {
      const { data } = await supabase
        .from("match_interests")
        .select("from_user_id, to_user_id, status")
        .eq("match_type", "solo")
        .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);
      return data || [];
    }),
    getOrSetInteractionCache(userId, "skips", async () => {
      const { data } = await supabase
        .from("match_skips")
        .select("skipped_user_id")
        .eq("user_id", userId)
        .eq("match_type", "solo");
      return data || [];
    }),
    getOrSetInteractionCache(userId, "matches", async () => {
      const { data } = await supabase
        .from("matches")
        .select("user_a_id, user_b_id")
        .eq("match_type", "solo")
        .neq("status", "ended")
        .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`);
      return data || [];
    })
  ]);

  const parallelTime = Date.now() - qStart;
  // Log all historical query metric names with the parallel duration for backward compatibility
  logPerformanceMetric("match_solo_route_db_query_blocked_by_me_ms", parallelTime, { userId });
  logPerformanceMetric("match_solo_route_db_query_blocked_me_ms", parallelTime, { userId });
  logPerformanceMetric("match_solo_route_db_query_my_interests_ms", parallelTime, { userId });
  logPerformanceMetric("match_solo_route_db_query_incoming_interests_ms", parallelTime, { userId });
  logPerformanceMetric("match_solo_route_db_query_my_skips_ms", parallelTime, { userId });
  logPerformanceMetric("match_solo_route_db_query_matches_active_ms", parallelTime, { userId });

  // Get caller's internal status
  const { data: callerUser } = await supabase.from("users").select("is_internal").eq("id", userId).single();
  const isCallerInternal = callerUser?.is_internal || false;

  // Find match user IDs
  const matchUserIds = matches.map(m => m.userId || m.id).filter(Boolean);
  const internalUserSet = new Set<string>();

  if (matchUserIds.length > 0) {
    const uuidCandidates = matchUserIds.filter(id => id.includes("-"));
    const clerkCandidates = matchUserIds.filter(id => !id.includes("-"));
    const conditions = [];
    if (uuidCandidates.length > 0) conditions.push(`id.in.(${uuidCandidates.join(",")})`);
    if (clerkCandidates.length > 0) conditions.push(`clerk_user_id.in.(${clerkCandidates.join(",")})`);

    if (conditions.length > 0) {
      const { data: matchedUsers } = await supabase
        .from("users")
        .select("id, clerk_user_id, is_internal")
        .or(conditions.join(","));
      
      matchedUsers?.forEach(u => {
        if (isCallerInternal ? !u.is_internal : u.is_internal) {
          internalUserSet.add(u.id);
          if (u.clerk_user_id) internalUserSet.add(u.clerk_user_id);
        }
      });
    }
  }

  // Exclude actively banned users from discovery results
  const { data: bannedUsers } = await supabase
    .from("users")
    .select("id, clerk_user_id, banned, ban_expires_at")
    .eq("banned", true);

  const bannedUuidSet = new Set<string>();
  const bannedClerkSet = new Set<string>();
  bannedUsers?.forEach((u) => {
    if (isActiveBan(u)) {
      bannedUuidSet.add(u.id);
      if (u.clerk_user_id) bannedClerkSet.add(u.clerk_user_id);
    }
  });

  // 1. Collect all UUIDs to exclude
  const excludeUuidSet = new Set<string>();
  
  iBlocked?.forEach((b: any) => {
    if (b.blocker_id === userId) excludeUuidSet.add(b.blocked_id);
    if (b.blocked_id === userId) excludeUuidSet.add(b.blocker_id);
  });
  
  interests?.forEach((i: any) => {
    if (i.from_user_id === userId) excludeUuidSet.add(i.to_user_id);
    if (i.to_user_id === userId && (i.status === "accepted" || i.status === "rejected")) {
      excludeUuidSet.add(i.from_user_id);
    }
  });

  skips?.forEach((s: any) => excludeUuidSet.add(s.skipped_user_id));

  matchesData?.forEach((m: any) => {
    if (m.user_a_id === userId) excludeUuidSet.add(m.user_b_id);
    if (m.user_b_id === userId) excludeUuidSet.add(m.user_a_id);
  });

  // 2. Resolve those UUIDs to Clerk IDs (Go service returns Clerk IDs)
  const uuidsToResolve = Array.from(excludeUuidSet).filter(id => id.includes("-"));
  let clerkIds = new Set<string>();
  if (uuidsToResolve.length > 0) {
    const q8Start = Date.now();
    const { data: usersData } = await supabase.from("users").select("id, clerk_user_id").in("id", uuidsToResolve);
    logPerformanceMetric("match_solo_route_db_query_uuid_resolve_ms", Date.now() - q8Start, { userId });
    usersData?.forEach(u => {
      if (u.clerk_user_id) clerkIds.add(u.clerk_user_id);
    });
  }

  logPerformanceMetric("match_solo_route_total_filter_interacted_ms", Date.now() - totalStart, { userId });

  // 3. Filter out if m.userId matches EITHER a UUID or a Clerk ID
  return matches.filter(m => {
    const id = m.userId || m.id;
    if (!id) return true;
    if (bannedUuidSet.has(id) || bannedClerkSet.has(id)) return false;
    if (internalUserSet.has(id)) return false;
    return !excludeUuidSet.has(id) && !clerkIds.has(id);
  });
}
