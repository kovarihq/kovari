import { writeModeTelemetry } from './writeModeTelemetry';

type PayloadMode = 'legacy' | 'dual' | 'plaintext';

function classifyPayload(p: {
  messageContent?: string | null;
  encryptedContent?: string | null;
  isEncrypted?: boolean;
}): PayloadMode {
  if (!p.isEncrypted && p.messageContent && !p.encryptedContent) return 'plaintext';
  if (p.isEncrypted && p.messageContent && p.encryptedContent) return 'dual';
  if (p.isEncrypted && p.encryptedContent) return 'legacy';
  return 'plaintext'; // Default fallback
}

export function assertMessagePayload(payload: {
  messageContent?: string | null;
  encryptedContent?: string | null;
  iv?: string | null;
  salt?: string | null;
  isEncrypted?: boolean;
  mediaUrl?: string | null;
}): PayloadMode {
  const mode = classifyPayload(payload);

  // ERROR — no content at all
  if (!payload.messageContent && !payload.mediaUrl && !payload.encryptedContent) {
    throw new Error('[assertMessagePayload] ERROR: payload has no text, media, or encrypted content.');
  }

  // ERROR — media_url mirrors message_content
  if (payload.mediaUrl && payload.messageContent === payload.mediaUrl) {
    throw new Error('[assertMessagePayload] ERROR: message_content must not duplicate media_url.');
  }

  // WARN — mixed mode: plaintext + encrypted fields present simultaneously
  if (payload.messageContent && payload.encryptedContent && !payload.isEncrypted) {
    console.warn(
      '[assertMessagePayload] WARN: plaintext payload contains encrypted fields. ' +
      'Persisting messageContent; encrypted fields will be stored only if mode is dual. ' +
      'Expected during rolling client/server deployment.'
    );
  }

  // INFO — write mode distribution telemetry
  console.info(`[assertMessagePayload] INFO: classified payload as mode="${mode}"`);
  writeModeTelemetry.record(mode);

  return mode;
}
