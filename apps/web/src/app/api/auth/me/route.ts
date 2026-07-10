import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { createRouteHandlerSupabaseClientWithServiceRole, isActiveBan, BAN_ERROR_MESSAGE } from "@kovari/api";

/**
 * Get current user context (Mobile JWT)
 * GET /api/auth/me
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = verifyAccessToken(authHeader.substring(7));
    if (!payload?.sub) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createRouteHandlerSupabaseClientWithServiceRole();

    // NOTE: We intentionally do NOT check payload.tokenHash against the refresh_tokens
    // table here. The JWT is already cryptographically verified by verifyAccessToken().
    // The tokenHash DB check causes spurious 401s right after token rotation because
    // the old refresh token hash is deleted the moment a new pair is issued — creating
    // a race window where a valid access token gets rejected. Token re-use detection
    // belongs on the /auth/refresh endpoint, not on read-only endpoints.


    const { data: user, error } = await supabase
      .from("users")
      .select("id, email, google_id, clerk_user_id, banned, ban_reason, ban_expires_at, profiles(name)")
      .eq("id", payload.sub)
      .maybeSingle();

    if (error || !user) {
      console.warn("User not found from valid JWT context:", payload.sub, error);
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (isActiveBan(user)) {
      return NextResponse.json(
        {
          error: BAN_ERROR_MESSAGE,
          code: "BANNED_USER",
          user: {
            id: user.id,
            email: user.email,
            banned: true,
            banReason: user.ban_reason || null,
            banExpiresAt: user.ban_expires_at || null,
          },
        },
        { status: 403 },
      );
    }

    const profileName = Array.isArray((user as any)?.profiles)
      ? ((user as any).profiles[0]?.name || null)
      : (((user as any)?.profiles as any)?.name || null);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: profileName,
        banned: false,
        banReason: null,
        banExpiresAt: null,
      },
    });

  } catch (error) {
    console.error("Auth me error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
