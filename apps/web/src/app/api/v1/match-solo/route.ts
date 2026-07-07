import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/get-user";
import { createRouteHandlerSupabaseClientWithServiceRole } from "@kovari/api";
import { generateRequestId } from "@/lib/api/requestId";
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
import { getInternalAuthHeaders } from "@/lib/api/internalAuth";
import { matchingServiceBreaker } from "@/lib/api/matching/circuitBreaker";
import { performSoloDbMatchingFallback } from "@/lib/api/matching/fallback";
import { logger } from "@/lib/api/logger";

const supabase = createRouteHandlerSupabaseClientWithServiceRole();
const GO_URL = process.env.GO_SERVICE_URL || "http://localhost:8080";

/**
 * 🏛️ v1 SOLO MATCHING API (Hardened Production Gateway)
 */
export async function GET(request: NextRequest) {
  const start = Date.now();
  const requestId = request.headers.get("X-Request-Id") || generateRequestId();

  try {
    const authUser = await getAuthenticatedUser(request);
    if (!authUser) return formatErrorResponse("Unauthorized", ApiErrorCode.UNAUTHORIZED, requestId, 401);

    const email = authUser.email;
    const { data: dbUser } = await supabase.from("users").select("id, is_internal").eq("email", email).single();
    if (!dbUser) return formatErrorResponse("User not found", ApiErrorCode.NOT_FOUND, requestId, 404);

    const userId = dbUser.id;
    const isCallerInternal = dbUser.is_internal || false;
    const { searchParams } = new URL(request.url);
    const params = Object.fromEntries(searchParams.entries());

    // 2. Try Go Service (with Circuit Breaker)
    const isGoConfigured = !!process.env.GO_SERVICE_URL && !GO_URL.includes("localhost");
    const canUseGoService = isGoConfigured || process.env.NODE_ENV === "development";
    
    if (canUseGoService && await matchingServiceBreaker.shouldAllowRequest()) {
      try {
        const authHeaders = getInternalAuthHeaders(userId, requestId);

        // 2. STRICT 3s TIMEOUT CALL
        const goResponse = await fetchWithTimeout(`${GO_URL}/v1/match/solo`, {
          method: "POST",
          headers: { 
            ...authHeaders,
            "Content-Type": "application/json" 
          },
          body: JSON.stringify({}),
          requestId,
          timeout: 3000, 
        });

        const rawData = await safeParseJson(goResponse);

        if (goResponse.ok && rawData?.success) {
          await matchingServiceBreaker.recordSuccess();

          const rawItems = rawData.data?.matches || [];
          const { validItems, droppedCount, state } = safeBatchValidate(rawItems, GoSoloMatchSchema, requestId);

          if (state !== 'degraded') {
            const transformed = validItems.map(m => {
              const result = safeTransform(matchTransformer, m);
              return result.ok ? result.data : null;
            }).filter(Boolean);

            let filteredMatches = transformed;
            if (transformed.length > 0) {
              const matchUserIds = transformed.map((m: any) => m?.userId || m?.id).filter(Boolean);
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
                
                const internalUserSet = new Set<string>();
                matchedUsers?.forEach(u => {
                  if (isCallerInternal ? !u.is_internal : u.is_internal) {
                    internalUserSet.add(u.id);
                    if (u.clerk_user_id) internalUserSet.add(u.clerk_user_id);
                  }
                });
                filteredMatches = transformed.filter((m: any) => {
                  const id = m?.userId || m?.id;
                  return !id || !internalUserSet.has(id);
                });
              }
            }

            return formatStandardResponse(
              { matches: filteredMatches },
              { 
                source: "go",
                contractState: state,
                filtered: droppedCount > 0 || filteredMatches.length < transformed.length,
                droppedCount: droppedCount + (transformed.length - filteredMatches.length)
              },
              { requestId, latencyMs: Date.now() - start }
            );
          }
        } else {
          // Record failure for 5xx or circuit breaker logic
          if (!goResponse.ok || goResponse.status >= 500) {
            await matchingServiceBreaker.recordFailure();
          }
        }
      } catch (err: any) {
        // Record failure on timeout/network error
        await matchingServiceBreaker.recordFailure();
        logger.error(requestId, "Go service call failed - Falling back to DB", err);
      }
    }

    // 3. PRODUCTION FALLBACK (DB MATCHING)
    const fallbackResults = await performSoloDbMatchingFallback(userId, params);
    
    return formatStandardResponse(
      { matches: fallbackResults },
      { source: "db", degraded: true, hasMore: false },
      { requestId, latencyMs: Date.now() - start }
    );

  } catch (err: any) {
    return formatErrorResponse("Internal critical error", ApiErrorCode.INTERNAL_SERVER_ERROR, requestId, 500);
  }
}
