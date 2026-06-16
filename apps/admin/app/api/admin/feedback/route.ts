import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@kovari/api";
import { requireAdmin } from "@/admin-lib/adminAuth";
import * as Sentry from "@sentry/nextjs";
import { incrementErrorCounter } from "@/admin-lib/incrementErrorCounter";

export async function GET(req: NextRequest) {
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
    const { searchParams } = new URL(req.url);
    const query = (searchParams.get("query") || "").trim();
    const status = searchParams.get("status") || ""; // 'new', 'reviewing', 'resolved'
    const type = searchParams.get("type") || ""; // 'bug', 'suggestion', 'other'
    const page = Number(searchParams.get("page") || "1");
    const limit = Number(searchParams.get("limit") || "20");
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let base = supabaseAdmin.from("feedback").select(
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
          name
        )
      `,
      { count: "exact" }
    );

    if (status) {
      base = base.eq("status", status);
    }
    
    if (type) {
      base = base.eq("type", type);
    }

    if (query) {
      // Search in message, users email, or users name
      base = base.or(`message.ilike.%${query}%,users.email.ilike.%${query}%,users.name.ilike.%${query}%`);
    }

    // Order by newest feedback first
    base = base.order("created_at", { ascending: false });

    const { data, count, error } = await base.range(from, to);

    if (error) {
      console.error("Error fetching feedback:", error);
      return NextResponse.json(
        { error: "Failed to fetch feedback" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      page,
      limit,
      total: count || 0,
      feedback: data || [],
    });
  } catch (error) {
    await incrementErrorCounter();
    Sentry.captureException(error, {
      tags: {
        scope: "admin-api",
        route: "GET /api/admin/feedback",
      },
    });
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
