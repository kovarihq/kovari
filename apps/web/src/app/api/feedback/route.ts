import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";

const FeedbackSchema = z.object({
  type: z.enum(["bug", "suggestion", "other"]),
  message: z.string().min(5, "Message too short").max(2000, "Message too long"),
  page_url: z.string().optional().nullable(),
});

async function sendFeedbackEmail(payload: {
  type: string;
  message: string;
  pageUrl?: string;
  userEmail?: string;
  userId?: string;
  submittedAt: string;
}) {
  const { feedbackAlertEmail } = await import("@kovari/api");

  const html = feedbackAlertEmail(payload);

  await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": process.env.BREVO_API_KEY!,
    },
    body: JSON.stringify({
      sender: { name: "Kovari Feedback", email: "noreply@kovari.in" },
      to: [{ email: "navneetprajapati46@gmail.com" }], // your email
      subject: `[Kovari Beta] ${payload.type.toUpperCase()}: ${payload.message.slice(0, 60)}${payload.message.length > 60 ? "..." : ""}`,
      htmlContent: html,
    }),
  });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 }
    );
  }

  const { type, message, page_url } = parsed.data;

  try {
    // Get user email for the alert
    const { data: user } = await supabase
      .from("users")
      .select("id, email")
      .eq("clerk_user_id", userId)
      .maybeSingle();

    // Insert feedback
    const { error: insertError } = await supabase.from("feedback").insert({
      user_id: user?.id ?? null,
      type,
      message,
      page_url: page_url || null,
    });

    if (insertError) {
      console.error("[feedback] Insert error:", insertError);
      return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
    }

    // Fire email alert (non-blocking — don't fail the request if email fails)
    sendFeedbackEmail({
      type,
      message,
      pageUrl: page_url || "",
      userEmail: user?.email ?? undefined,
      userId: user?.id ?? undefined,
      submittedAt: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
    }).catch((err) => {
      console.error("[feedback] Email alert failed:", err);
      Sentry.captureException(err, { tags: { endpoint: "/api/feedback" } });
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("[feedback] Unexpected error:", err);
    Sentry.captureException(err, { tags: { endpoint: "/api/feedback" } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
