export interface MessageInsertInput {
  text?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
}

export function buildMessageInsertPayload(
  input: MessageInsertInput
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
    media_url: input.mediaUrl ?? null,
    media_type: input.mediaType ?? null,
  };
}
