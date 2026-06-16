import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { sendBetaInviteEmail } from "@kovari/api";

async function isAdmin(userId: string, supabase: any): Promise<boolean> {
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const clerk = await clerkClient();
    const clerkUser = await clerk.users.getUser(userId);
    const email =
      clerkUser.primaryEmailAddress?.emailAddress ||
      clerkUser.emailAddresses[0]?.emailAddress;

    if (!email) return false;

    const { data } = await supabase
      .from("admins")
      .select("id")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();

    return !!data;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  // 1. Auth — only admins
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  if (!(await isAdmin(userId, supabase))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  // Support two modes:
  // { emails: ["a@x.com", "b@x.com"] } — specific emails
  // { batch_size: 20 } — auto-pick next N 'new' signups from waitlist
  const { emails, batch_size, beta_batch } = body as {
    emails?: string[];
    batch_size?: number;
    beta_batch?: string;
  };

  let targetEmails: string[] = [];

  if (emails?.length) {
    targetEmails = emails.map((e) => e.toLowerCase().trim());
  } else if (batch_size) {
    const { data, error } = await supabase
      .from("waitlist")
      .select("email")
      .eq("status", "new")
      .order("created_at", { ascending: true })
      .limit(batch_size);

    if (error || !data) {
      return NextResponse.json({ error: "Failed to fetch waitlist batch" }, { status: 500 });
    }
    targetEmails = data.map((r) => r.email);
  } else {
    return NextResponse.json(
      { error: "Provide either 'emails' array or 'batch_size'" },
      { status: 400 }
    );
  }

  if (targetEmails.length === 0) {
    return NextResponse.json({ message: "No eligible emails found", sent: 0 });
  }

  // 2. Mark as beta_invited + send emails
  const results = { sent: 0, failed: [] as string[], already_invited: [] as string[] };

  for (const email of targetEmails) {
    // Check current status
    const { data: entry } = await supabase
      .from("waitlist")
      .select("id, status")
      .eq("email", email)
      .maybeSingle();

    if (!entry) {
      // Email not in waitlist — skip (don't add arbitrary emails)
      results.failed.push(`${email} (not in waitlist)`);
      continue;
    }

    if (entry.status === "beta_active") {
      results.already_invited.push(email);
      continue;
    }

    // Mark as invited if not already
    if (entry.status !== "beta_invited") {
      const updatePayload: Record<string, unknown> = { 
        status: "beta_invited",
        invite_sent_at: new Date().toISOString()
      };
      if (beta_batch) updatePayload.beta_batch = beta_batch;

      const { error: updateError } = await supabase
        .from("waitlist")
        .update(updatePayload)
        .eq("id", entry.id);

      if (updateError) {
        results.failed.push(`${email} (db update failed)`);
        continue;
      }
    } else if (beta_batch) {
      // Already invited — still update batch if provided
      await supabase
        .from("waitlist")
        .update({ beta_batch })
        .eq("id", entry.id);
    }

    // Send invite email using robust utility
    const emailResult = await sendBetaInviteEmail({ to: email });

    if (emailResult.success) {
      results.sent++;

      // Update the user table if a row already exists for this email
      const { data: userRow } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (userRow) {
        const userUpdatePayload: Record<string, unknown> = {
          beta_status: "invited",
          invite_date: new Date().toISOString()
        };
        if (beta_batch) userUpdatePayload.beta_batch = beta_batch;

        await supabase
          .from("users")
          .update(userUpdatePayload)
          .eq("id", userRow.id);
      }
    } else {
      // Rollback status if email failed
      await supabase
        .from("waitlist")
        .update({ 
          status: "new",
          invite_sent_at: null
        })
        .eq("id", entry.id);
      results.failed.push(`${email} (email send failed)`);
    }
  }

  return NextResponse.json({
    success: true,
    ...results,
    total_processed: targetEmails.length,
  });
}
