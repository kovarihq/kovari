import { CURRENT_MESSAGE_WRITE_VERSION, MessageWriteMode } from './migration';

/**
 * Platform-agnostic input from the user/UI layer.
 */
export interface OutgoingMessageInput {
  text?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
}

/**
 * Canonical outgoing message contract.
 * Every sender (socket, REST, optimistic UI, retry queue) must build this first.
 * Persistence is a separate layer.
 */
export interface OutgoingMessageContract {
  messageContent: string | null;
  encryptedContent: string | null;
  iv: string | null;
  salt: string | null;
  isEncrypted: boolean;
  migrationVersion: number;
  mediaUrl: string | null;
  mediaType: string | null;
}

/**
 * Phase 8B: E2EE fully decommissioned. buildOutgoingMessage always returns
 * a plaintext contract. The mode parameter is retained for call-site
 * compatibility but is ignored — callers may be updated to drop it over time.
 */
export function buildOutgoingMessage(
  input: OutgoingMessageInput,
  _mode?: MessageWriteMode
): OutgoingMessageContract {
  return {
    messageContent: input.text ?? null,
    encryptedContent: null,
    iv: null,
    salt: null,
    isEncrypted: false,
    migrationVersion: CURRENT_MESSAGE_WRITE_VERSION,
    mediaUrl: input.mediaUrl ?? null,
    mediaType: input.mediaType ?? null,
  };
}
