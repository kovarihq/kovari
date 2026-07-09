import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import {
  createRouteHandlerSupabaseClientWithServiceRole,
  assertNotBanned,
  BanEnforcementError,
} from "@kovari/api";
import { verifyAccessToken, isUUIDv4 } from "./jwt";
import { AuthResult, ResolveUserOptions, AuthFailureReason } from "@/types/auth";
import { generateRequestId } from "../api/requestId";
import { logger } from "../api/logger";
import { detectClient } from "../api/clientDetection";
import { logPerformanceMetric, logInvocation } from "../observability/performance";

/**
 * 🛰️ Unified Identity Resolver
 * validate → find → provision → ban gate
 */
export async function resolveUser(
  req: NextRequest,
  options: ResolveUserOptions = { mode: 'protected' }
): Promise<AuthResult> {
  const start = performance.now();
  const resolveRequestId = (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  logInvocation("resolveUser_invocation", { mode: options.mode, requestId: resolveRequestId });
  try {
    const result = await _resolveUser(req, options, resolveRequestId);
    const duration = performance.now() - start;
    logPerformanceMetric("resolveUser_total_ms", duration, { ok: result.ok, mode: options.mode, requestId: resolveRequestId });
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    logPerformanceMetric("resolveUser_total_ms", duration, { ok: false, error: true, requestId: resolveRequestId });
    throw error;
  }
}

async function verifyUserAccountStatus(
  supabase: ReturnType<typeof createRouteHandlerSupabaseClientWithServiceRole>,
  userId: string,
  requestId: string,
  mode: ResolveUserOptions['mode'],
): Promise<AuthResult | null> {
  const { data: dbUser, error: fetchError } = await supabase
    .from("users")
    .select("id, email, name, isDeleted, banned, ban_reason, ban_expires_at")
    .eq("id", userId)
    .single();

  if (fetchError || !dbUser) {
    logger.error(requestId, "Identity verification failed", fetchError);
    return { ok: false, reason: 'USER_NOT_FOUND', message: "Identity verification failed", requestId };
  }

  if (dbUser.isDeleted) {
    logger.warn(requestId, "User account is deleted", { userId: dbUser.id });
    return { ok: false, reason: 'BANNED_USER', message: "Account unavailable", requestId };
  }

  if (mode === 'protected') {
    try {
      await assertNotBanned(supabase, userId);
    } catch (err) {
      if (err instanceof BanEnforcementError) {
        logger.warn(requestId, "Banned user blocked at resolveUser gate", { userId });
        return { ok: false, reason: 'BANNED_USER', message: err.message, requestId };
      }
      throw err;
    }
  }

  return null;
}

async function _resolveUser(
  req: NextRequest,
  options: ResolveUserOptions = { mode: 'protected' },
  resolveRequestId: string
): Promise<AuthResult> {
  const requestId = req.headers.get("x-request-id") || generateRequestId();
  const { client } = detectClient(req);

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  try {
    await applyRateLimit(req, client, ip, requestId);
  } catch (error) {
    logger.warn(requestId, "Rate limit exceeded", { client, ip });
    return { ok: false, reason: 'RATE_LIMIT_EXCEEDED', message: "Too many requests", requestId };
  }

  try {
    const supabase = createRouteHandlerSupabaseClientWithServiceRole();

    let identity: { id: string; email: string; provider: 'jwt' | 'clerk'; dbUuid?: string } | null = null;

    let isMobileToken = false;
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const jwtStart = performance.now();
      const token = authHeader.substring(7);
      
      // Check if it's a mobile token (HS256)
      try {
        const parts = token.split(".");
        if (parts.length === 3) {
          const headerStr = Buffer.from(parts[0], "base64").toString("utf8");
          const header = JSON.parse(headerStr);
          if (header.alg === "HS256") {
            isMobileToken = true;
          }
        }
      } catch (e) {}

      const payload = verifyAccessToken(token);
      logPerformanceMetric("resolveUser_jwt_lookup_ms", performance.now() - jwtStart, { requestId: resolveRequestId });
      if (payload) {
        identity = { id: payload.sub, email: payload.email, provider: 'jwt', dbUuid: payload.sub };
      } else {
        logger.warn(requestId, "Invalid Mobile JWT token presented");
        if (isMobileToken) {
          return { ok: false, reason: 'INVALID_TOKEN', message: "Invalid or expired JWT token", requestId };
        }
      }
    }

    if (!identity) {
      if (isMobileToken) {
        return { ok: false, reason: 'INVALID_TOKEN', message: "Authorization required", requestId };
      }
      const authObj = await auth();
      const clerkUserId = authObj.userId;

      if (clerkUserId) {
        const dbStart = performance.now();
        const { data: dbUser } = await supabase
          .from("users")
          .select("id, email")
          .eq("clerk_user_id", clerkUserId)
          .maybeSingle();
        logPerformanceMetric("resolveUser_db_lookup_ms", performance.now() - dbStart, { requestId: resolveRequestId });

        if (dbUser) {
          const statusResult = await verifyUserAccountStatus(supabase, dbUser.id, requestId, options.mode);
          if (statusResult) return statusResult;

          return {
            ok: true,
            user: {
              userId: dbUser.id,
              email: dbUser.email,
              provider: 'clerk',
              providerId: clerkUserId
            },
            requestId
          };
        }

        try {
          const clerkStart = performance.now();
          const clerk = await clerkClient();
          const clerkUser = await clerk.users.getUser(clerkUserId);
          logPerformanceMetric("resolveUser_clerk_lookup_ms", performance.now() - clerkStart, { requestId: resolveRequestId });
          const primaryEmailObj = clerkUser.emailAddresses.find(e => e.id === clerkUser.primaryEmailAddressId);
          const isPrimaryVerified = primaryEmailObj?.verification?.status === "verified";
          
          const anyVerifiedEmailObj = clerkUser.emailAddresses.find(e => e.verification?.status === "verified");
          const verifiedEmail = isPrimaryVerified ? primaryEmailObj?.emailAddress : anyVerifiedEmailObj?.emailAddress;

          if (!verifiedEmail) {
            logger.warn(requestId, "Clerk identity rejected (No verified emails found)", { 
              clerkUserId,
              hasPrimary: !!primaryEmailObj,
              primaryStatus: primaryEmailObj?.verification?.status 
            });
            if (options.mode === 'protected') {
              return { ok: false, reason: 'UNVERIFIED_EMAIL', message: "Verified email required", requestId };
            }
          } else {
            identity = { id: clerkUserId, email: verifiedEmail, provider: 'clerk' };
          }
        } catch (clerkErr) {
          logger.error(requestId, "Clerk API call failed", clerkErr);
          if (options.mode === 'protected') {
            return { ok: false, reason: 'INVALID_TOKEN', message: "Authentication provider unreachable", requestId };
          }
        }
      }
    }

    if (!identity) {
      if (options.mode === 'optional') {
        return { ok: true, user: null as any, requestId };
      }
      return { ok: false, reason: 'INVALID_TOKEN', message: "Authentication required", requestId };
    }

    if (identity.dbUuid) {
      const statusResult = await verifyUserAccountStatus(supabase, identity.dbUuid, requestId, options.mode);
      if (statusResult) return statusResult;

      const { data: dbUser } = await supabase
        .from("users")
        .select("id, email, name")
        .eq("id", identity.dbUuid)
        .single();

      return {
        ok: true,
        user: {
          userId: dbUser!.id,
          email: dbUser!.email,
          provider: identity.provider,
          providerId: identity.id
        },
        requestId
      };
    }

    const canonicalEmail = identity.email.toLowerCase().trim();
    const rpcStart = performance.now();
    const { data: userId, error: syncError } = await supabase.rpc("sync_user_identity", {
      p_email: canonicalEmail,
      p_name: identity.provider === 'clerk' ? 'Clerk User' : 'Mobile User',
      p_clerk_id: identity.provider === 'clerk' ? identity.id : null,
      p_google_id: null,
      p_password_hash: null,
    });
    logPerformanceMetric("resolveUser_rpc_ms", performance.now() - rpcStart, { requestId: resolveRequestId });

    if (syncError || !userId) {
      logger.error(requestId, "Atomic identity sync failed", syncError);
      return { ok: false, reason: 'USER_NOT_FOUND', message: "Core identity sync failed", requestId };
    }

    const statusResult = await verifyUserAccountStatus(supabase, userId, requestId, options.mode);
    if (statusResult) return statusResult;

    const { data: dbUser } = await supabase
      .from("users")
      .select("id, email, name")
      .eq("id", userId)
      .single();

    if (identity.provider === 'clerk') {
      clerkClient().then((clerk) => {
        clerk.users.updateUserMetadata(identity!.id, {
          publicMetadata: { db_uuid: userId }
        }).catch(err => console.error("Failed to push Clerk metadata background", err));
      }).catch(err => console.error("Failed to get Clerk client background", err));
    }

    logger.info(requestId, "User resolved successfully", { userId: dbUser!.id, provider: identity.provider });
    
    return {
      ok: true,
      user: {
        userId: dbUser!.id,
        email: dbUser!.email,
        provider: identity.provider,
        providerId: identity.id
      },
      requestId
    };

  } catch (error: any) {
    logger.error(requestId, "Internal failure in resolveUser", {
      message: error?.message || "Unknown error",
      stack: error?.stack,
      error
    });
    return { ok: false, reason: 'USER_NOT_FOUND', message: "Internal identity failure", requestId };
  }
}

async function applyRateLimit(req: NextRequest, client: string, ip: string, requestId: string) {
  return true;
}
