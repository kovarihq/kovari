import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@kovari/api";
import { requireAdmin } from "@/admin-lib/adminAuth";
import * as Sentry from "@sentry/nextjs";

export async function GET(req: NextRequest) {
  try {
    const { adminId, email } = await requireAdmin();
    Sentry.setUser({ id: adminId, email: email });
  } catch (error) {
    if (error instanceof NextResponse) return error;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch all internal test users
    const { data: users, error } = await supabaseAdmin
      .from("users")
      .select(`
        id,
        name,
        email,
        account_type,
        test_role,
        last_seen_at,
        created_at,
        onboarding_completed,
        profiles(username, profile_photo)
      `)
      .eq("account_type", "INTERNAL")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ users });
  } catch (error: any) {
    Sentry.captureException(error);
    return NextResponse.json({ error: error.message || "Failed to fetch test users" }, { status: 500 });
  }
}
