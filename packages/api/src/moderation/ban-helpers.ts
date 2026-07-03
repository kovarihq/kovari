import { supabaseAdmin } from "../supabase-admin";
import { isActiveBan } from "./ban-gate";

/** Check whether a user can receive notifications (in-app, push, email). */
export async function canUserReceiveNotifications(userId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from("users")
      .select("banned, ban_expires_at")
      .eq("id", userId)
      .maybeSingle();

    if (!data) return false;
    return !isActiveBan(data);
  } catch {
    return false;
  }
}

/** Returns true when a profile should be hidden from other users (actively banned). */
export async function isProfileHiddenDueToBan(userId: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from("users")
      .select("banned, ban_expires_at")
      .eq("id", userId)
      .maybeSingle();

    if (!data) return true;
    return isActiveBan(data);
  } catch {
    return true;
  }
}
