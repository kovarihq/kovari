import { CURRENT_MESSAGE_WRITE_VERSION, MESSAGE_MIGRATION_VERSION, MessageWriteMode } from './migration';
import { encryptMessage, EncryptedMessage } from '@kovari/utils';

/**
 * Platform-agnostic input from the user/UI layer.
 * sharedSecret is only consumed in 'legacy' and 'dual' write modes.
 */
export interface OutgoingMessageInput {
  text?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  /** ECDH / password-derived shared secret — used only in legacy/dual mode. */
  sharedSecret?: string;
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
 * Build the canonical outgoing message contract for the given write mode.
 * The mode is a client compile-time constant — the backend never sets this.
 *
 * Crypto imports remain actively used in the 'legacy' and 'dual' branches
 * so they do not become dead code before Phase 8 removes them.
 */
export function buildOutgoingMessage(
  input: OutgoingMessageInput,
  mode: MessageWriteMode
): OutgoingMessageContract {
  switch (mode) {
    case 'plaintext':
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

    case 'dual': {
      let enc: EncryptedMessage = { encryptedContent: '', iv: '', salt: '' };
      if (input.text && input.sharedSecret) {
        enc = encryptMessage(input.text, input.sharedSecret);
      }
      return {
        messageContent: input.text ?? null,
        encryptedContent: enc.encryptedContent || null,
        iv: enc.iv || null,
        salt: enc.salt || null,
        isEncrypted: true,
        migrationVersion: CURRENT_MESSAGE_WRITE_VERSION,
        mediaUrl: input.mediaUrl ?? null,
        mediaType: input.mediaType ?? null,
      };
    }

    case 'legacy':
    default: {
      let enc: EncryptedMessage = { encryptedContent: '', iv: '', salt: '' };
      if (input.text && input.sharedSecret) {
        enc = encryptMessage(input.text, input.sharedSecret);
      }
      return {
        messageContent: null,
        encryptedContent: enc.encryptedContent || null,
        iv: enc.iv || null,
        salt: enc.salt || null,
        isEncrypted: true,
        migrationVersion: MESSAGE_MIGRATION_VERSION.LEGACY_E2EE,
        mediaUrl: input.mediaUrl ?? null,
        mediaType: input.mediaType ?? null,
      };
    }
  }
}
