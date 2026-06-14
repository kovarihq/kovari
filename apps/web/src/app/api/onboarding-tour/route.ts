import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  // Fetch everything needed to compute step completion in one query
  const { data: user } = await supabase
    .from("users")
    .select("id, onboarding_tour_completed")
    .eq("clerk_user_id", userId)
    .single();

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (user.onboarding_tour_completed) {
    return NextResponse.json({ completed: true });
  }

  // Check profile photo
  const { data: profile } = await supabase
    .from("profiles")
    .select("profile_photo")
    .eq("user_id", user.id)
    .single();

  // Check if user has sent any match interest
  const { count: interestCount } = await supabase
    .from("match_interests")
    .select("id", { count: "exact", head: true })
    .eq("from_user_id", user.id);

  // Check if user has skipped any travelers
  const { count: skipCount } = await supabase
    .from("match_skips")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  // Check if user is in any group
  const { count: groupCount } = await supabase
    .from("group_memberships")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  // Check if user has sent any message
  const { count: messageCount } = await supabase
    .from("direct_messages")
    .select("id", { count: "exact", head: true })
    .eq("sender_id", user.id);

  return NextResponse.json({
    completed: false,
    steps: {
      profile_photo: !!profile?.profile_photo,
      explored_match: ((interestCount ?? 0) + (skipCount ?? 0)) > 0,
      joined_group: (groupCount ?? 0) > 0,
      sent_message: (messageCount ?? 0) > 0,
    },
  });
}

export async function PATCH() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  await supabase
    .from("users")
    .update({ onboarding_tour_completed: true })
    .eq("clerk_user_id", userId);

  return NextResponse.json({ success: true });
}
