import dotenv from "dotenv";
import { createAdminSupabaseClient } from "@kovari/api";
import { PushService } from "../src/services/notifications/pushService";
import { shouldSendPush } from "../src/services/notifications/shouldSendPush";
import { pubClient, connectRedis } from "../src/services/socket/redis";
import { NotificationType } from "@kovari/types";

dotenv.config({ path: ".env.local" });
dotenv.config();

const TEST_USER_CLERK_ID = "user_test_clerk_id_123456";
const TEST_DEVICE_ID = "device_test_id_999";
const FAKE_INVALID_TOKEN = "fcm_token_invalid_stale_expired_xyz";
const TEST_CHAT_ID = "chat_room_target_xyz";
const OTHER_CHAT_ID = "chat_room_other_abc";

async function runValidation() {
  console.log("=== Starting Notification Validation Matrix ===\n");

  const supabase = createAdminSupabaseClient();
  await connectRedis();

  // Resolve or create test user
  let testUserUuid: string;
  const { data: userRow } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_user_id", TEST_USER_CLERK_ID)
    .maybeSingle();

  if (userRow) {
    testUserUuid = userRow.id;
  } else {
    const { data: newUser } = await supabase
      .from("users")
      .insert({
        clerk_user_id: TEST_USER_CLERK_ID,
        email: "test_push_user@kovari.in",
        status: "active",
      })
      .select("id")
      .single();
    if (!newUser) throw new Error("Failed to create test user");
    testUserUuid = newUser.id;
  }
  console.log(`Resolved test user UUID: ${testUserUuid}`);

  // Cleanup previous test state
  await supabase
    .from("fcm_device_tokens")
    .delete()
    .eq("user_id", testUserUuid)
    .eq("device_id", TEST_DEVICE_ID);

  const socketKey = `user_socket:${TEST_USER_CLERK_ID}`;
  const chatsKey = `user_chats:${TEST_USER_CLERK_ID}`;
  await pubClient.del(socketKey);
  await pubClient.del(chatsKey);

  // ──────────────────────────────────────────────────────────────
  // TEST B — Invalid Token Auto-Cleanup
  // ──────────────────────────────────────────────────────────────
  console.log("[Test B] Registering invalid token...");
  const { error: insErr } = await supabase
    .from("fcm_device_tokens")
    .insert({
      user_id: testUserUuid,
      device_id: TEST_DEVICE_ID,
      fcm_token: FAKE_INVALID_TOKEN,
      platform: "android",
      device_name: "Mock Validator Phone",
      app_version: "1.0.0",
    });

  if (insErr) throw insErr;

  await PushService.sendPush({
    supabaseId: testUserUuid,
    clerkId: TEST_USER_CLERK_ID,
    type: NotificationType.NEW_MESSAGE,
    title: "Validation Test",
    body: "Open Kovari to view message",
    entityType: "chat",
    entityId: TEST_CHAT_ID,
  });

  const { data: checkToken } = await supabase
    .from("fcm_device_tokens")
    .select("id")
    .eq("user_id", testUserUuid)
    .eq("device_id", TEST_DEVICE_ID)
    .maybeSingle();

  if (checkToken) {
    console.error("❌ Test B FAILED: Stale token was not deleted.");
  } else {
    console.log("✅ Test B PASSED: Stale token auto-deleted.\n");
  }

  // ──────────────────────────────────────────────────────────────
  // TEST C — User Offline → Eligible
  // ──────────────────────────────────────────────────────────────
  console.log("[Test C] User fully offline...");
  await pubClient.del(socketKey);

  const isEligibleOffline = await shouldSendPush({
    userId: TEST_USER_CLERK_ID,
    type: NotificationType.NEW_MESSAGE,
    entityType: "chat",
    entityId: TEST_CHAT_ID,
  });

  if (isEligibleOffline === true) {
    console.log("✅ Test C PASSED: Push eligible when fully offline.\n");
  } else {
    console.error("❌ Test C FAILED: shouldSendPush returned false for offline user.\n");
  }

  // ──────────────────────────────────────────────────────────────
  // TEST D — User Online, Viewing Target Chat → Suppress
  // ──────────────────────────────────────────────────────────────
  console.log("[Test D] User online AND in target chat...");
  await pubClient.sAdd(socketKey, "mock_socket_id_1");
  await pubClient.sAdd(chatsKey, TEST_CHAT_ID); // Same room as entityId

  const isEligibleInChat = await shouldSendPush({
    userId: TEST_USER_CLERK_ID,
    type: NotificationType.NEW_MESSAGE,
    entityType: "chat",
    entityId: TEST_CHAT_ID,
  });

  if (isEligibleInChat === false) {
    console.log("✅ Test D PASSED: Push suppressed when user is viewing target chat.\n");
  } else {
    console.error("❌ Test D FAILED: shouldSendPush returned true — user is in chat, push should be suppressed.\n");
  }

  // ──────────────────────────────────────────────────────────────
  // TEST E — User Online, Viewing DIFFERENT Room → Deliver
  // ──────────────────────────────────────────────────────────────
  console.log("[Test E] User online but in a DIFFERENT room...");
  // User is in OTHER_CHAT_ID, not the target TEST_CHAT_ID
  await pubClient.del(chatsKey);
  await pubClient.sAdd(chatsKey, OTHER_CHAT_ID);

  const isEligibleOtherRoom = await shouldSendPush({
    userId: TEST_USER_CLERK_ID,
    type: NotificationType.NEW_MESSAGE,
    entityType: "chat",
    entityId: TEST_CHAT_ID, // sending to a chat they're NOT viewing
  });

  if (isEligibleOtherRoom === true) {
    console.log("✅ Test E PASSED: Push delivered when user is online but NOT in target chat.\n");
  } else {
    console.error("❌ Test E FAILED: shouldSendPush returned false — user is online but browsing elsewhere, should receive push.\n");
  }

  // ──────────────────────────────────────────────────────────────
  // TEST F — User Online, No Active Room → Deliver
  // ──────────────────────────────────────────────────────────────
  console.log("[Test F] User online but not in any chat room...");
  await pubClient.del(chatsKey); // clear all active rooms (user is on Explore/Home)

  const isEligibleNoRoom = await shouldSendPush({
    userId: TEST_USER_CLERK_ID,
    type: NotificationType.NEW_MESSAGE,
    entityType: "chat",
    entityId: TEST_CHAT_ID,
  });

  if (isEligibleNoRoom === true) {
    console.log("✅ Test F PASSED: Push delivered when user is online with no active chat room.\n");
  } else {
    console.error("❌ Test F FAILED: shouldSendPush returned false for user on non-chat screen.\n");
  }

  // Cleanup
  await pubClient.del(socketKey);
  await pubClient.del(chatsKey);
  await supabase.from("users").delete().eq("id", testUserUuid);
  await pubClient.quit();

  console.log("=== Validation Matrix Completed ===");
}

runValidation().catch(err => {
  console.error("Error running validation matrix:", err);
  process.exit(1);
});
