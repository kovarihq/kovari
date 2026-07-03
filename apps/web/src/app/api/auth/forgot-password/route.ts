import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { randomBytes } from "crypto";
import { 
  ensureRedisConnection, 
  sendPasswordResetEmail,
  createRouteHandlerSupabaseClientWithServiceRole 
} from "@kovari/api";
import * as Sentry from "@sentry/nextjs";
import { checkRateLimit } from "@/lib/auth/rateLimit";
import { getProductionAppUrl } from "@/lib/config/site";

function maskEmail(email: string): string {
  if (!email) return "";
  const parts = email.split("@");
  if (parts.length !== 2) return email;
  const [local, domain] = parts;
  if (local.length <= 2) return `${local[0] || ""}*@${domain}`;
  return `${local.substring(0, 2)}${"*".repeat(local.length - 2)}@${domain}`;
}

const RESET_TOKEN_TTL_SECONDS = 3600; // 1 hour
const REDIS_KEY_PREFIX = "password_reset:";

function getBaseUrl(): string {
  return getProductionAppUrl();
}

export async function POST(req: NextRequest) {
  const rateLimitResult = await checkRateLimit(req, 'otp');
  if (!rateLimitResult.success) {
    const response = NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    response.headers.set('X-RateLimit-Limit', rateLimitResult.limit.toString());
    response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
    response.headers.set('X-RateLimit-Reset', rateLimitResult.reset.toString());
    return response;
  }

  try {
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const fromRaw = typeof body?.from === "string" ? body.from.trim() : "";
    const platform = typeof body?.platform === "string" ? body.platform.trim() : "web";
    const from =
      fromRaw === "settings" || fromRaw === "sign-in" ? fromRaw : undefined;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // 1. IP-Based Volumetric Protection (Industry Standard)
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip") || "127.0.0.1";
    const redis = await ensureRedisConnection();
    
    // 2. Advanced Idempotency Guard (Handles slow mobile networks/timeouts)
    // If the client sends the same requestId or we identify the same intent, we return the cached result.
    const idempotencyKey = req.headers.get("x-idempotency-key") || 
      `idempotency:forgot_password:${email}:${platform}`;
    const cachedResult = await redis.get(idempotencyKey);
    if (cachedResult) {
      console.log(`[AUTH] Idempotent request recognized for ${maskEmail(email)}. Returning cached result.`);
      return NextResponse.json(JSON.parse(cachedResult), { status: 200 });
    }

    const ipLimitKey = `rate_limit:forgot_password:ip:${ip}`;
    const ipCount = await redis.incr(ipLimitKey);
    if (ipCount === 1) await redis.expire(ipLimitKey, 3600); // 1 hour window
    if (ipCount > 15) {
      console.warn(`[SECURITY] Volumetric reset attempt blocked for IP: ${ip}`);
      return NextResponse.json(
        { error: "Too many requests. Please try again in an hour." },
        { status: 429 }
      );
    }

    // 2. Email-Based Exponential Backoff
    const backoffKey = `pwd_reset_backoff:email:${email}`;
    const attempts = parseInt((await redis.get(backoffKey)) || "0");
    
    // Cooldown logic: 1st=2m, 2rd=10m, 3rd+=30m
    const cooldownSeconds = attempts === 0 ? 120 : attempts === 1 ? 600 : 1800;
    const lastRequestKey = `pwd_reset_last:email:${email}`;
    const lastRequest = await redis.get(lastRequestKey);
    
    if (lastRequest) {
      const remaining = cooldownSeconds - (Math.floor(Date.now() / 1000) - parseInt(lastRequest));
      if (remaining > 0) {
        return NextResponse.json(
          { error: `Please wait ${Math.ceil(remaining / 60)} minutes before requesting another link.` },
          { status: 429 }
        );
      }
    }

    // 3. Global Consumer Success Response (Prevents User Enumeration)
    const successData = {
      success: true,
      message: "If that email is registered, you will receive a reset link shortly.",
    };

    const handleSuccess = async () => {
      // Industry Standard: Cache the successful result for idempotency (5 minute window)
      await redis.setEx(idempotencyKey, 300, JSON.stringify(successData));
      return NextResponse.json(successData, { status: 200 });
    };

    // 4. Check Identity
    const client = await clerkClient();
    const { data: users } = await client.users.getUserList({
      emailAddress: [email],
      limit: 1,
    });

    let userId = users[0]?.id;
    
    // 4.1 Check Identity in Supabase if not found in Clerk (Unified SOT fallback)
    if (!userId) {
      const supabase = createRouteHandlerSupabaseClientWithServiceRole();
      const { data: suUser } = await supabase
        .from("users")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      
      if (!suUser) {
        return handleSuccess();
      }
      userId = suUser.id;
    }

    // 5. Atomic Concurrency Lock (Ensures Single Dispatch)
    const lockKey = `pwd_reset_lock:email:${email}`;
    const acquired = await redis.set(lockKey, "locked", { NX: true, EX: 30 });
    if (!acquired) {
      return NextResponse.json(
        { error: "A reset email is already being sent. Please check your inbox." },
        { status: 429 }
      );
    }

    try {
      const token = randomBytes(32).toString("hex");
      const redisKey = `${REDIS_KEY_PREFIX}${token}`;

      // Store token data
      await redis.setEx(
        redisKey,
        RESET_TOKEN_TTL_SECONDS,
        JSON.stringify({ userId, email }),
      );

      const baseUrl = getBaseUrl();
      let resetLink = `${baseUrl}/forgot-password?token=${token}${
        from ? `&from=${encodeURIComponent(from)}` : ""
      }`;

      if (platform === "mobile") {
        resetLink = `kovari://reset-password?token=${token}`;
      }

      const result = await sendPasswordResetEmail({
        to: email,
        resetLink,
      });

      if (!result.success) {
        await redis.del(redisKey);
        throw new Error(result.error || "Email dispatch failed");
      }

      // 6. Update Backoff Stats after successful dispatch
      await redis.set(lastRequestKey, Math.floor(Date.now() / 1000).toString(), { EX: 1800 });
      await redis.incr(backoffKey);
      await redis.expire(backoffKey, 3600); // Reset backoff counter after 1 hour of quiet

      return handleSuccess();

    } catch (error: any) {
      console.error("Forgot password dispatch error:", error);
      Sentry.captureException(error, {
        tags: { endpoint: "/api/auth/forgot-password", email },
      });
      return NextResponse.json(
        { error: "Failed to send reset email. Please try again later." },
        { status: 503 },
      );
    } finally {
      // Always release the atomic lock
      await redis.del(lockKey);
    }
  } catch (error) {
    console.error("Forgot password critical error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again later." },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
