import { NextResponse, NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminSupabaseClient } from "@kovari/api";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { assertUUID } from "@/lib/validation/uuid";

export async function GET(req: NextRequest) {
  console.log("🛡️ [InboxAPI] GET Request started");

  try {
    let clerkUserId: string | null = null;
    let customUserId: string | null = null;

    // 1. Try Clerk Auth (Web)
    try {
      const authData = await auth();
      clerkUserId = authData.userId;
    } catch (e) {
      console.log("🛡️ [InboxAPI] Clerk auth failed/skipped, trying custom JWT");
    }

    // 2. Try Custom JWT (Mobile)
    if (!clerkUserId) {
      const authHeader = req.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        const payload = verifyAccessToken(token);
        if (payload) {
          customUserId = payload.sub;
          console.log("🛡️ [InboxAPI] Custom JWT verified for user:", customUserId);
        }
      }
    }

    if (!clerkUserId && !customUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createAdminSupabaseClient();
    
    // Resolve Supabase UUID from either source
    let userId: string;
    if (clerkUserId) {
      const { data: user, error } = await supabase
        .from("users")
        .select("id")
        .eq("clerk_user_id", clerkUserId)
        .maybeSingle();
      
      if (error || !user) throw new Error("User not found in database");
      userId = user.id;
    } else {
      userId = customUserId!;
    }

    console.log("🛡️ [InboxAPI] Querying messages for UUID:", userId);

    try {
      assertUUID(userId, "userId");
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }

    // Fetch blocked users to exclude them from the inbox
    const { data: blockedData } = await supabase
      .from("blocked_users")
      .select("blocked_id, blocker_id")
      .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);

    const blockedUserIds = new Set(
      (blockedData || []).map((b) =>
        b.blocker_id === userId ? b.blocked_id : b.blocker_id
      )
    );

    // Fetch unique conversations by getting messages where user is sender or receiver from deduplicated view
    const { data, error } = await supabase
      .from("latest_conversations")
      .select("*")
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("🛡️ [InboxAPI] DB Error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const processedData = data || [];
    console.log(`🛡️ [InboxAPI] Retrieved ${processedData.length} active conversations`);

    if (!processedData || processedData.length === 0) {
      return NextResponse.json({ messages: [] });
    }

    // Resolve Clerk IDs for all involved users
    const userIds = new Set<string>();
    userIds.add(userId); // Explicitly add current user
    (processedData || []).forEach(m => {
      userIds.add(m.sender_id);
      userIds.add(m.receiver_id);
    });

    // 1. Fetch from users table
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, clerk_user_id, name, email")
      .in("id", Array.from(userIds));

    // 2. Fetch from profiles table (Mapping by user_id!)
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("user_id, name, profile_photo, username")
      .in("user_id", Array.from(userIds));

    if (usersError) console.error("🛡️ [InboxAPI] Users lookup error:", usersError);
    if (profilesError) console.error("🛡️ [InboxAPI] Profiles lookup error:", profilesError);

    const clerkIdMap = new Map<string, string>();
    const identityMap = new Map<string, any>();
    
    // Process profiles first (high priority for friendly name and photo)
    (profiles || []).forEach(p => {
      if (p.user_id) {
        identityMap.set(p.user_id, {
          name: p.name,
          avatar: p.profile_photo,
          username: p.username
        });
      }
    });

    // Merge/Process users (authoritative for clerk_id and email)
    (users || []).forEach(u => {
      if (u.clerk_user_id) clerkIdMap.set(u.id, u.clerk_user_id);
      
      const existing = identityMap.get(u.id) || {};
      
      // IDENTITY PRIORITY: 
      // 1. Profile Name (Friendly)
      // 2. User Name (System)
      // 3. Email Prefix
      // 4. Fallback ID
      const bestName = existing.name || u.name || u.email?.split('@')[0] || `User ${u.id.substring(0, 4)}`;
      
      identityMap.set(u.id, {
        ...existing,
        name: bestName,
        avatar: existing.avatar || (u as any).profile_photo || (u as any).avatar || null,
        email: u.email
      });
      
      console.log(`🧪 [InboxAPI] Resolved Identity for ${u.id}: Name="${bestName}"`);
    });

    // Fallback: If we have clerkUserId (Web), ensure it's in the map
    if (clerkUserId) {
      clerkIdMap.set(userId, clerkUserId);
    }
    
    console.log(`🛡️ [InboxAPI] Resolved ${clerkIdMap.size} Clerk IDs and ${identityMap.size} identities`);

    // Group by partner and calculate canonical chatId
    console.log(`🛡️ [InboxAPI] Processing ${processedData?.length || 0} messages for user ${userId}`);
    const conversationsMap = new Map<string, any>();
    for (const msg of processedData || []) {
      try {
        const partnerId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
        if (!partnerId) continue;
        
        if (!conversationsMap.has(partnerId)) {
          const sorted = [userId, partnerId].sort();
          const chatId = `${sorted[0]}_${sorted[1]}`;
          const identity = identityMap.get(partnerId);
          
          conversationsMap.set(partnerId, {
            ...msg,
            chat_id: chatId,
            partner_id: partnerId,
            partner_name: identity?.name || "User",
            partner_avatar: identity?.avatar || null,
            sender_clerk_id: clerkIdMap.get(msg.sender_id) || "",
            receiver_clerk_id: clerkIdMap.get(msg.receiver_id) || "",
          });
        }
      } catch (err) {
        console.error(`🛡️ [InboxAPI] Error processing message ${msg.id}:`, err);
      }
    }

    const result = Array.from(conversationsMap.values());
    console.log(`🛡️ [InboxAPI] Returning ${result.length} unique conversations`);
    return NextResponse.json({ messages: result });
  } catch (error: any) {
    console.error("[GET /api/direct-chat/inbox] CRITICAL ERROR:", {
      message: error.message,
      stack: error.stack,
      details: error
    });
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 },
    );
  }
}


