import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createAdminSupabaseClient } from "@kovari/api";
import { buildMessageInsertPayload } from "@/services/messaging/persistence";
import { MESSAGE_MIGRATION_VERSION } from "@kovari/types";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { groupId } = await params;
    const searchParams = req.nextUrl.searchParams;
    const cursor = searchParams.get("cursor"); // created_at ISO timestamp
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    const supabase = createAdminSupabaseClient();

    // Get user's internal ID
    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("clerk_user_id", userId)
      .eq("isDeleted", false)
      .single();

    if (userError || !userRow) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

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

    const isCreator = group.creator_id === userRow.id;
    if (group.status === "pending" && !isCreator) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    if (!isCreator) {
      const { data: membership } = await supabase
        .from("group_memberships")
        .select("status")
        .eq("group_id", groupId)
        .eq("user_id", userRow.id)
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
        encrypted_content,
        encryption_iv,
        encryption_salt,
        is_encrypted,
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

    // Transform messages to include sender info and format timestamps
    const formattedMessages =
      sortedMessages?.map((message: any) => {
        const profile = message.users?.profiles;
        const isDeleted = profile?.deleted === true;

        return {
          id: message.id,
          encrypted_content: message.encrypted_content,
          encryption_iv: message.encryption_iv,
          encryption_salt: message.encryption_salt,
          is_encrypted: message.is_encrypted,
          timestamp: new Date(message.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Kolkata",
          }),
          sender: isDeleted ? "Deleted User" : profile?.name || "Unknown User",
          senderUsername: isDeleted ? undefined : profile?.username,
          senderId: message.user_id ?? message.users?.id,
          avatar: isDeleted ? undefined : profile?.profile_photo,
          isCurrentUser: message.user_id === userRow.id,
          createdAt: message.created_at,
          mediaUrl: message.media_url || undefined,
          mediaType: message.media_type || undefined,
        };
      }) || [];

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
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { groupId } = await params;

    // Read the request body once
    const body = await req.json();
    const {
      encryptedContent,
      encryptionIv,
      encryptionSalt,
      isEncrypted,
      mediaUrl,
      mediaType,
      text,
    } = body;

    const supabase = createAdminSupabaseClient();

    // Get user's internal ID
    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("clerk_user_id", userId)
      .eq("isDeleted", false)
      .single();

    if (userError || !userRow) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

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
    const isCreator = group.creator_id === userRow.id;
    if (!isCreator) {
      const { data: membership } = await supabase
        .from("group_memberships")
        .select("status")
        .eq("group_id", groupId)
        .eq("user_id", userRow.id)
        .maybeSingle();

      if (membership?.status !== "accepted") {
        return NextResponse.json(
          { error: "Not a member of this group" },
          { status: 403 },
        );
      }
    }

    // Allow: (A) encrypted text message, (B) media-only message, (C) both
    if (
       (isEncrypted && encryptedContent && encryptionIv && encryptionSalt) ||
       (mediaUrl && mediaType)
    ) {
      const textVal = typeof text === "string" ? text : null;
      const migrationVersion = (textVal !== null)
        ? MESSAGE_MIGRATION_VERSION.DUAL_PERSISTENCE
        : MESSAGE_MIGRATION_VERSION.LEGACY_E2EE;

      const basePayload = buildMessageInsertPayload({
        encryptedContent,
        iv: encryptionIv,
        salt: encryptionSalt,
        isEncrypted,
        text: textVal,
        mediaUrl,
        mediaType,
        migrationVersion,
      });

      const messageData = {
        ...basePayload,
        group_id: groupId,
        user_id: userRow.id,
      };

      const { data: inserted, error: insertError } = await supabase
        .from("group_messages")
        .insert([messageData])
        .select(
          `
          id,
          encrypted_content,
          encryption_iv,
          encryption_salt,
          is_encrypted,
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
      // Return the inserted message (with encrypted and media fields)
      return NextResponse.json({
        id: inserted.id,
        encryptedContent: inserted.encrypted_content,
        encryptionIv: inserted.encryption_iv,
        encryptionSalt: inserted.encryption_salt,
        isEncrypted: inserted.is_encrypted,
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
