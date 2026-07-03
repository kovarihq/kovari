import { NextRequest } from "next/server";
import { verifyAccessToken } from "./jwt";
import { createRouteHandlerSupabaseClientWithServiceRole, isActiveBan } from "@kovari/api";

export interface UserContext {
  id: string;
}

/**
 * Extracts and verifies the JWT from the Authorization header for mobile requests.
 * Rejects banned users at the auth layer.
 */
export async function getUserFromRequest(req: NextRequest): Promise<UserContext | null> {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }

    const token = authHeader.split(" ")[1];
    const payload = verifyAccessToken(token);

    if (!payload || !payload.sub) {
      return null;
    }

    const { createRouteHandlerSupabaseClientWithServiceRole: getSupabase } = await import("@kovari/api");
    const supabase = getSupabase();

    if (payload.tokenHash) {
      const { data: session, error } = await supabase
        .from("refresh_tokens")
        .select("id")
        .eq("token_hash", payload.tokenHash)
        .maybeSingle();

      if (error || !session) {
        console.warn(`[AUTH] Rejected access token for user ${payload.sub} (Session invalid/logged out)`);
        return null;
      }
    }

    const { data: userRow } = await supabase
      .from("users")
      .select("banned, ban_expires_at")
      .eq("id", payload.sub)
      .maybeSingle();

    if (userRow && isActiveBan(userRow)) {
      console.warn(`[AUTH] Rejected access token for banned user ${payload.sub}`);
      return null;
    }

    return {
      id: payload.sub,
    };
  } catch (error) {
    console.error("Auth middleware error:", error);
    return null;
  }
}
