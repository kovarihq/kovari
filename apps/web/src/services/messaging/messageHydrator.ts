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

export function hydrateMessageContent(
  message: MessageHydrationInput,
  decryptCallback: () => string | null
): HydratedMessage {
  const version = message.migration_version ?? MESSAGE_MIGRATION_VERSION.LEGACY_E2EE;
  const contentVal = message.message_content ?? null;

  // 1. Dual Persistence / Plaintext Path (Version >= 2)
  if (version >= MESSAGE_MIGRATION_VERSION.DUAL_PERSISTENCE) {
    if (contentVal !== null) {
      return {
        content: contentVal,
        source: "plaintext",
        status: "success",
        migrationVersion: version,
      };
    }
    // Invalid State: Version 2+ message but plaintext is missing
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
      if (decrypted) {
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
    return {
      content: "",
      source: "legacy",
      status: "failed",
      migrationVersion: version,
    };
  }

  // 3. Fallback unencrypted legacy row or system message
  return {
    content: contentVal ?? "",
    source: contentVal ? "plaintext" : "none",
    status: contentVal ? "success" : "empty",
    migrationVersion: version,
  };
}
