import { NextRequest, NextResponse } from "next/server";
import { verifyGoogleToken } from "@/lib/auth/google";
import { generateAccessToken, generateRefreshToken, hashToken } from "@/lib/auth/jwt";
import { createRouteHandlerSupabaseClientWithServiceRole, isActiveBan, BAN_ERROR_MESSAGE } from "@kovari/api";
import { generateRequestId } from "@/lib/api/requestId";
import { formatStandardResponse, formatErrorResponse } from "@/lib/api/responseHelpers";
import { ApiErrorCode } from "@/types/api";

/**
 * Exchange Google ID Token for custom JWT
 * POST /api/auth/google
 */
export async function POST(request: NextRequest) {
  const start = Date.now();
  const requestId = generateRequestId();
  
  console.log(`[AUTH] Google ID Token exchange started. RequestId: ${requestId}`);

  try {
    const { idToken } = await request.json();

    if (!idToken) {
      return formatErrorResponse("Missing idToken", ApiErrorCode.BAD_REQUEST, requestId, 400);
    }

    // 1. Verify Google Token
    const googlePayload = await verifyGoogleToken(idToken);
    if (!googlePayload) {
      return formatErrorResponse("Invalid Google token", ApiErrorCode.UNAUTHORIZED, requestId, 401);
    }

    const { email, name, googleId } = googlePayload;

    // 2. Initialize Supabase
    const supabase = createRouteHandlerSupabaseClientWithServiceRole();

    // 3. Consolidated Atomic Identity Sync
    const { data: userId, error: syncError } = await supabase
      .rpc("sync_user_identity", {
        p_email: email,
        p_name: name,
        p_google_id: googleId,
        p_clerk_id: null,
        p_password_hash: null,
      });

    if (syncError || !userId) {
      console.error("Atomic identity sync failed:", syncError);
      return formatErrorResponse("Authentication failed", ApiErrorCode.INTERNAL_SERVER_ERROR, requestId, 500);
    }

    // 3.5 Fetch full user data including ban status
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, email, banned, ban_reason, ban_expires_at, profiles(name)")
      .eq("id", userId)
      .maybeSingle();

    if (userError || !user) {
      console.error("Failed to fetch user after sync:", userError);
      return formatErrorResponse("User fetch failed", ApiErrorCode.INTERNAL_SERVER_ERROR, requestId, 500);
    }

    if (isActiveBan(user)) {
      return formatErrorResponse(BAN_ERROR_MESSAGE, ApiErrorCode.FORBIDDEN, requestId, 403);
    }

    // 4. Generate Tokens
    const refreshToken = generateRefreshToken(userId, email);
    const tokenHash = hashToken(refreshToken);
    const accessToken = generateAccessToken(userId, email, tokenHash);

    // 5. Store Hashed Refresh Token in DB for rotation/revocation
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error: tokenError } = await supabase
      .from("refresh_tokens")
      .insert({
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
      });

    if (tokenError) {
      console.error("Failed to store refresh token:", tokenError);
      return formatErrorResponse("Auth session failed", ApiErrorCode.INTERNAL_SERVER_ERROR, requestId, 500);
    }

    const latencyMs = Date.now() - start;

    return formatStandardResponse(
      {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          name: (Array.isArray((user as any)?.profiles) ? (user as any).profiles[0]?.name : ((user as any)?.profiles as any)?.name) || null,
          banned: false,
          banReason: null,
          banExpiresAt: null,
        },
      },
      {},
      { requestId, latencyMs }
    );

  } catch (error) {
    console.error("Critical error in /api/auth/google:", error);
    return formatErrorResponse("Internal server error", ApiErrorCode.INTERNAL_SERVER_ERROR, requestId, 500);
  }
}
