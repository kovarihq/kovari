import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import CryptoJS from "crypto-js";

// Polyfill or import decryption from utils/encryption to avoid React hook dependencies
const autoDecode = (str: string): CryptoJS.lib.WordArray => {
  if (!str) return CryptoJS.lib.WordArray.create();
  const isHex = /^[0-9a-fA-F]+$/.test(str) && str.length % 2 === 0;
  if (isHex) return CryptoJS.enc.Hex.parse(str);
  try {
    return CryptoJS.enc.Base64.parse(str);
  } catch (e) {
    return CryptoJS.lib.WordArray.create();
  }
};

const deriveKeyFromPassword = (password: string, salt: string): CryptoJS.lib.WordArray => {
  const saltWords = autoDecode(salt);
  return CryptoJS.PBKDF2(password, saltWords, {
    keySize: 256 / 32,
    iterations: 10000,
    hasher: CryptoJS.algo.SHA256,
  });
};

const localDecrypt = (encryptedContent: string, iv: string, salt: string, key: string): string => {
  if (!key) return "";
  try {
    const derivedKey = deriveKeyFromPassword(key, salt);
    const ciphertext = autoDecode(encryptedContent);
    const ivWords = autoDecode(iv);

    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext } as CryptoJS.lib.CipherParams,
      derivedKey,
      {
        iv: ivWords,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      }
    );
    const result = decrypted.toString(CryptoJS.enc.Utf8);
    if (result) return result;
  } catch (e) {
    // ignore
  }

  // Legacy fallback
  try {
    const legacyDerivedKey = CryptoJS.PBKDF2(key, salt, {
      keySize: 256 / 32,
      iterations: 10000,
    }).toString();

    const legacyDecrypted = CryptoJS.AES.decrypt(
      encryptedContent,
      legacyDerivedKey,
      {
        iv: CryptoJS.enc.Hex.parse(iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      }
    );
    return legacyDecrypted.toString(CryptoJS.enc.Utf8) || "";
  } catch (e) {
    return "";
  }
};

// Setup Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

// Paths for logging and progress tracking
const PROGRESS_FILE = path.join(__dirname, "migration_progress.json");
const REPORT_FILE = path.join(__dirname, "migration_report.json");
const FAILS_FILE = path.join(__dirname, "failed_decryptions.json");

// Mode flags — read from environment variables because CLI args don't survive
// the dotenv-cli → tsx invocation chain on Windows PowerShell.
// Usage: $env:BACKFILL_DRY_RUN="true"; npx dotenv-cli -e .env.local -- tsx scripts/backfill-messages.ts
const isDryRun = process.env.BACKFILL_DRY_RUN === "true";
const isVerifyMode = process.env.BACKFILL_VERIFY === "true";
const isReset = process.env.BACKFILL_RESET === "true";
const batchSize = parseInt(process.env.BACKFILL_BATCH_SIZE || "500", 10);
let manualCursor: number | null = process.env.BACKFILL_CURSOR ? parseInt(process.env.BACKFILL_CURSOR, 10) : null;

console.log(`[Backfill] Mode: isDryRun=${isDryRun} | isVerifyMode=${isVerifyMode} | isReset=${isReset} | batchSize=${batchSize} | cursor=${manualCursor ?? "auto"}`);

// BACKFILL_RESET=true: clear stale progress cursor so migration restarts from global_sequence = 0
if (isReset && fs.existsSync(PROGRESS_FILE)) {
  fs.unlinkSync(PROGRESS_FILE);
  console.log("🔄 Progress cursor reset. Migration will restart from the beginning.");
}

interface MigrationProgress {
  last_processed_global_sequence: number;
}

interface FailedDecryption {
  id: string;
  conversationId: string | null;
  error: string;
  timestamp: string;
}

// Load previous progress (skip for verify mode)
let progress: MigrationProgress = { last_processed_global_sequence: 0 };
if (fs.existsSync(PROGRESS_FILE) && !isVerifyMode) {
  try {
    progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8"));
  } catch (e) {
    console.warn("⚠️ Failed to parse migration_progress.json. Starting from 0.");
  }
}

if (manualCursor !== null) {
  progress.last_processed_global_sequence = manualCursor;
}

// Simple text validation (UTF-8, printable, non-empty)
function isValidPlaintext(text: string): boolean {
  if (!text || text.trim().length === 0) return false;
  // Check for invalid UTF-8 surrogate pairs or non-printable garbage
  const hasControlChars = /[\x00-\x08\x0E-\x1F]/.test(text);
  return !hasControlChars;
}

async function runPreFlightCheck(): Promise<boolean> {
  console.log("🔍 Running pre-flight decryption check on a random sample of 100 v1 messages...");
  
  const { data: sample, error } = await supabase
    .from("direct_messages")
    .select(`
      id,
      sender_id,
      receiver_id,
      encrypted_content,
      encryption_iv,
      encryption_salt,
      sender:users!direct_messages_sender_id_fkey(clerk_user_id),
      receiver:users!direct_messages_receiver_id_fkey(clerk_user_id)
    `)
    .eq("migration_version", 1)
    .not("encrypted_content", "is", null)
    .limit(100);

  if (error) {
    console.error("❌ Pre-flight query failed:", error.message);
    return false;
  }

  if (!sample || sample.length === 0) {
    console.log("✅ No v1 messages found. Nothing to migrate.");
    return true;
  }

  let successCount = 0;
  for (const msg of sample) {
    const sId = msg.sender_id;
    const rId = msg.receiver_id;
    const sClerk = (msg as any).sender?.clerk_user_id;
    const rClerk = (msg as any).receiver?.clerk_user_id;

    const uuidSecret = (sId && rId) ? (sId < rId ? `${sId}:${rId}` : `${rId}:${sId}`) : "";
    const clerkSecret = (sClerk && rClerk) ? (sClerk < rClerk ? `${sClerk}:${rClerk}` : `${rClerk}:${sClerk}`) : "";

    const decrypted = 
      localDecrypt(msg.encrypted_content, msg.encryption_iv, msg.encryption_salt, uuidSecret) ||
      localDecrypt(msg.encrypted_content, msg.encryption_iv, msg.encryption_salt, clerkSecret);

    if (decrypted && isValidPlaintext(decrypted)) {
      successCount++;
    }
  }

  const successRate = (successCount / sample.length) * 100;
  console.log(`📊 Pre-flight Decryption Success Rate: ${successRate.toFixed(1)}% (${successCount}/${sample.length})`);

  if (successRate < 90) {
    console.error("❌ Pre-flight decryption check failed (success rate below 90%). Aborting backfill.");
    return false;
  }

  console.log("✅ Pre-flight check passed. Proceeding...");
  return true;
}

async function runMigration() {
  const startTime = Date.now();
  let totalProcessed = 0;
  let totalMigrated = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  const failedList: FailedDecryption[] = [];

  console.log(`🚀 Starting Phase 7 Backfill (batchSize: ${batchSize}, starting cursor: ${progress.last_processed_global_sequence})`);
  if (isDryRun) console.log("🧪 DRY-RUN MODE ACTIVE. No database writes will occur.");

  let hasMore = true;
  let currentCursor = progress.last_processed_global_sequence;

  while (hasMore) {
    // Fetch batch ordered by global_sequence
    const { data: batch, error } = await supabase
      .from("direct_messages")
      .select(`
        id,
        global_sequence,
        sender_id,
        receiver_id,
        encrypted_content,
        encryption_iv,
        encryption_salt,
        conversation_id,
        sender:users!direct_messages_sender_id_fkey(clerk_user_id),
        receiver:users!direct_messages_receiver_id_fkey(clerk_user_id)
      `)
      .eq("migration_version", 1)
      .is("message_content", null)
      .not("encrypted_content", "is", null)
      .gt("global_sequence", currentCursor)
      .order("global_sequence", { ascending: true })
      .limit(batchSize);

    if (error) {
      console.error("❌ Error fetching batch:", error.message);
      break;
    }

    if (!batch || batch.length === 0) {
      hasMore = false;
      break;
    }

    const updates: Array<{ id: string; message_content: string; migration_version: number }> = [];

    for (const msg of batch) {
      totalProcessed++;
      const sId = msg.sender_id;
      const rId = msg.receiver_id;
      const sClerk = (msg as any).sender?.clerk_user_id;
      const rClerk = (msg as any).receiver?.clerk_user_id;

      const uuidSecret = (sId && rId) ? (sId < rId ? `${sId}:${rId}` : `${rId}:${sId}`) : "";
      const clerkSecret = (sClerk && rClerk) ? (sClerk < rClerk ? `${sClerk}:${rClerk}` : `${rClerk}:${sClerk}`) : "";

      const decrypted = 
        localDecrypt(msg.encrypted_content, msg.encryption_iv, msg.encryption_salt, uuidSecret) ||
        localDecrypt(msg.encrypted_content, msg.encryption_iv, msg.encryption_salt, clerkSecret);

      if (decrypted && isValidPlaintext(decrypted)) {
        updates.push({
          id: msg.id,
          message_content: decrypted,
          migration_version: 2,
        });
        totalMigrated++;
      } else {
        totalFailed++;
        failedList.push({
          id: msg.id,
          conversationId: msg.conversation_id,
          error: decrypted ? "Invalid plaintext validation" : "Decryption returned empty/failed",
          timestamp: new Date().toISOString(),
        });
      }
      currentCursor = msg.global_sequence;
    }

    // Apply updates inside a transaction (emulated or direct batch update if dry-run is false)
    if (updates.length > 0 && !isDryRun) {
      // Use Promise.all with .update() to avoid upsert constraint violations on missing columns
      const updatePromises = updates.map(u => 
        supabase
          .from("direct_messages")
          .update({
            message_content: u.message_content,
            migration_version: u.migration_version,
          })
          .eq("id", u.id)
      );

      const results = await Promise.all(updatePromises);
      const errors = results.filter(r => r.error);

      if (errors.length > 0) {
        console.error(`❌ Transaction batch update failed for ${errors.length} rows. First error:`, errors[0].error?.message);
        totalMigrated -= updates.length;
        totalFailed += updates.length;
      }
    }

    // Persist progress cursor
    if (!isDryRun) {
      fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ last_processed_global_sequence: currentCursor }, null, 2));
    }

    const elapsedSec = (Date.now() - startTime) / 1000;
    const speed = (totalProcessed / elapsedSec).toFixed(1);
    console.log(`Progress: Processed ${totalProcessed} | Migrated ${totalMigrated} | Failed ${totalFailed} | Speed: ${speed} msgs/sec`);
  }

  // Write final report
  const report = {
    totalProcessed,
    totalMigrated,
    totalFailed,
    totalSkipped,
    elapsedSeconds: (Date.now() - startTime) / 1000,
    averageSpeedMsgsSec: totalProcessed / ((Date.now() - startTime) / 1000),
    finalCursor: currentCursor,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  if (failedList.length > 0) {
    fs.writeFileSync(FAILS_FILE, JSON.stringify(failedList, null, 2));
  }

  console.log(`\n🎉 Phase 7 Migration Complete! Report saved to ${REPORT_FILE}`);
}

async function runVerification() {
  console.log("🔍 Running --verify mode on migrated version 2 rows...");
  const startTime = Date.now();
  let verifiedCount = 0;
  let mismatchCount = 0;
  const mismatchList: any[] = [];

  const { data: migrated, error } = await supabase
    .from("direct_messages")
    .select(`
      id,
      sender_id,
      receiver_id,
      encrypted_content,
      encryption_iv,
      encryption_salt,
      message_content,
      sender:users!direct_messages_sender_id_fkey(clerk_user_id),
      receiver:users!direct_messages_receiver_id_fkey(clerk_user_id)
    `)
    .eq("migration_version", 2)
    .not("message_content", "is", null)
    .not("encrypted_content", "is", null);

  if (error) {
    console.error("❌ Error fetching migrated rows for verification:", error.message);
    return;
  }

  if (!migrated || migrated.length === 0) {
    console.log("✅ No migrated version 2 rows with E2EE fields found to verify.");
    return;
  }

  for (const msg of migrated) {
    const sId = msg.sender_id;
    const rId = msg.receiver_id;
    const sClerk = (msg as any).sender?.clerk_user_id;
    const rClerk = (msg as any).receiver?.clerk_user_id;

    const uuidSecret = (sId && rId) ? (sId < rId ? `${sId}:${rId}` : `${rId}:${sId}`) : "";
    const clerkSecret = (sClerk && rClerk) ? (sClerk < rClerk ? `${sClerk}:${rClerk}` : `${rClerk}:${sClerk}`) : "";

    const decrypted = 
      localDecrypt(msg.encrypted_content, msg.encryption_iv, msg.encryption_salt, uuidSecret) ||
      localDecrypt(msg.encrypted_content, msg.encryption_iv, msg.encryption_salt, clerkSecret);

    if (decrypted === msg.message_content) {
      verifiedCount++;
    } else {
      mismatchCount++;
      mismatchList.push({
        id: msg.id,
        storedPlaintext: msg.message_content,
        decryptedResult: decrypted,
      });
    }
  }

  console.log(`\n📊 Verification Complete!`);
  console.log(`✅ Successfully Verified Matches: ${verifiedCount}`);
  console.log(`❌ Mismatches Found: ${mismatchCount}`);

  if (mismatchCount > 0) {
    console.error("🚨 CRITICAL: Plaintext mismatch detected in migrated rows!");
    console.error(JSON.stringify(mismatchList.slice(0, 5), null, 2));
  }
}

async function main() {
  if (isVerifyMode) {
    await runVerification();
  } else {
    const passed = await runPreFlightCheck();
    if (passed) {
      await runMigration();
    }
  }
}

main().catch(console.error);
