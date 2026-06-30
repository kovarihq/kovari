import { describe, it, expect } from "vitest";
import { hydrateMessageContent } from "../messageHydrator";
import { MESSAGE_MIGRATION_VERSION } from "@kovari/types";

describe("hydrateMessageContent", () => {
  it("should return plaintext for version >= 2 with message_content present", () => {
    const message = {
      message_content: "Hello Plaintext",
      migration_version: MESSAGE_MIGRATION_VERSION.DUAL_PERSISTENCE,
    };

    const result = hydrateMessageContent(message);

    expect(result).toEqual({
      content: "Hello Plaintext",
      source: "plaintext",
      status: "success",
      migrationVersion: MESSAGE_MIGRATION_VERSION.DUAL_PERSISTENCE,
    });
  });

  it("should handle empty fallback when no content is available", () => {
    const message = {
      message_content: null,
      migration_version: MESSAGE_MIGRATION_VERSION.DUAL_PERSISTENCE,
    };

    const result = hydrateMessageContent(message);

    expect(result).toEqual({
      content: "",
      source: "none",
      status: "empty",
      migrationVersion: MESSAGE_MIGRATION_VERSION.DUAL_PERSISTENCE,
    });
  });
});
