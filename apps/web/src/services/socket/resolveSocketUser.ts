import { createAdminSupabaseClient } from "@kovari/api";
import { isActiveBan } from "@kovari/api";

/**
 * Map socket auth id to Supabase UUID; reject deleted or banned users.
 */
export async function resolveSupabaseUserIdFromAuthId(
  authUserId: string,
): Promise<string | null> {
  if (!authUserId) return null;

  const supabase = createAdminSupabaseClient();
  const UUID_REGEX =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

  const { data: byClerk } = await supabase
    .from("users")
    .select("id, banned, ban_expires_at")
    .eq("clerk_user_id", authUserId)
    .eq("isDeleted", false)
    .maybeSingle();

  if (byClerk?.id) {
    if (isActiveBan(byClerk)) return null;
    return byClerk.id;
  }

  if (UUID_REGEX.test(authUserId)) {
    const { data: byId } = await supabase
      .from("users")
      .select("id, banned, ban_expires_at")
      .eq("id", authUserId)
      .eq("isDeleted", false)
      .maybeSingle();
    if (byId?.id) {
      if (isActiveBan(byId)) return null;
      return byId.id;
    }
  }

  return null;
}

/**
 * Redis / socket.io presence keys use Clerk id when present, otherwise internal UUID (mobile).
 */
export async function presenceKeyForSupabaseUserId(
  supabaseUserId: string,
): Promise<string> {
  const UUID_REGEX =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

  if (!UUID_REGEX.test(supabaseUserId)) return supabaseUserId;

  const supabase = createAdminSupabaseClient();
  const { data } = await supabase
    .from("users")
    .select("clerk_user_id")
    .eq("id", supabaseUserId)
    .eq("isDeleted", false)
    .maybeSingle();

  return data?.clerk_user_id || supabaseUserId;
}
