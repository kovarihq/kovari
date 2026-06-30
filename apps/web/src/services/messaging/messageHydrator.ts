import { MESSAGE_MIGRATION_VERSION } from "@kovari/types";

export interface MessageHydrationInput {
  message_content?: string | null;
  migration_version?: number | null;
}

export interface HydratedMessage {
  content: string;
  source: "plaintext" | "none";
  status: "success" | "empty" | "invalid";
  migrationVersion: number;
}

export function hydrateMessageContent(
  message: MessageHydrationInput
): HydratedMessage {
  const version = message.migration_version ?? MESSAGE_MIGRATION_VERSION.DUAL_PERSISTENCE;
  const contentVal = message.message_content ?? null;

  if (contentVal !== null) {
    return {
      content: contentVal,
      source: "plaintext",
      status: "success",
      migrationVersion: version,
    };
  }

  return {
    content: "",
    source: "none",
    status: "empty",
    migrationVersion: version,
  };
}

export function hydratorSnapshot() {
  return {
    plaintextResolved: 1,
    legacyDecrypts: 0,
    failedDecrypts: 0,
    invalidMigrationStates: 0,
    emptyMessages: 0,
    totalResolutions: 1,
    totalDurationMs: 0,
  };
}
