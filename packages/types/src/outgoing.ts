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
 * Base properties only.
 */
export interface OutgoingMessageContract {
  messageContent: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
}

/**
 * Phase 8B: E2EE and migration layers fully decommissioned.
 * buildOutgoingMessage returns a clean plaintext contract.
 */
export function buildOutgoingMessage(
  input: OutgoingMessageInput
): OutgoingMessageContract {
  return {
    messageContent: input.text ?? null,
    mediaUrl: input.mediaUrl ?? null,
    mediaType: input.mediaType ?? null,
  };
}
