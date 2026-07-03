import { supabaseAdmin } from "@kovari/api";

/** Revoke all Clerk sessions for a Supabase user (web clients). */
export async function revokeClerkSessionsForUser(userId: string): Promise<void> {
  try {
    const { data: userData } = await supabaseAdmin
      .from("users")
      .select("clerk_user_id")
      .eq("id", userId)
      .single();

    if (!userData?.clerk_user_id) return;

    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const sessions = await client.sessions.getSessionList({
      userId: userData.clerk_user_id,
    });
    for (const session of sessions.data) {
      await client.sessions.revokeSession(session.id);
    }
  } catch (err) {
    console.error("[Admin] Failed to revoke Clerk sessions:", err);
  }
}
