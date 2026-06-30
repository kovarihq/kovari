import { MESSAGE_MIGRATION_VERSION } from "@kovari/types";

export interface MessageHydrationInput {
  message_content?: string | null;
  migration_version?: number | null;
  encrypted_content?: string | null;
  encryption_iv?: string | null;
  encryption_salt?: string | null;
  is_encrypted?: boolean | null;
}

export interface HydratedMessage {
  content: string;
  source: "plaintext" | "legacy" | "none";
  status: "success" | "failed" | "empty" | "invalid";
  migrationVersion: number;
}

// Telemetry Dashboard (non-production only)
interface TelemetryStats {
  plaintextResolved: number;
  legacyDecrypts: number;
  failedDecrypts: number;
  invalidMigrationStates: number;
  emptyMessages: number;
  totalResolutions: number;
  totalDurationMs: number;
}

const stats: TelemetryStats = {
  plaintextResolved: 0,
  legacyDecrypts: 0,
  failedDecrypts: 0,
  invalidMigrationStates: 0,
  emptyMessages: 0,
  totalResolutions: 0,
  totalDurationMs: 0,
};

function dumpTelemetry() {
  if (stats.totalResolutions % 50 === 0) {
    console.log(`🛡️ [Hydrator Dashboard]
  Resolutions: ${stats.totalResolutions} | Plaintext Hit Rate: ${((stats.plaintextResolved / stats.totalResolutions) * 100).toFixed(1)}%
  Plaintext resolved: ${stats.plaintextResolved}
  Legacy decrypts: ${stats.legacyDecrypts}
  Failed decrypts: ${stats.failedDecrypts}
  Invalid migration states: ${stats.invalidMigrationStates}
  Empty messages: ${stats.emptyMessages}
  Avg latency: ${(stats.totalDurationMs / Math.max(1, stats.legacyDecrypts + stats.failedDecrypts)).toFixed(2)}ms per decrypt`);
  }
}

export function hydrateMessageContent(
  message: MessageHydrationInput,
  decryptCallback: () => string | null
): HydratedMessage {
  const startTime = typeof window !== "undefined" ? performance.now() : 0;
  const version = message.migration_version ?? MESSAGE_MIGRATION_VERSION.LEGACY_E2EE;
  const contentVal = message.message_content ?? null;

  stats.totalResolutions++;

  // 1. Dual Persistence / Plaintext Path (Version >= 2)
  if (version >= MESSAGE_MIGRATION_VERSION.DUAL_PERSISTENCE) {
    if (contentVal !== null) {
      stats.plaintextResolved++;
      dumpTelemetry();
      return {
        content: contentVal,
        source: "plaintext",
        status: "success",
        migrationVersion: version,
      };
    }
    // Invalid State: Version 2+ message but plaintext is missing
    stats.invalidMigrationStates++;
    dumpTelemetry();
    return {
      content: "",
      source: "plaintext",
      status: "invalid",
      migrationVersion: version,
    };
  }

  // 2. Legacy Decryption Path (Version 1)
  if (message.is_encrypted && message.encrypted_content && message.encryption_iv && message.encryption_salt) {
    try {
      const decrypted = decryptCallback();
      if (startTime) {
        stats.totalDurationMs += (performance.now() - startTime);
      }
      if (decrypted) {
        stats.legacyDecrypts++;
        dumpTelemetry();
        return {
          content: decrypted,
          source: "legacy",
          status: "success",
          migrationVersion: version,
        };
      }
    } catch {
      // Return failed status; let caller/telemetry log it
    }
    stats.failedDecrypts++;
    dumpTelemetry();
    return {
      content: "",
      source: "legacy",
      status: "failed",
      migrationVersion: version,
    };
  }

  // 3. Fallback unencrypted legacy row or system message
  stats.emptyMessages++;
  dumpTelemetry();
  return {
    content: contentVal ?? "",
    source: contentVal ? "plaintext" : "none",
    status: contentVal ? "success" : "empty",
    migrationVersion: version,
  };
}
/**
 * Returns a point-in-time snapshot of hydrator read-mode distribution.
 * Use alongside writeModeTelemetry.snapshot() to monitor migration progress.
 *
 * When legacyDecrypts approaches 0 and plaintextResolved dominates,
 * the system is ready for Phase 8 crypto removal.
 */
export function hydratorSnapshot() {
  return { ...stats };
}
