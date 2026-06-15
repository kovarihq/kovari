import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest } from "next/server";
import { createRouteHandlerSupabaseClientWithServiceRole } from "@kovari/api";
import { verifyAccessToken, isUUIDv4 } from "./jwt";
import { AuthResult, ResolveUserOptions, AuthFailureReason } from "@/types/auth";
import { generateRequestId } from "../api/requestId";
import { logger } from "../api/logger";
import { detectClient } from "../api/clientDetection";

/**
 * 🛰️ Unified Identity Resolver
 * validate → find → provision
 */
export async function resolveUser(
  req: NextRequest,
  options: ResolveUserOptions = { mode: 'protected' }
): Promise<AuthResult> {
  const requestId = req.headers.get("x-request-id") || generateRequestId();
  const { client } = detectClient(req);

  // 1. Rate Limiting Hook (Before validation)
  // Mobile → userId-based, Web → IP-based
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  try {
    await applyRateLimit(req, client, ip, requestId);
  } catch (error) {
    logger.warn(requestId, "Rate limit exceeded", { client, ip });
    return { ok: false, reason: 'RATE_LIMIT_EXCEEDED', message: "Too many requests", requestId };
  }

  try {
    const supabase = createRouteHandlerSupabaseClientWithServiceRole();

    // 2. STAGE: VALIDATE
    let identity: { id: string; email: string; provider: 'jwt' | 'clerk'; dbUuid?: string } | null = null;

    // A. Priority: Mobile JWT
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const payload = verifyAccessToken(token);
      if (payload) {
        identity = { id: payload.sub, email: payload.email, provider: 'jwt', dbUuid: payload.sub };
      } else {
        logger.warn(requestId, "Invalid Mobile JWT token presented (falling back to Clerk check)");
      }
    }

    // B. Fallback: Clerk (Web Claims Caching & Local DB Lookup Caching)
    if (!identity) {
      const authObj = await auth();
      const clerkUserId = authObj.userId;
      const sessionClaims = authObj.sessionClaims;

      if (clerkUserId) {
        // Fast-path 1: Read database UUID from Clerk JWT template custom claims (if configured)
        const cachedDbUuid = sessionClaims?.db_uuid as string | undefined;
        const cachedEmail = sessionClaims?.email as string | undefined;

        if (cachedDbUuid && cachedEmail) {
          return {
            ok: true,
            user: {
              userId: cachedDbUuid,
              email: cachedEmail,
              provider: 'clerk',
              providerId: clerkUserId
            },
            requestId
          };
        }

        // Fast-path 2: DB-First Lookup (Checks if already mapped locally, bypassing Clerk API)
        const { data: dbUser } = await supabase
          .from("users")
          .select("id, email")
          .eq("clerk_user_id", clerkUserId)
          .maybeSingle();

        if (dbUser) {
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

        // Fallback: Clerk API request (Only on first login before sync is finalized)
        try {
          const clerk = await clerkClient();
          const clerkUser = await clerk.users.getUser(clerkUserId);
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

    // Handle Anonymous for Optional Mode
    if (!identity) {
      if (options.mode === 'optional') {
        return { ok: true, user: null as any, requestId };
      }
      return { ok: false, reason: 'INVALID_TOKEN', message: "Authentication required", requestId };
    }

    // 3. STAGE: ATOMIC IDENTITY SYNC (Fallback write path - executed once per new user)
    if (identity.dbUuid) {
      const { data: dbUser, error: fetchError } = await supabase
        .from("users")
        .select("id, email, name, isDeleted")
        .eq("id", identity.dbUuid)
        .single();

      if (fetchError || !dbUser) {
        logger.error(requestId, "Identity verification failed", fetchError);
        return { ok: false, reason: 'USER_NOT_FOUND', message: "Identity verification failed", requestId };
      }

      if (dbUser.isDeleted) {
        logger.warn(requestId, "User account is deleted", { userId: dbUser.id });
        return { ok: false, reason: 'BANNED_USER', message: "Account unavailable", requestId };
      }

      return {
        ok: true,
        user: {
          userId: dbUser.id,
          email: dbUser.email,
          provider: identity.provider,
          providerId: identity.id
        },
        requestId
      };
    }

    const canonicalEmail = identity.email.toLowerCase().trim();
    const { data: userId, error: syncError } = await supabase.rpc("sync_user_identity", {
      p_email: canonicalEmail,
      p_name: identity.provider === 'clerk' ? 'Clerk User' : 'Mobile User',
      p_clerk_id: identity.provider === 'clerk' ? identity.id : null,
      p_google_id: null,
      p_password_hash: null,
    });

    if (syncError || !userId) {
      logger.error(requestId, "Atomic identity sync failed", syncError);
      return { ok: false, reason: 'USER_NOT_FOUND', message: "Core identity sync failed", requestId };
    }

    // 4. STAGE: VERIFY & RESOLVE
    const { data: dbUser, error: fetchError } = await supabase
      .from("users")
      .select("id, email, name, isDeleted")
      .eq("id", userId)
      .single();

    if (fetchError || !dbUser) {
      logger.error(requestId, "Post-sync verification failed", fetchError);
      return { ok: false, reason: 'USER_NOT_FOUND', message: "Identity verification failed", requestId };
    }

    if (dbUser.isDeleted) {
      logger.warn(requestId, "User account is deleted", { userId: dbUser.id });
      return { ok: false, reason: 'BANNED_USER', message: "Account unavailable", requestId };
    }

    // Async Metadata update to Clerk public metadata in background (does not block current execution)
    if (identity.provider === 'clerk') {
      clerkClient().then((clerk) => {
        clerk.users.updateUserMetadata(identity!.id, {
          publicMetadata: { db_uuid: userId }
        }).catch(err => console.error("Failed to push Clerk metadata background", err));
      }).catch(err => console.error("Failed to get Clerk client background", err));
    }

    logger.info(requestId, "User resolved successfully", { userId: dbUser.id, provider: identity.provider });
    
    return {
      ok: true,
      user: {
        userId: dbUser.id,
        email: dbUser.email,
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

/**
 * Placeholder for Auth Rate Limiting
 */
async function applyRateLimit(req: NextRequest, client: string, ip: string, requestId: string) {
  // Mobile → userId-based limiting (if we can peek at token)
  // Web → IP-based limiting
  // For now: Always succeed (Hook prepared)
  return true;
}
