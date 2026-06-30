import { MESSAGE_MIGRATION_VERSION } from "@kovari/types";

export interface MessageInsertInput {
  encryptedContent?: string | null;
  iv?: string | null;
  salt?: string | null;
  isEncrypted?: boolean;
  text?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  migrationVersion: typeof MESSAGE_MIGRATION_VERSION[keyof typeof MESSAGE_MIGRATION_VERSION];
}

export function buildMessageInsertPayload(
  input: MessageInsertInput,
  resolvedMode: 'legacy' | 'dual' | 'plaintext'
) {
  if (process.env.NODE_ENV !== "production") {
    if (input.mediaUrl && input.text && input.text === input.mediaUrl) {
      throw new Error(
        `[Assertion Failure] message_content matches mediaUrl (${input.mediaUrl}). Plaintext content should never be populated with raw media URLs.`
      );
    }
  }

  return {
    message_content: input.text ?? null,
    migration_version: input.migrationVersion,
    media_url: input.mediaUrl ?? null,
    media_type: input.mediaType ?? null,
  };
}
