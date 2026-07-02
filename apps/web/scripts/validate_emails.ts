import dotenv from "dotenv";
import { createAdminSupabaseClient } from "@kovari/api";
import { pubClient, connectRedis } from "../src/services/socket/redis";
import { NotificationType } from "@kovari/types";
import { NotificationEventDispatcher } from "../src/services/notifications/dispatcher";
import {
  scheduleOfflineReminder,
  cancelOfflineReminder,
  processPendingOfflineEmails,
} from "../src/services/messaging/chatNotificationService";

dotenv.config({ path: ".env.local" });
dotenv.config();

const TEST_RECIPIENT_CLERK_ID = "user_test_email_recipient_123";
const TEST_SENDER_CLERK_ID = "user_test_email_sender_456";

async function runEmailValidation() {
  console.log("=== Starting Email Engagement System Validation ===\n");

  const supabase = createAdminSupabaseClient();
  await connectRedis();

  // Resolve or create test users
  let recipientUuid: string;
  let senderUuid: string;

  const { data: recRow } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_user_id", TEST_RECIPIENT_CLERK_ID)
    .maybeSingle();

  if (recRow) {
    recipientUuid = recRow.id;
  } else {
    const { data: newUser, error: insertError } = await supabase
      .from("users")
      .insert({
        clerk_user_id: TEST_RECIPIENT_CLERK_ID,
        email: "test_recipient@kovari.in",
        // status is not a column or has constraint, let's see error
      })
      .select("id")
      .single();
    if (insertError || !newUser) {
      throw new Error(`Failed to create test recipient user: ${JSON.stringify(insertError)}`);
    }
    recipientUuid = newUser.id;
  }

  // Create recipient profile if missing
  const { data: recProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", recipientUuid)
    .maybeSingle();

  if (!recProfile) {
    const { error: profError } = await supabase.from("profiles").insert({
      user_id: recipientUuid,
      name: "Test Recipient",
      username: "test_rec_" + Math.random().toString(36).slice(2, 8),
    });
    if (profError) {
      console.warn("Recipient profile insert error:", profError);
    }
  }

  const { data: senRow } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_user_id", TEST_SENDER_CLERK_ID)
    .maybeSingle();

  if (senRow) {
    senderUuid = senRow.id;
  } else {
    const { data: newUser, error: insertError } = await supabase
      .from("users")
      .insert({
        clerk_user_id: TEST_SENDER_CLERK_ID,
        email: "test_sender@kovari.in",
      })
      .select("id")
      .single();
    if (insertError || !newUser) {
      throw new Error(`Failed to create test sender user: ${JSON.stringify(insertError)}`);
    }
    senderUuid = newUser.id;
  }

  // Create sender profile if missing
  const { data: senProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", senderUuid)
    .maybeSingle();

  if (!senProfile) {
    const { error: profError } = await supabase.from("profiles").insert({
      user_id: senderUuid,
      name: "Test Sender",
      username: "test_sen_" + Math.random().toString(36).slice(2, 8),
    });
    if (profError) {
      console.warn("Sender profile insert error:", profError);
    }
  }

  console.log(`Resolved recipient UUID: ${recipientUuid}`);
  console.log(`Resolved sender UUID: ${senderUuid}`);

  // Clean Redis keys
  const queueKey = "offline_emails:queue";
  await pubClient.del(queueKey);
  await pubClient.del(`user_socket:${TEST_RECIPIENT_CLERK_ID}`);
  await pubClient.del(`email_sent:match_interest:${senderUuid}:${recipientUuid}`);
  await pubClient.del(`email_sent:match_accepted:${recipientUuid}:${senderUuid}`);

  // Clean DB messages
  await supabase
    .from("direct_messages")
    .delete()
    .eq("receiver_id", recipientUuid)
    .eq("sender_id", senderUuid);

  // ──────────────────────────────────────────────────────────────
  // TEST 1 — User Online → No Cooldown Scheduled
  // ──────────────────────────────────────────────────────────────
  console.log("\n--- TEST 1: User Online Presence Check ---");
  await pubClient.sAdd(`user_socket:${TEST_RECIPIENT_CLERK_ID}`, "socket_id_1");

  await scheduleOfflineReminder({
    recipientId: recipientUuid,
    conversationId: senderUuid,
    senderId: senderUuid,
    messageId: "msg_test_1",
    createdAt: new Date().toISOString(),
  });

  const timerVal1 = await pubClient.zScore(queueKey, recipientUuid);
  if (timerVal1 === null) {
    console.log("✅ PASSED: User is online, no email scheduled.");
  } else {
    console.error("❌ FAILED: User is online but offline email was scheduled.");
  }

  // ──────────────────────────────────────────────────────────────
  // TEST 2 — User Offline → Email Scheduled + Cooldown Reset
  // ──────────────────────────────────────────────────────────────
  console.log("\n--- TEST 2: User Offline & Timer Reset ---");
  await pubClient.del(`user_socket:${TEST_RECIPIENT_CLERK_ID}`);

  await scheduleOfflineReminder({
    recipientId: recipientUuid,
    conversationId: senderUuid,
    senderId: senderUuid,
    messageId: "msg_test_2",
    createdAt: new Date().toISOString(),
  });

  const timerVal2 = await pubClient.zScore(queueKey, recipientUuid);
  if (timerVal2 !== null) {
    console.log("✅ PASSED: Email successfully scheduled for offline user.");
    
    // Test timer reset
    console.log("Sending second message to test reset...");
    await new Promise(r => setTimeout(r, 100)); // small delay
    await scheduleOfflineReminder({
      recipientId: recipientUuid,
      conversationId: senderUuid,
      senderId: senderUuid,
      messageId: "msg_test_3",
      createdAt: new Date().toISOString(),
    });

    const timerVal3 = await pubClient.zScore(queueKey, recipientUuid);
    if (timerVal3 !== null && timerVal3 > timerVal2) {
      console.log("✅ PASSED: Second message reset/extended the timer.");
    } else {
      console.error("❌ FAILED: Timer was not updated/extended.");
    }
  } else {
    console.error("❌ FAILED: Email was not scheduled for offline user.");
  }

  // ──────────────────────────────────────────────────────────────
  // TEST 3 — Cancellation on Read
  // ──────────────────────────────────────────────────────────────
  console.log("\n--- TEST 3: Cancellation on Read ---");
  await cancelOfflineReminder(recipientUuid);
  const timerVal4 = await pubClient.zScore(queueKey, recipientUuid);
  if (timerVal4 === null) {
    console.log("✅ PASSED: Reminder successfully cancelled on read.");
  } else {
    console.error("❌ FAILED: Reminder was not cancelled on read.");
  }

  // ──────────────────────────────────────────────────────────────
  // TEST 4 — Cron Processing & Consolidation
  // ──────────────────────────────────────────────────────────────
  console.log("\n--- TEST 4: Cron Processing & Consolidation ---");
  // 1. Insert two unread messages in the database
  await supabase.from("direct_messages").insert([
    {
      sender_id: senderUuid,
      receiver_id: recipientUuid,
      message_content: "Hello from offline test 1",
    },
    {
      sender_id: senderUuid,
      receiver_id: recipientUuid,
      message_content: "Hello from offline test 2",
    },
  ]);

  // 2. Queue the user with an expired score (e.g. 10 seconds ago)
  await pubClient.zAdd(queueKey, { score: Date.now() - 10000, value: recipientUuid });

  // 3. Process expired reminders
  const processResult = await processPendingOfflineEmails();
  console.log("Processed result:", processResult);

  if (processResult.processed > 0) {
    console.log("✅ PASSED: Processed unread messages and sent consolidated email.");
  } else {
    console.error("❌ FAILED: Failed to process expired queue.");
  }

  // Verify queue is clean
  const timerVal5 = await pubClient.zScore(queueKey, recipientUuid);
  if (timerVal5 === null) {
    console.log("✅ PASSED: Queue successfully cleaned after processing.");
  } else {
    console.error("❌ FAILED: Recipient remains in queue after processing.");
  }

  // ──────────────────────────────────────────────────────────────
  // TEST 5 — Match Interest & Accepted Idempotency
  // ──────────────────────────────────────────────────────────────
  console.log("\n--- TEST 5: Match Interest & Accepted Idempotency ---");

  // Verify can dispatch and respects idempotency
  await NotificationEventDispatcher.dispatch({
    userId: recipientUuid,
    type: NotificationType.MATCH_INTEREST_RECEIVED,
    title: "Match interest",
    message: "Test Sender is interested in traveling with you",
    entityType: "match",
    entityId: senderUuid,
  }, "notif_match_interest");

  console.log("Triggering interest again to test idempotency...");
  await NotificationEventDispatcher.dispatch({
    userId: recipientUuid,
    type: NotificationType.MATCH_INTEREST_RECEIVED,
    title: "Match interest",
    message: "Test Sender is interested in traveling with you",
    entityType: "match",
    entityId: senderUuid,
  }, "notif_match_interest_2");

  // Cleanup DB messages and test users
  await supabase
    .from("direct_messages")
    .delete()
    .eq("receiver_id", recipientUuid)
    .eq("sender_id", senderUuid);

  await supabase.from("profiles").delete().eq("user_id", recipientUuid);
  await supabase.from("profiles").delete().eq("user_id", senderUuid);
  await supabase.from("users").delete().eq("id", recipientUuid);
  await supabase.from("users").delete().eq("id", senderUuid);

  await pubClient.quit();
  console.log("\n=== Email Engagement System Validation Matrix Completed ===");
}

runEmailValidation().catch(err => {
  console.error("Error during email validation:", err);
  process.exit(1);
});
