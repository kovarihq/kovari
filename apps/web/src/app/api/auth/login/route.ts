import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { generateAccessToken, generateRefreshToken, hashToken } from "@/lib/auth/jwt";
import { writeAuditLog } from "@/lib/audit/log";
import { sendSecurityAlert } from "@/lib/alerts/security";
import { createRouteHandlerSupabaseClientWithServiceRole, isActiveBan, BAN_ERROR_MESSAGE } from "@kovari/api";
import { generateRequestId } from "@/lib/api/requestId";
import { detectClient } from "@/lib/api/clientDetection";
import { 
  formatStandardResponse, 
  formatErrorResponse, 
  safeTransform 
} from "@/lib/api/responseHelpers";
import { userTransformer } from "@/lib/transformers/userTransformer";
import { ApiErrorCode, KovariClient } from "@/types/api";
import { checkRateLimit } from "@/lib/auth/rateLimit";

/**
 * 🏛️ HARDENED LOGIN API (Phase 3 True Isolation)
 */
export async function POST(request: NextRequest) {
  const { client, error: clientError } = detectClient(request);

  // ⚡ TRUE LEGACY ISOLATION
  if (client === "web") {
    const rateLimitResult = await checkRateLimit(request, 'login');
    if (!rateLimitResult.success) {
      return NextResponse.json({ error: "Too many login attempts. Please try again later." }, { 
        status: 429,
        headers: {
          'X-RateLimit-Limit': rateLimitResult.limit.toString(),
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': rateLimitResult.reset.toString(),
        }
      });
    }

    try {
      const { email, password } = await request.json();
      if (!email || !password) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

      const supabase = createRouteHandlerSupabaseClientWithServiceRole();
      const { data: user } = await supabase
        .from("users")
        .select("id, email, password_hash, banned, ban_reason, ban_expires_at, profiles(name)")
        .ilike("email", email)
        .maybeSingle();

      if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }

      if (isActiveBan(user)) {
        return NextResponse.json({ error: BAN_ERROR_MESSAGE, code: "BANNED_USER", banExpiresAt: user.ban_expires_at ?? null, banReason: user.ban_reason ?? null }, { status: 403 });
      }

      const refreshToken = generateRefreshToken(user.id, user.email);
      const tokenHash = hashToken(refreshToken);
      const accessToken = generateAccessToken(user.id, user.email, tokenHash);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await supabase.from("refresh_tokens").insert({
        user_id: user.id,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
      });

      return NextResponse.json({
        accessToken,
        refreshToken,
        user: { 
          id: user.id, 
          email: user.email, 
          name: (Array.isArray((user as any)?.profiles) ? (user as any).profiles[0]?.name : ((user as any)?.profiles as any)?.name) || null,
          banned: user.banned ?? false,
          banReason: user.ban_reason || null,
          banExpiresAt: user.ban_expires_at || null,
        }
      });
    } catch (err: any) {
      return NextResponse.json({ error: "Auth failure" }, { status: 500 });
    }
  }

  // 🛡️ Standard Hardened Path
  const start = Date.now();
  const requestId = generateRequestId();

  if (clientError) {
    return formatErrorResponse(clientError, ApiErrorCode.BAD_REQUEST, requestId, 400);
  }

  const rateLimitResult = await checkRateLimit(request, 'login');
  if (!rateLimitResult.success) {
    const response = formatErrorResponse("Too many login attempts", ApiErrorCode.RATE_LIMIT_EXCEEDED, requestId, 429);
    response.headers.set('X-RateLimit-Limit', rateLimitResult.limit.toString());
    response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
    response.headers.set('X-RateLimit-Reset', rateLimitResult.reset.toString());
    return response;
  }

  return handleStandardLogin(request, requestId, start, client);
}

/**
 * Handle Standard Login (Mobile/v1)
 */
async function handleStandardLogin(
  request: NextRequest, 
  requestId: string, 
  start: number, 
  client: KovariClient
): Promise<NextResponse> {
  try {
    const { email, password } = await request.json();
    const supabase = createRouteHandlerSupabaseClientWithServiceRole();
    const { data: user } = await supabase
      .from("users")
      .select("id, email, password_hash, banned, ban_reason, ban_expires_at, profiles(name)")
      .ilike("email", email)
      .maybeSingle();

    const ip = request.headers.get("x-forwarded-for") || "unknown";
    const userAgent = request.headers.get("user-agent") || "unknown";

    if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
      await writeAuditLog({
        action: "AUTH_LOGIN_ATTEMPT",
        targetId: email, // Can't easily use user.id if user doesn't exist
        ipAddress: ip,
        userAgent: userAgent,
        details: { status: "failed", reason: "invalid credentials" },
      });
      // Optionally trigger alert for potential brute force if we had a rate limiter
      // For now, we will just send a low-level alert for tracking
      await sendSecurityAlert({
        event: "Failed Login Attempt",
        severity: "low",
        ipAddress: ip,
        details: { email }
      });
      return formatErrorResponse("Invalid credentials", ApiErrorCode.UNAUTHORIZED, requestId, 401);
    }

    if (isActiveBan(user)) {
      await writeAuditLog({
        action: "AUTH_LOGIN_ATTEMPT",
        actorId: user.id,
        ipAddress: ip,
        userAgent: userAgent,
        details: { status: "failed", reason: "banned" },
      });
      await sendSecurityAlert({
        event: "Banned User Login Attempt",
        severity: "medium",
        userId: user.id,
        ipAddress: ip,
        details: { reason: user.ban_reason },
      });
      return formatErrorResponse(BAN_ERROR_MESSAGE, ApiErrorCode.FORBIDDEN, requestId, 403);
    }

    const refreshToken = generateRefreshToken(user.id, user.email);
    const tokenHash = hashToken(refreshToken);
    const accessToken = generateAccessToken(user.id, user.email, tokenHash);

    await writeAuditLog({
      action: "AUTH_LOGIN_SUCCESS",
      actorId: user.id,
      ipAddress: ip,
      userAgent: userAgent,
    });

    const authData = {
      accessToken,
      refreshToken,
      user: { 
        id: user.id, 
        email: user.email, 
        name: (Array.isArray((user as any)?.profiles) ? (user as any).profiles[0]?.name : ((user as any)?.profiles as any)?.name) || null,
        banned: false,
        banReason: null,
        banExpiresAt: null,
      }
    };

    // Gate 2: Post-Transform Validation
    const result = safeTransform(userTransformer, authData.user);
    if (!result.ok || !result.data.email) {
      return formatErrorResponse("Contract failure", ApiErrorCode.INTERNAL_SERVER_ERROR, requestId, 500);
    }

    const latencyMs = Date.now() - start;

    // Rule #6: Consistency data: { user }
    return formatStandardResponse(
      { ...authData, user: result.data },
      {},
      { requestId, latencyMs }
    );

  } catch (err: any) {
    return formatErrorResponse("Login failed", ApiErrorCode.INTERNAL_SERVER_ERROR, requestId, 500);
  }
}
