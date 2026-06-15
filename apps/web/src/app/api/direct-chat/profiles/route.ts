import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminSupabaseClient } from "@kovari/api";

export async function POST(req: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const userIds: string[] = Array.isArray(body?.userIds)
      ? body.userIds.filter((v: unknown): v is string => typeof v === "string")
      : [];

    if (userIds.length === 0) {
      return NextResponse.json({ profiles: [] });
    }

    const supabase = createAdminSupabaseClient();

    // 1. Separate inputs into Clerk IDs ('user_...') and UUIDs
    const clerkIds = userIds.filter(id => id.startsWith("user_"));
    const uuids = userIds.filter(id => !id.startsWith("user_"));

    // 2. Fetch User mappings in bulk
    let userMappings: { id: string; clerk_user_id: string | null }[] = [];
    if (clerkIds.length > 0 || uuids.length > 0) {
      const conditions: string[] = [];
      if (clerkIds.length > 0) {
        conditions.push(`clerk_user_id.in.(${clerkIds.join(",")})`);
      }
      if (uuids.length > 0) {
        conditions.push(`id.in.(${uuids.join(",")})`);
      }
      const { data, error } = await supabase
        .from("users")
        .select("id, clerk_user_id")
        .or(conditions.join(","));
      
      if (error) {
        console.error("Profiles lookup DB error mapping users:", error);
      } else {
        userMappings = data || [];
      }
    }

    const internalIds = Array.from(new Set([
      ...uuids,
      ...userMappings.map(u => u.id)
    ]));

    // 3. Fetch Profiles in bulk
    let profilesData: { user_id: string; name: string | null; username: string | null; profile_photo: string | null; deleted: boolean | null }[] = [];
    if (internalIds.length > 0) {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, name, username, profile_photo, deleted")
        .in("user_id", internalIds);

      if (error) {
        console.error("Profiles lookup DB error fetching profiles:", error);
      } else {
        profilesData = data || [];
      }
    }

    // 4. Map DB results to local lookup maps
    const mappingMap = new Map<string, string>(userMappings.filter(u => u.clerk_user_id !== null).map(u => [u.clerk_user_id!, u.id]));
    const clerkIdMap = new Map<string, string>(userMappings.filter(u => u.clerk_user_id !== null).map(u => [u.id, u.clerk_user_id!]));
    const profileMap = new Map(profilesData.map(p => [p.user_id, p]));

    // 5. Build canonical output array matching original keys
    const validProfiles = userIds.map(id => {
      const isClerk = id.startsWith("user_");
      const internalId = isClerk ? mappingMap.get(id) : id;
      if (!internalId) return null;

      const clerkId = isClerk ? id : clerkIdMap.get(internalId) || null;
      const profile = profileMap.get(internalId);

      if (profile || clerkId) {
        return {
          user_id: internalId,
          clerk_id: clerkId,
          name: profile?.name || "User",
          username: profile?.username || "user",
          profile_photo: profile?.profile_photo,
          deleted: profile?.deleted || false
        };
      }
      return null;
    }).filter(p => p !== null);
    return NextResponse.json({ profiles: validProfiles });
  } catch (error) {
    console.error("[POST /api/direct-chat/profiles] error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}


