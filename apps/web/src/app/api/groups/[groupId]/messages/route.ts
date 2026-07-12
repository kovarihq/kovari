import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@kovari/api";
import { getAuthenticatedUser } from "@/lib/auth/get-user";
import { buildMessageInsertPayload } from "@/services/messaging/persistence";
import { pubClient, connectRedis } from "@/services/socket/redis";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { groupId } = await params;
    const searchParams = req.nextUrl.searchParams;
    const cursor = searchParams.get("cursor"); // created_at ISO timestamp
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    const supabase = createAdminSupabaseClient();

    // Check group + access (creator or accepted member)
    const { data: group, error: groupError } = await supabase
      .from("groups")
      .select("id, status, creator_id")
      .eq("id", groupId)
      .single();

    if (groupError || !group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    if (group.status === "removed") {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const isCreator = group.creator_id === authUser.id;
    if (group.status === "pending" && !isCreator) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    if (!isCreator) {
      const { data: membership } = await supabase
        .from("group_memberships")
        .select("status")
        .eq("group_id", groupId)
        .eq("user_id", authUser.id)
        .maybeSingle();

      if (membership?.status !== "accepted") {
        return NextResponse.json(
          { error: "Not a member of this group" },
          { status: 403 },
        );
      }
    }

    // Fetch messages with sender information using cursor-based pagination
    let query = supabase
      .from("group_messages")
      .select(
        `
        id,
        message_content,
        migration_version,
        created_at,
        user_id,
        media_url,
        media_type,
        conversation_sequence,
        global_sequence,
        users(
          id,
          profiles(
            name,
            username,
            profile_photo,
            deleted
          )
        )
      `,
      )
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data: messages, error: messagesError } = await query;

    if (messagesError) {
      console.error("Error fetching messages:", messagesError);
      return NextResponse.json(
        { error: "Failed to fetch messages" },
        { status: 500 },
      );
    }

    // Reverse messages to maintain chronological order in the response
    const sortedMessages = [...(messages || [])].reverse();

    await connectRedis();

    const countKey = `group_member_count:${groupId}`;
    const cachedCount = await pubClient.get(countKey);
    let memberCount = cachedCount ? parseInt(cachedCount) : 0;
    if (!memberCount) {
      const { count } = await supabase
        .from("group_memberships")
        .select("*", { count: "exact", head: true })
        .eq("group_id", groupId)
        .eq("status", "accepted");
      memberCount = count || 0;
      await pubClient.set(countKey, memberCount.toString(), { EX: 300 });
    }

    const formattedMessages = [];
    for (const message of sortedMessages as any[]) {
      const profile = message.users?.profiles;
      const isDeleted = profile?.deleted === true;

      const setKey = `group_msg_seen:${groupId}:${message.id}`;
      const seenCount = await pubClient.sCard(setKey);
      const isFullySeen = seenCount >= memberCount - 1 && memberCount > 1;

      formattedMessages.push({
        id: message.id,
        message_content: message.message_content,
        migration_version: message.migration_version,
        timestamp: new Date(message.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Kolkata",
        }),
        sender: isDeleted ? "Deleted User" : profile?.name || "Unknown User",
        senderUsername: isDeleted ? undefined : profile?.username,
        senderId: message.user_id ?? message.users?.id,
        avatar: isDeleted ? undefined : profile?.profile_photo,
        isCurrentUser: message.user_id === authUser.id,
        createdAt: message.created_at,
        mediaUrl: message.media_url || undefined,
        mediaType: message.media_type || undefined,
        conversationSequence: message.conversation_sequence,
        serverSequence: message.global_sequence,
        conversation_sequence: message.conversation_sequence,
        server_sequence: message.global_sequence,
        deliveryStatus: isFullySeen ? "seen" : "delivered",
      });
    }

    return NextResponse.json(formattedMessages);
  } catch (error) {
    console.error("[GET_MESSAGES]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const authUser = await getAuthenticatedUser(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { groupId } = await params;

    // Read the request body once
    const body = await req.json();
    const {
      mediaUrl,
      mediaType,
      text,
    } = body;

    const supabase = createAdminSupabaseClient();

    // Check if group exists and is not removed
    const { data: group, error: groupError } = await supabase
      .from("groups")
      .select("id, status, creator_id")
      .eq("id", groupId)
      .single();

    if (groupError || !group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // Block access to removed groups
    if (group.status === "removed") {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    // Block posting messages to pending groups (even for creators)
    if (group.status === "pending") {
      return NextResponse.json(
        { error: "Cannot send messages while group is under review" },
        { status: 403 },
      );
    }

    // Check creator or accepted membership
    const isCreator = group.creator_id === authUser.id;
    if (!isCreator) {
      const { data: membership } = await supabase
        .from("group_memberships")
        .select("status")
        .eq("group_id", groupId)
        .eq("user_id", authUser.id)
        .maybeSingle();

      if (membership?.status !== "accepted") {
        return NextResponse.json(
          { error: "Not a member of this group" },
          { status: 403 },
        );
      }
    }

    if (text || (mediaUrl && mediaType)) {
      const textVal = typeof text === "string" ? text : null;
      const outgoingContract = {
        messageContent: textVal,
        encryptedContent: null,
        iv: null,
        salt: null,
        isEncrypted: false,
        mediaUrl: typeof mediaUrl === "string" ? mediaUrl : null,
        mediaType: mediaType === "image" || mediaType === "video" ? mediaType : null,
      };

      const basePayload = buildMessageInsertPayload({
        text: outgoingContract.messageContent,
        mediaUrl: outgoingContract.mediaUrl,
        mediaType: outgoingContract.mediaType,
      });

      const messageData = {
        ...basePayload,
        group_id: groupId,
        user_id: authUser.id,
      };

      const { data: inserted, error: insertError } = await supabase
        .from("group_messages")
        .insert([messageData])
        .select(
          `
          id,
          message_content,
          migration_version,
          created_at,
          user_id,
          media_url,
          media_type,
          users(
            id,
            profiles(
              name,
              username,
              profile_photo,
              deleted
            )
          )
        `,
        )
        .single();
      if (insertError) {
        return NextResponse.json(
          { error: "Failed to insert message", details: insertError.message },
          { status: 500 },
        );
      }
      const profile = (inserted as any).users?.profiles;
      const isDeleted = profile?.deleted === true;
      // Return the inserted message
      return NextResponse.json({
        id: inserted.id,
        createdAt: inserted.created_at,
        sender: isDeleted ? "Deleted User" : profile?.name || "Unknown User",
        senderUsername: isDeleted ? undefined : profile?.username,
        senderId: inserted.user_id,
        avatar: isDeleted ? undefined : profile?.profile_photo,
        mediaUrl: inserted.media_url ?? undefined,
        mediaType: inserted.media_type ?? undefined,
      });
    } else {
      return NextResponse.json(
        {
          error:
            "Only encrypted or media messages are supported. Missing required fields.",
        },
        { status: 400 },
      );
    }
  } catch (error) {
    console.error("[POST_MESSAGE]", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
