import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient, AI } from "@kovari/api";
import { getAuthenticatedUser } from "@/lib/auth/get-user";
import { NotificationType } from "@kovari/types";
import { createNotification } from "../../../../lib/notifications/createNotification";
import { buildMessageInsertPayload } from "@/services/messaging/persistence";

const { logMatchEvent, createMatchEventLog } = AI.Logging;
const { extractFeaturesForSoloMatch } = AI.FeatureExtraction;
import { getSetting } from "@kovari/utils";

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);
    const body = await request.json();
    const { interestId, action } = body;

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!interestId || !["accept", "decline"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid parameters" },
        { status: 400 }
      );
    }

    const status = action === "accept" ? "accepted" : "rejected";

    const supabaseAdmin = createAdminSupabaseClient();
    const { data: updatedInterest, error } = await supabaseAdmin
      .from("match_interests")
      .update({ status })
      .eq("id", interestId)
      .select()
      .single();

    if (error) {
      console.error("Error updating interest:", error);
      return NextResponse.json(
        { error: "Failed to update interest" },
        { status: 500 }
      );
    }

    // If accepted, check for mutual interest and create match
    if (action === "accept" && updatedInterest) {
      const senderId = updatedInterest.from_user_id; // The person who sent the interest
      const receiverId = updatedInterest.to_user_id; // The current user who accepted it
      const destinationId = updatedInterest.destination_id;

      console.log("[interests/respond] Interest accepted:", {
        interestId,
        senderId,
        receiverId,
        destinationId,
      });

      // Check if there's a reverse interest (mutual match) - check both pending and accepted
      // First, let's check all reverse interests to see what exists
      const { data: allReverseInterests, error: reverseError } =
        await supabaseAdmin
          .from("match_interests")
          .select("id, status, destination_id, match_type")
          .eq("from_user_id", receiverId)
          .eq("to_user_id", senderId)
          .eq("match_type", "solo")
          .maybeSingle();

      console.log(
        "[interests/respond] All reverse interests (any destination):",
        {
          found: !!allReverseInterests,
          data: allReverseInterests,
          error: reverseError,
        }
      );

      // Now check with exact destination match
      const { data: reverseInterest } = await supabaseAdmin
        .from("match_interests")
        .select("id, status")
        .eq("from_user_id", receiverId)
        .eq("to_user_id", senderId)
        .eq("destination_id", destinationId)
        .eq("match_type", "solo")
        .in("status", ["pending", "accepted"])
        .maybeSingle();

      console.log(
        "[interests/respond] Reverse interest check (exact destination):",
        {
          found: !!reverseInterest,
          reverseStatus: reverseInterest?.status,
          destinationId,
          receiverId,
          senderId,
        }
      );

      // Ensure alphabetical order for user IDs (required by schema)
      const userA = senderId < receiverId ? senderId : receiverId;
      const userB = senderId < receiverId ? receiverId : senderId;

      // Check if match already exists (maybe created from the other direction)
      // Try with exact destination match first
      const { data: existingMatch, error: matchError } = await supabaseAdmin
        .from("matches")
        .select("id, destination_id, user_a_id, user_b_id")
        .eq("user_a_id", userA)
        .eq("user_b_id", userB)
        .eq("destination_id", destinationId)
        .eq("match_type", "solo")
        .maybeSingle();

      // Also check for matches with these users (any destination) for debugging
      const { data: allMatches } = await supabaseAdmin
        .from("matches")
        .select("id, destination_id, user_a_id, user_b_id")
        .eq("user_a_id", userA)
        .eq("user_b_id", userB)
        .eq("match_type", "solo");

      console.log("[interests/respond] Match queries:", {
        exactMatch: existingMatch,
        allMatches: allMatches,
        matchError,
        userA,
        userB,
        destinationId,
        destinationIdType: typeof destinationId,
      });

      let matchId = existingMatch?.id;
      const matchExists = !!matchId;

      // If reverse interest exists (pending or already accepted), create/update match
      if (reverseInterest) {
        // Mutual interest found! Create a match
        // Update both interests to accepted (only if not already accepted)
        if (reverseInterest.status === "pending") {
          await supabaseAdmin
            .from("match_interests")
            .update({ status: "accepted" })
            .eq("from_user_id", receiverId)
            .eq("to_user_id", senderId)
            .eq("destination_id", destinationId)
            .eq("match_type", "solo");
        }

        // Match ID already set above, just update if needed
        const isNewMatch = !matchId;

        // Create match if it doesn't exist
        if (!matchId) {
          const { data: matchData, error: matchError } = await supabaseAdmin
            .from("matches")
            .insert([
              {
                user_a_id: userA,
                user_b_id: userB,
                destination_id: destinationId,
                match_type: "solo",
                status: "active",
              },
            ])
            .select("id")
            .single();

          if (matchError) {
            console.error(
              "[interests/respond] Error creating match:",
              matchError
            );
          } else {
            matchId = matchData?.id;
            console.log("[interests/respond] Match created:", matchId);
          }
        } else {
          console.log("[interests/respond] Match already exists:", matchId);
        }

        // Get user names for notifications
        const { data: userAProfile } = await supabaseAdmin
          .from("profiles")
          .select("name")
          .eq("user_id", userA)
          .single();

        const { data: userBProfile } = await supabaseAdmin
          .from("profiles")
          .select("name")
          .eq("user_id", userB)
          .single();

        const userAName = userAProfile?.name || "Someone";
        const userBName = userBProfile?.name || "Someone";

        // Create MATCH_ACCEPTED notifications for both users
        // Check if notifications already exist to avoid duplicates
        if (matchId) {
          // Check if notifications already exist for this match
          const { data: existingNotifs } = await supabaseAdmin
            .from("notifications")
            .select("id, user_id")
            .eq("type", NotificationType.MATCH_ACCEPTED)
            .eq("entity_type", "match")
            .eq("entity_id", matchId)
            .in("user_id", [userA, userB]);

          const existingUserIds = new Set(
            existingNotifs?.map((n) => n.user_id) || []
          );
          const needsNotifA = !existingUserIds.has(userA);
          const needsNotifB = !existingUserIds.has(userB);

          console.log("[interests/respond] Notification check:", {
            matchId,
            existingUserIds: Array.from(existingUserIds),
            needsNotifA,
            needsNotifB,
            isNewMatch,
          });

          if (needsNotifA || needsNotifB) {
            console.log("[interests/respond] Creating match notifications:", {
              matchId,
              userA,
              userB,
              userAName,
              userBName,
            });

            if (needsNotifA) {
              const notifA = await createNotification({
                userId: userA,
                type: NotificationType.MATCH_ACCEPTED,
                title: "It's a match!",
                message: `You matched with ${userBName}. Start a conversation.`,
                entityType: "match",
                entityId: userB,
              });
              console.log("[interests/respond] Notification A result:", notifA);
            }

            if (needsNotifB) {
              const notifB = await createNotification({
                userId: userB,
                type: NotificationType.MATCH_ACCEPTED,
                title: "It's a match!",
                message: `You matched with ${userAName}. Start a conversation.`,
                entityType: "match",
                entityId: userA,
              });
              console.log("[interests/respond] Notification B result:", notifB);
            }
          } else {
            console.log(
              "[interests/respond] Notifications already exist for this match"
            );
          }
        } else {
          console.error(
            "[interests/respond] No matchId available for notifications"
          );
        }
      } else if (matchExists && matchId) {
        // Match exists but no reverse interest found - still create notifications if they don't exist
        console.log(
          "[interests/respond] Match exists without reverse interest, checking for notifications"
        );

        // Get user names for notifications
        const { data: userAProfile } = await supabaseAdmin
          .from("profiles")
          .select("name")
          .eq("user_id", userA)
          .single();

        const { data: userBProfile } = await supabaseAdmin
          .from("profiles")
          .select("name")
          .eq("user_id", userB)
          .single();

        const userAName = userAProfile?.name || "Someone";
        const userBName = userBProfile?.name || "Someone";

        // Check if notifications already exist
        const { data: existingNotifs } = await supabaseAdmin
          .from("notifications")
          .select("id, user_id")
          .eq("type", NotificationType.MATCH_ACCEPTED)
          .eq("entity_type", "match")
          .eq("entity_id", matchId)
          .in("user_id", [userA, userB]);

        const existingUserIds = new Set(
          existingNotifs?.map((n) => n.user_id) || []
        );
        const needsNotifA = !existingUserIds.has(userA);
        const needsNotifB = !existingUserIds.has(userB);

        if (needsNotifA || needsNotifB) {
          console.log(
            "[interests/respond] Creating notifications for existing match:",
            {
              matchId,
              needsNotifA,
              needsNotifB,
            }
          );

          if (needsNotifA) {
            const notifA = await createNotification({
              userId: userA,
              type: NotificationType.MATCH_ACCEPTED,
              title: "It's a match!",
              message: `You matched with ${userBName}. Start a conversation.`,
              entityType: "match",
              entityId: userB,
            });
            console.log("[interests/respond] Notification A result:", notifA);
          }

          if (needsNotifB) {
            const notifB = await createNotification({
              userId: userB,
              type: NotificationType.MATCH_ACCEPTED,
              title: "It's a match!",
              message: `You matched with ${userAName}. Start a conversation.`,
              entityType: "match",
              entityId: userA,
            });
            console.log("[interests/respond] Notification B result:", notifB);
          }
        } else {
          console.log(
            "[interests/respond] Notifications already exist for existing match"
          );
        }
      } else {
        // No match exists and no reverse interest - User B accepted User A's interest
        // Create MATCH_ACCEPTED notification for User A (the sender)
        console.log(
          "[interests/respond] No match exists, creating notification for sender (accepted interest)"
        );

        // Get user names for notification
        const { data: senderProfile } = await supabaseAdmin
          .from("profiles")
          .select("name")
          .eq("user_id", senderId)
          .single();

        const { data: receiverProfile } = await supabaseAdmin
          .from("profiles")
          .select("name")
          .eq("user_id", receiverId)
          .single();

        const senderName = senderProfile?.name || "Someone";
        const receiverName = receiverProfile?.name || "Someone";

        // Create MATCH_ACCEPTED notification for the sender (User A)
        // Use the interest ID as entity_id since there's no match yet
        const notifResult = await createNotification({
          userId: senderId, // The person who sent the interest
          type: NotificationType.MATCH_ACCEPTED,
          title: "It's a match!",
          message: `${receiverName} accepted your travel interest. Start a conversation.`,
          entityType: "match",
          entityId: receiverId, // Use partner ID (receiver) for chat redirection
        });

        console.log(
          "[interests/respond] MATCH_ACCEPTED notification for sender:",
          notifResult
        );

        if (!notifResult.success) {
          console.error(
            "[interests/respond] Failed to create notification:",
            notifResult.error
          );
        }
      }

      // Get Clerk IDs for feature extraction
      const { data: senderUser } = await supabaseAdmin
        .from("users")
        .select("clerk_user_id")
        .eq("id", senderId)
        .single();
      
      const { data: receiverUser } = await supabaseAdmin
        .from("users")
        .select("clerk_user_id")
        .eq("id", receiverId)
        .single();

      // Get matching preset for logging
      const presetSetting = await getSetting("matching_preset");
      const presetMode = (presetSetting as { mode: string } | null)?.mode || "balanced";

      // Extract features and log match accepted event
      if (senderUser?.clerk_user_id && receiverUser?.clerk_user_id) {
        const features = await extractFeaturesForSoloMatch(
          receiverUser.clerk_user_id, // Current user (acceptor)
          senderUser.clerk_user_id,    // Other user (sender)
          updatedInterest.destination_id
        );

        if (features) {
          logMatchEvent(
            createMatchEventLog(
              "user_user",
              features,
              "accept",
              presetMode.toLowerCase()
            )
          );
        }
      }

      try {
        // Initialize chat with a "phantom" message to make it appear in inbox without content
        // This relies on use-direct-inbox logic: matches (media_url && media_type) -> set lastMessage=""
        // and Inbox UI fallthrough to display empty string.

        const initPayload = buildMessageInsertPayload({
          mediaUrl: "system",
          mediaType: "init",
        });

        const { error: msgError } = await supabaseAdmin
          .from("direct_messages")
          .insert({
            ...initPayload,
            sender_id: receiverId, // Initiate from the acceptor
            receiver_id: senderId,
            created_at: new Date().toISOString(),
          });

        if (msgError) {
          console.error("Error creating init message:", msgError);
        } else {
          // Log chat initiated event
          if (senderUser?.clerk_user_id && receiverUser?.clerk_user_id) {
            const features = await extractFeaturesForSoloMatch(
              receiverUser.clerk_user_id, // Current user (acceptor)
              senderUser.clerk_user_id,    // Other user (sender)
              updatedInterest.destination_id
            );

            if (features) {
              logMatchEvent(
                createMatchEventLog(
                  "user_user",
                  features,
                  "chat",
                  presetMode.toLowerCase()
                )
              );
            }
          }
        }
      } catch (err) {
        console.error("Insertion error:", err);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

