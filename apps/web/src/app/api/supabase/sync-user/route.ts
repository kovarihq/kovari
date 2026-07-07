import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { logPerformanceMetric, logInvocation } from "@/lib/observability/performance";
import { INTERNAL_TEST_USERS } from "@/../../packages/config/internal-test-users";


function maskEmail(email: string): string {
  if (!email) return "";
  const parts = email.split("@");
  if (parts.length !== 2) return email;
  const [local, domain] = parts;
  if (local.length <= 2) return `${local[0] || ""}*@${domain}`;
  return `${local.substring(0, 2)}${"*".repeat(local.length - 2)}@${domain}`;
}

export async function POST() {
  const start = performance.now();
  try {
    const res = await _POST();
    logPerformanceMetric("sync_user_total_ms", performance.now() - start);
    return res;
  } catch (err) {
    logPerformanceMetric("sync_user_total_ms", performance.now() - start, { error: true });
    throw err;
  }
}

async function _POST() {
  const syncRequestId = crypto.randomUUID().slice(0, 8);
  logInvocation("sync_user_invocation", { requestId: syncRequestId });
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("[api/supabase/sync-user] Missing server env");
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  try {
    const clerkStart = performance.now();
    const { clerkClient } = await import("@clerk/nextjs/server");
    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(userId);
    logPerformanceMetric("sync_user_clerk_ms", performance.now() - clerkStart, { requestId: syncRequestId });
    const email =
      clerkUser.primaryEmailAddress?.emailAddress ||
      clerkUser.emailAddresses[0]?.emailAddress;

    if (!email) {
      console.error("[api/supabase/sync-user] No email found for Clerk user", userId);
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    console.log(`[SYNC-USER] Starting identity resolution for: ${userId} (${maskEmail(email)})`);

    // ─── BETA GATE: Auto-provision access if email is approved ───────────────
    if (process.env.LAUNCH_WAITLIST_MODE === "true") {
      const isProvisioned = await provisionBetaAccessIfApproved(supabase, email, userId);
      if (!isProvisioned) {
        // Not a beta user. Reject sync.
        console.log(`[BETA-GATE] Rejecting sync for non-beta user: ${maskEmail(email)}`);
        return NextResponse.json({ error: "Access restricted. Beta not yet available." }, { status: 403 });
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Atomic identity sync (unchanged from your existing logic)
    const rpcStart = performance.now();
    const { data: userIdFromRpc, error: syncError } = await supabase.rpc(
      "sync_user_identity",
      {
        p_email: email,
        p_name: `${clerkUser.firstName || ""} ${clerkUser.lastName || ""}`.trim(),
        p_clerk_id: userId,
        p_google_id: null,
        p_password_hash: null,
      }
    );
    logPerformanceMetric("sync_user_rpc_ms", performance.now() - rpcStart, { requestId: syncRequestId });

    if (syncError) {
      console.error("[api/supabase/sync-user] Identity sync failed:", syncError);
      return NextResponse.json({ error: "Identity resolution failed" }, { status: 500 });
    }

    const dbStart = performance.now();
    const { data: user, error: fetchError } = await supabase
      .from("users")
      .select('id, "isDeleted", beta_status, activation_date')
      .eq("id", userIdFromRpc)
      .single();
    logPerformanceMetric("sync_user_db_ms", performance.now() - dbStart, { requestId: syncRequestId });

    if (fetchError || !user) {
      console.error("[api/supabase/sync-user] Post-sync verification failed", fetchError);
      return NextResponse.json({ error: "Failed to verify synced identity" }, { status: 500 });
    }

    // Always activate users so they can access Kovari and be correctly counted in the analytics dashboard
    const emailLower = email.toLowerCase().trim();
    const testUser = INTERNAL_TEST_USERS.find(
      (u) => u.email.toLowerCase() === emailLower || u.prodEmail.toLowerCase() === emailLower
    );

    const updatePayload: any = {
      last_seen_at: new Date().toISOString()
    };

    if (user.beta_status !== "activated") {
      updatePayload.beta_status = "activated";
      updatePayload.activation_date = user.activation_date || new Date().toISOString();
    }

    if (testUser) {
      updatePayload.account_type = "INTERNAL";
      updatePayload.test_role = testUser.role;
    }

    const { error: userUpdateError } = await supabase
      .from("users")
      .update(updatePayload)
      .eq("id", userIdFromRpc);

    if (userUpdateError) {
      console.error("[SYNC-USER] Failed to update user details:", userUpdateError);
    }

    if (user.isDeleted === true) {
      return NextResponse.json({ error: "Account has been deleted" }, { status: 403 });
    }

    return NextResponse.json({ success: true, userId: user.id }, { status: 200 });
  } catch (e) {
    console.error("[api/supabase/sync-user] Unexpected error", e);
    Sentry.captureException(e, {
      tags: { endpoint: "/api/supabase/sync-user", action: "handler_error" },
      extra: { clerkUserId: userId },
    });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * If the user's email is marked 'beta_invited' in waitlist,
 * auto-insert them into launch_bypass_users and mark them active.
 * Safe to call multiple times — uses upsert, won't duplicate.
 */
async function provisionBetaAccessIfApproved(
  supabase: any,
  email: string,
  clerkUserId: string
): Promise<boolean> {
  try {
    // 1. Check if already provisioned (fast path — avoids unnecessary writes)
    const { data: existing } = await supabase
      .from("launch_bypass_users")
      .select("clerk_user_id")
      .eq("clerk_user_id", clerkUserId)
      .maybeSingle();

    if (existing) {
      console.log(`[BETA-GATE] Already provisioned: ${clerkUserId}`);
      return true;
    }

    // 2. Check if email is approved in waitlist
    const { data: waitlistEntry } = await supabase
      .from("waitlist")
      .select("id, status, email, beta_batch")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    if (!waitlistEntry || (waitlistEntry.status !== "beta_invited" && waitlistEntry.status !== "beta_active")) {
      console.log(`[BETA-GATE] Email not approved for beta: ${maskEmail(email)}`);
      return false;
    }

    // 3. Provision beta access
    const { error: insertError } = await supabase
      .from("launch_bypass_users")
      .upsert(
        {
          clerk_user_id: clerkUserId,
          tier: "beta",
          email: email.toLowerCase().trim(),
          notes: `Auto-provisioned from waitlist on signup/signin`,
          added_at: new Date().toISOString(),
        },
        { onConflict: "clerk_user_id" }
      );

    if (insertError) {
      console.error("[BETA-GATE] Failed to insert into launch_bypass_users:", insertError);
      return false;
    }

    // 4. Update waitlist status to beta_active
    await supabase
      .from("waitlist")
      .update({ 
        status: "beta_active",
        activated_at: new Date().toISOString()
      })
      .eq("id", waitlistEntry.id);

    // 5. Propagate beta_batch from waitlist to users
    if (waitlistEntry.beta_batch) {
      const { data: userByEmail } = await supabase
        .from("users")
        .select("id")
        .eq("email", email.toLowerCase().trim())
        .maybeSingle();
      if (userByEmail) {
        await supabase
          .from("users")
          .update({ beta_batch: waitlistEntry.beta_batch })
          .eq("id", userByEmail.id);
      }
    }

    console.log(`[BETA-GATE] ✅ Beta access provisioned for: ${maskEmail(email)} (${clerkUserId})`);
    return true;
  } catch (err) {
    // Non-fatal — log but don't block user sync
    console.error("[BETA-GATE] Unexpected error in provisionBetaAccessIfApproved:", err);
    return false;
  }
}

