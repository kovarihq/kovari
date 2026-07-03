import { NextRequest, NextResponse } from "next/server";
import { 
  verifyRefreshToken, 
  generateAccessToken, 
  generateRefreshToken, 
  hashToken 
} from "@/lib/auth/jwt";
import { createRouteHandlerSupabaseClientWithServiceRole, assertNotBanned, BanEnforcementError, BAN_ERROR_MESSAGE } from "@kovari/api";

export async function POST(req: NextRequest) {
  try {
    const { refreshToken } = await req.json();

    if (!refreshToken) {
      return NextResponse.json(
        { error: "Refresh token is required" }, 
        { status: 400 }
      );
    }

    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired refresh token" }, 
        { status: 401 }
      );
    }

    const supabase = createRouteHandlerSupabaseClientWithServiceRole();
    const tokenHash = hashToken(refreshToken);

    const { data: storedToken, error: lookupError } = await supabase
      .from("refresh_tokens")
      .select("id, user_id")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (lookupError || !storedToken) {
      console.warn(`[AUTH] Potential refresh token reuse attack for user: ${payload.sub}`);
      return NextResponse.json(
        { error: "Invalid refresh token session" }, 
        { status: 401 }
      );
    }

    try {
      await assertNotBanned(supabase, payload.sub);
    } catch (err) {
      if (err instanceof BanEnforcementError) {
        await supabase.from("refresh_tokens").delete().eq("user_id", payload.sub);
        return NextResponse.json(
          { error: BAN_ERROR_MESSAGE, code: "BANNED_USER" },
          { status: 403 },
        );
      }
      throw err;
    }

    await supabase
      .from("refresh_tokens")
      .delete()
      .eq("id", storedToken.id);

    const newRefreshToken = generateRefreshToken(payload.sub, payload.email);
    const newTokenHash = hashToken(newRefreshToken);
    const newAccessToken = generateAccessToken(payload.sub, payload.email, newTokenHash);
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error: storeError } = await supabase
      .from("refresh_tokens")
      .insert({
        user_id: payload.sub,
        token_hash: newTokenHash,
        expires_at: expiresAt.toISOString(),
      });

    if (storeError) {
      console.error("Failed to store rotated refresh token:", storeError);
      return NextResponse.json({ error: "Failed to rotate session" }, { status: 500 });
    }

    console.log(`[AUTH] Session rotated for user: ${payload.sub}`);

    return NextResponse.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    return NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500 }
    );
  }
}
