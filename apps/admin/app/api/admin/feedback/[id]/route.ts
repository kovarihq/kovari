import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@kovari/api";
import { requireAdmin } from "@/admin-lib/adminAuth";
import { logAdminAction } from "@/admin-lib/logAdminAction";
import * as Sentry from "@sentry/nextjs";
import { incrementErrorCounter } from "@/admin-lib/incrementErrorCounter";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { adminId, email } = await requireAdmin();
    Sentry.setUser({
      id: adminId,
      email: email,
    });
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: feedbackId } = await params;

    const { data: feedback, error: feedbackError } = await supabaseAdmin
      .from("feedback")
      .select(
        `
        id,
        user_id,
        type,
        message,
        page_url,
        created_at,
        status,
        users (
          email,
          name,
          beta_status,
          invite_date,
          activation_date,
          beta_batch,
          profiles (
            username
          )
        )
      `
      )
      .eq("id", feedbackId)
      .maybeSingle();

    if (feedbackError) {
      console.error("Error fetching feedback:", feedbackError);
      return NextResponse.json(
        { error: "Failed to fetch feedback details" },
        { status: 500 }
      );
    }

    if (!feedback) {
      return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    }

    // Fetch associated notes
    const { data: notes, error: notesError } = await supabaseAdmin
      .from("feedback_notes")
      .select(
        `
        id,
        note,
        created_at,
        admin_id,
        admins (
          email
        )
      `
      )
      .eq("feedback_id", feedbackId)
      .order("created_at", { ascending: true });

    if (notesError) {
      console.error("Error fetching feedback notes:", notesError);
    }

    // Fetch total feedback count for this user (for context panel)
    let feedbackCount = 0;
    if ((feedback as any).user_id) {
      const { count } = await supabaseAdmin
        .from("feedback")
        .select("*", { count: "exact", head: true })
        .eq("user_id", (feedback as any).user_id);
      feedbackCount = count ?? 0;
    }

    return NextResponse.json({
      feedback,
      notes: notes || [],
      feedbackCount,
    });
  } catch (error) {
    await incrementErrorCounter();
    Sentry.captureException(error, {
      tags: {
        scope: "admin-api",
        route: "GET /api/admin/feedback/[id]",
      },
    });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  let adminId: string;
  let adminEmail: string;
  try {
    const admin = await requireAdmin();
    adminId = admin.adminId;
    adminEmail = admin.email;
    Sentry.setUser({
      id: adminId,
      email: adminEmail,
    });
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: feedbackId } = await params;
    const { status } = await req.json();

    if (!status || !["new", "reviewing", "resolved"].includes(status)) {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }

    // Get old status to log diff
    const { data: oldFeedback } = await supabaseAdmin
      .from("feedback")
      .select("status, user_id")
      .eq("id", feedbackId)
      .maybeSingle();

    if (!oldFeedback) {
      return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    }

    const { error: updateError } = await supabaseAdmin
      .from("feedback")
      .update({ status })
      .eq("id", feedbackId);

    if (updateError) {
      console.error("Failed to update feedback status:", updateError);
      return NextResponse.json(
        { error: "Failed to update status" },
        { status: 500 }
      );
    }

    // Log admin action
    await logAdminAction({
      adminId,
      targetType: "feedback",
      targetId: feedbackId,
      action: `update_status_${status}`,
      reason: `Changed status from ${oldFeedback.status} to ${status}`,
      metadata: {
        old_status: oldFeedback.status,
        new_status: status,
        user_id: oldFeedback.user_id,
      },
    });

    return NextResponse.json({ success: true, status });
  } catch (error) {
    await incrementErrorCounter();
    Sentry.captureException(error, {
      tags: {
        scope: "admin-api",
        route: "PATCH /api/admin/feedback/[id]",
      },
    });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  let adminId: string;
  let adminEmail: string;
  try {
    const admin = await requireAdmin();
    adminId = admin.adminId;
    adminEmail = admin.email;
    Sentry.setUser({
      id: adminId,
      email: adminEmail,
    });
  } catch (error) {
    if (error instanceof NextResponse) {
      return error;
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: feedbackId } = await params;
    const { note } = await req.json();

    if (!note || typeof note !== "string" || !note.trim()) {
      return NextResponse.json({ error: "Note content is required" }, { status: 400 });
    }

    // Verify feedback exists
    const { data: feedback } = await supabaseAdmin
      .from("feedback")
      .select("id, user_id")
      .eq("id", feedbackId)
      .maybeSingle();

    if (!feedback) {
      return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    }

    const { data: newNote, error: insertError } = await supabaseAdmin
      .from("feedback_notes")
      .insert({
        feedback_id: feedbackId,
        admin_id: adminId,
        note: note.trim(),
      })
      .select(
        `
        id,
        note,
        created_at,
        admin_id,
        admins (
          email
        )
      `
      )
      .single();

    if (insertError) {
      console.error("Failed to insert feedback note:", insertError);
      return NextResponse.json(
        { error: "Failed to save internal note" },
        { status: 500 }
      );
    }

    // Log admin action
    await logAdminAction({
      adminId,
      targetType: "feedback",
      targetId: feedbackId,
      action: "add_feedback_note",
      reason: "Added internal feedback note",
      metadata: {
        note_id: newNote.id,
        user_id: feedback.user_id,
      },
    });

    return NextResponse.json({ success: true, note: newNote });
  } catch (error) {
    await incrementErrorCounter();
    Sentry.captureException(error, {
      tags: {
        scope: "admin-api",
        route: "POST /api/admin/feedback/[id]",
      },
    });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
