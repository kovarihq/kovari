import {
  clerkClient,
  clerkMiddleware,
  createRouteMatcher,
} from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { logPerformanceMetric } from "@/lib/observability/performance";
import { generateRequestId } from "@/lib/api/requestId";

const isBannedPage = createRouteMatcher(["/banned"]);
const isAuthPage = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

/** When true, only landing + waitlist are public; devs/admins bypass via launch_bypass_users table */
const isWaitlistLaunchMode = () =>
  process.env.LAUNCH_WAITLIST_MODE === "true" ||
  process.env.LAUNCH_WAITLIST_MODE === "1";

/** Public paths allowed during waitlist launch (everyone). Waitlist form is in landing modal. */
const isWaitlistPublicPath = createRouteMatcher([
  "/",
  "/landing",
  "/api/waitlist",
  "/api/users/sync",
  "/api/cron/send-waitlist-emails",
  "/api/cron/send-offline-emails",
  "/api/internal/notify",
  "/pricing",
  "/about",
  "/about-us",
  "/user-safety",
  "/community-guidelines",
  "/privacy",
  "/terms",
  "/data-deletion",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/forgot-password(.*)",
  "/verify-email(.*)",
  "/sso-callback(.*)",
  "/onboarding(.*)",
  "/api/supabase/sync-user(.*)",
  "/sitemap.xml",
  "/robots.txt",
  "/manifest.json",
  "/manifest.webmanifest",
  "/api/auth/(.*)",
  "/api/profile(.*)",
  "/api/settings/accept-policies",
  "/api/webhooks/clerk",
  "/api/health",
  "/opengraph-image(.*)",
  "/twitter-image(.*)",
  "/google54b5f6252311fa10.html",
]);

/** Public paths allowed during standard launch (when waitlist is off) */
const isPublicRoute = createRouteMatcher([
  "/",
  "/landing",
  "/pricing",
  "/about",
  "/about-us",
  "/user-safety",
  "/community-guidelines",
  "/privacy",
  "/terms",
  "/data-deletion",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/forgot-password(.*)",
  "/verify-email(.*)",
  "/sso-callback(.*)",
  "/sitemap.xml",
  "/robots.txt",
  "/manifest.json",
  "/manifest.webmanifest",
  "/api/auth/(.*)",
  "/api/profile(.*)",
  "/api/settings/accept-policies",
  "/api/webhooks/clerk",
  "/api/health",
  "/opengraph-image(.*)",
  "/twitter-image(.*)",
  "/google54b5f6252311fa10.html",
  "/api/cron/send-offline-emails",
  "/api/cron/send-waitlist-emails",
  "/api/internal/notify",
]);

/** Check if user is in launch_bypass_users table */
async function isLaunchBypassUser(clerkUserId: string): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn("[Waitlist] Missing Supabase config in middleware:", { 
      hasUrl: !!supabaseUrl, 
      hasKey: !!supabaseServiceKey 
    });
    return false;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase
      .from("launch_bypass_users")
      .select("clerk_user_id, tier")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();

    if (error) {
      console.error("[Waitlist] DB error checking bypass user:", error);
      return false;
    }

    if (data) {
      const isBetaMode = process.env.BETA_MODE === "true";
      const isAdmin = data.tier === "admin";
      const isBetaUser = data.tier === "beta" && isBetaMode;

      if (isAdmin || isBetaUser) {
        console.log("[Waitlist] Bypass granted for user:", clerkUserId, "Tier:", data.tier);
        return true;
      }
    }

    console.log("[Waitlist] User not granted bypass or tier insufficient:", clerkUserId);
    return false;
  } catch (err) {
    console.error("[Waitlist] Unexpected error in bypass check:", err);
    return false;
  }
}

function nextResponseWithHeaders(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

const clerk = clerkMiddleware(async (auth, req: NextRequest) => {
  const pathname = req.nextUrl.pathname;
  if (pathname.startsWith("/api/direct-chat")) {
    const { userId } = await auth();
    const authHeader = req.headers.get("authorization") || "";
    console.log(`🛡️ [Middleware] DirectChat Auth Check | Path: ${pathname} | UserId: ${userId} | Token: ${authHeader ? "present" : "missing"}`);
  }

  const url = req.nextUrl.clone();
  const host = req.headers.get("host");


  // 2. /landing to / redirect (Consolidate content at root)

  // 2. /landing to / redirect (Consolidate content at root)
  if (url.pathname === "/landing") {
    url.pathname = "/";
    return NextResponse.redirect(url, 301);
  }

  // Allow access to the banned page to prevent redirect loops
  if (isBannedPage(req)) {
    return nextResponseWithHeaders(req);
  }

  const authStart = performance.now();
  const authObj = await auth();
  const { userId, sessionId } = authObj;
  const authDuration = performance.now() - authStart;
  const mwRequestId = req.headers.get("x-request-id") || generateRequestId().slice(0, 8);
  logPerformanceMetric("middleware_auth_ms", authDuration, { userId, requestId: mwRequestId });

  // If user is signed in and trying to access sign-in or sign-up, redirect to dashboard
  if (userId && isAuthPage(req)) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  // If user is signed in and lands on /, send them straight to /dashboard
  if (userId && url.pathname === "/") {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    return NextResponse.redirect(redirectUrl);
  }

  // 3. Absolute Priority: Ban & Deletion Checks
  // We must do this before ANY bypass logic (like waitlist admin bypass)
  if (userId) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && (supabaseServiceKey || supabaseAnonKey)) {
      try {
        let supabase;

        if (supabaseServiceKey) {
          supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: { persistSession: false },
          });
        } else {
          const { getToken } = await auth();
          const token = await getToken({ template: "supabase" });
          supabase = createClient(supabaseUrl, supabaseAnonKey!, {
            global: {
              headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            },
          });
        }

        const dbStart = performance.now();
        const { data: user, error } = await supabase
          .from("users")
          .select('banned, ban_expires_at, "isDeleted"')
          .eq("clerk_user_id", userId)
          .maybeSingle();
        
        const dbDuration = performance.now() - dbStart;
        logPerformanceMetric("middleware_db_ms", dbDuration, { userId, requestId: mwRequestId });

        if (error) {
          console.error("Middleware Supabase error:", error);
        }

        if (user?.isDeleted) {
          const pathname = req.nextUrl.pathname;
          const isApiRoute =
            pathname.startsWith("/api") || pathname.startsWith("/trpc");

          if (isApiRoute) {
            return NextResponse.json(
              { error: "Account has been deleted" },
              { status: 403 },
            );
          }

          try {
            if (sessionId) {
              const client = await clerkClient();
              await client.sessions.revokeSession(sessionId);
            }
          } catch (e) {
            console.warn(
              "Failed to revoke deleted-user session in middleware:",
              e,
            );
          }

          const url = req.nextUrl.clone();
          url.pathname = "/sign-in";
          url.searchParams.set("reason", "deleted");
          return NextResponse.redirect(url);
        }

        if (user?.banned) {
          let isBanned = true;

          if (user.ban_expires_at) {
            const expires = new Date(user.ban_expires_at);
            const now = new Date();
            if (expires < now) {
              isBanned = false;
            }
          }

          if (isBanned) {
            const pathname = req.nextUrl.pathname;
            const isApiRoute = pathname.startsWith("/api") || pathname.startsWith("/trpc");
            const isPublic = isWaitlistLaunchMode() ? isWaitlistPublicPath(req) : isPublicRoute(req);

            if (!isPublic) {
              if (isApiRoute) {
                return NextResponse.json(
                  { error: "Account has been banned" },
                  { status: 403 },
                );
              }
              return NextResponse.redirect(new URL("/banned", req.url));
            }
          }
        }
      } catch (error) {
        console.error("Middleware ban check error:", error);
        return NextResponse.redirect(new URL("/banned", req.url));
      }
    }
  }

  // 4. Waitlist launch mode: restrict to landing + waitlist; devs/admins bypass
  if (isWaitlistLaunchMode()) {
    const pathname = req.nextUrl.pathname;
    const isApiRoute =
      pathname.startsWith("/api") || pathname.startsWith("/trpc");

    if (isWaitlistPublicPath(req)) {
      return nextResponseWithHeaders(req);
    }

    if (userId) {
      if (await isLaunchBypassUser(userId)) {
        return nextResponseWithHeaders(req);
      }

      if (!req.nextUrl.pathname.startsWith("/onboarding") && !req.nextUrl.pathname.startsWith("/api/supabase/sync-user")) {
        const url = req.nextUrl.clone();
        url.pathname = "/onboarding";
        return NextResponse.redirect(url);
      }
    }

    if (!userId) {
      return authObj.redirectToSignIn({ returnBackUrl: req.url });
    }

    if (isApiRoute) {
      return NextResponse.json(
        {
          error: "Access restricted. Beta not yet available.",
        },
        { status: 403 },
      );
    }

    return NextResponse.redirect(new URL("/", req.url));
  }

  // 5. Normal Mode: Enforce login requirement on all non-public routes
  if (!isPublicRoute(req)) {
    if (!userId) {
      const pathname = req.nextUrl.pathname;
      if (pathname.startsWith("/api/") || pathname.startsWith("/trpc/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      return authObj.redirectToSignIn({ returnBackUrl: req.url });
    }
  }

  return nextResponseWithHeaders(req);
});

const ALLOWED_ORIGINS = [
  'https://kovari.in',
  'https://www.kovari.in',
  process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : null,
  process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : null,
].filter(Boolean) as string[];

export default async function middleware(req: NextRequest, evt: any) {
  const mwStart = performance.now();
  const mwRequestId = req.headers.get("x-request-id") || generateRequestId().slice(0, 8);
  req.headers.set("x-request-id", mwRequestId);
  const host = req.headers.get("host");
  if (host === "www.kovari.in") {
    const url = req.nextUrl.clone();
    url.host = "kovari.in";
    url.protocol = "https:";
    return NextResponse.redirect(url, 301);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'unsafe-inline' 'unsafe-eval' https://clerk.kovari.in https://*.clerk.accounts.dev https://va.vercel-scripts.com https://challenges.cloudflare.com;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com;
    img-src 'self' data: blob: https://res.cloudinary.com https://utfs.io https://img.clerk.com https://*.clerk.com https://images.clerk.dev https://*.googleusercontent.com https://*.supabase.co https://*.onrender.com;
    media-src 'self' data: blob: https://res.cloudinary.com https://*.onrender.com;
    font-src 'self' https://fonts.gstatic.com https://api.fontshare.com https://cdn.fontshare.com;
    connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.clerk.dev wss://kovari.in https://socket.kovari.in wss://socket.kovari.in http://localhost:3005 ws://localhost:3005 https://vitals.vercel-insights.com https://api.cloudinary.com https://*.onrender.com wss://*.onrender.com https://*.clerk.accounts.dev https://clerk.kovari.in https://*.uploadthing.com;
    frame-src 'self' https://challenges.cloudflare.com;
    worker-src 'self' blob:;
    frame-ancestors 'none';
    object-src 'none';
    base-uri 'self';
    form-action 'self';
  `.replace(/\s{2,}/g, " ").trim();

  const pathname = req.nextUrl.pathname;

  // Inject nonce, CSP, and pathname to request headers
  req.headers.set("x-nonce", nonce);
  req.headers.set("Content-Security-Policy", cspHeader);
  req.headers.set("x-pathname", pathname);
  const isApiRoute = pathname.startsWith("/api/") || pathname.startsWith("/apiauth/");
  const origin = req.headers.get("origin") || "";
  
  // Handle preflight OPTIONS requests directly
  if (req.method === "OPTIONS" && isApiRoute) {
    const res = new NextResponse(null, { status: 204 });
    if (ALLOWED_ORIGINS.includes(origin)) {
      res.headers.set("Access-Control-Allow-Origin", origin);
    }
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id");
    return res;
  }

  const isAuthRoute = pathname.startsWith("/api/auth/");
  const authHeader = req.headers.get("authorization");
  
  let isMobileToken = false;
  if (authHeader?.startsWith("Bearer ") && !authHeader.includes("__clerk_session")) {
    try {
      const token = authHeader.substring(7);
      const parts = token.split(".");
      if (parts.length === 3) {
        const headerStr = Buffer.from(parts[0], "base64").toString("utf8");
        const header = JSON.parse(headerStr);
        if (header.alg === "HS256") {
          isMobileToken = true;
        }
      }
    } catch (e) {
      // Ignore parse errors, default to false
    }
  }

  let res: NextResponse;

  // 1. Bypass Clerk for Mobile Auth Routes (Prevents SyntaxError: Unexpected end of JSON input)
  if (isAuthRoute) {
    res = nextResponseWithHeaders(req);
  }
  // 2. Intercept Other Mobile JWTs (Avoid Clerk middleware crash on non-Clerk tokens)
  else if (isMobileToken) {
    res = nextResponseWithHeaders(req);
  }
  else {
    res = await (clerk as any)(req, evt);
  }

  // Apply dynamic CORS headers to the response
  if (isApiRoute && res) {
    if (ALLOWED_ORIGINS.includes(origin)) {
      res.headers.set("Access-Control-Allow-Origin", origin);
    }
    res.headers.set("Access-Control-Allow-Credentials", "true");
    res.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id");
  }

  // Apply Security Headers to all responses
  if (res) {
    res.headers.set("Content-Security-Policy", cspHeader);
    res.headers.set("X-Frame-Options", "DENY");
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  const mwDuration = performance.now() - mwStart;
  logPerformanceMetric("middleware_total_ms", mwDuration, { path: pathname, requestId: mwRequestId });

  // Sample homepage traffic at 10% to capture bot signals without log spam
  if (pathname === "/" && Math.random() < 0.1) {
    const authHeader = req.headers.get("authorization");
    const hasAuth = !!authHeader || req.cookies.has("__session");
    logPerformanceMetric("homepage_traffic", mwDuration, {
      path: pathname,
      userAgent: req.headers.get("user-agent"),
      referer: req.headers.get("referer"),
      authenticated: hasAuth,
      requestId: mwRequestId
    });
  }

  return res;
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};

