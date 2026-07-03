import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { isActiveBan, BAN_ERROR_MESSAGE } from "@kovari/api/moderation/ban-gate";

const AUTH_PUBLIC_PREFIXES = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/google",
  "/api/auth/refresh",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify-email",
];

function isAuthPublicRoute(pathname: string): boolean {
  return AUTH_PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Defense-in-depth: block mobile JWT requests from actively banned users
 * before they bypass Clerk middleware.
 */
export async function checkMobileJwtBan(
  req: NextRequest,
  isMobileToken: boolean,
): Promise<NextResponse | null> {
  if (!isMobileToken) return null;

  const pathname = req.nextUrl.pathname;
  if (isAuthPublicRoute(pathname)) return null;

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const payload = verifyAccessToken(authHeader.substring(7));
  if (!payload?.sub) return null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) return null;

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { data: user } = await supabase
      .from("users")
      .select("banned, ban_expires_at")
      .eq("id", payload.sub)
      .maybeSingle();

    if (user && isActiveBan(user)) {
      const isApiRoute =
        pathname.startsWith("/api") || pathname.startsWith("/trpc");
      if (isApiRoute) {
        return NextResponse.json(
          { error: BAN_ERROR_MESSAGE, code: "BANNED_USER" },
          { status: 403 },
        );
      }
      return NextResponse.redirect(new URL("/banned", req.url));
    }
  } catch (err) {
    console.error("[Middleware] Mobile JWT ban check failed:", err);
  }

  return null;
}
