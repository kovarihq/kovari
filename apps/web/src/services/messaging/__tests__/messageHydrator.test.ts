import { describe, it, expect, vi } from "vitest";
import { hydrateMessageContent } from "../messageHydrator";
import { MESSAGE_MIGRATION_VERSION } from "@kovari/types";


describe("hydrateMessageContent", () => {
  it("should return plaintext for version >= 2 with message_content present", () => {
    const message = {
      message_content: "Hello Plaintext",
      migration_version: MESSAGE_MIGRATION_VERSION.DUAL_PERSISTENCE,
    };
    const decryptMock = vi.fn();

    const result = hydrateMessageContent(message, decryptMock);

    expect(result).toEqual({
      content: "Hello Plaintext",
      source: "plaintext",
      status: "success",
      migrationVersion: MESSAGE_MIGRATION_VERSION.DUAL_PERSISTENCE,
    });
    expect(decryptMock).not.toHaveBeenCalled();
  });

  it("should return invalid status for version >= 2 with message_content null", () => {
    const message = {
      message_content: null,
      migration_version: MESSAGE_MIGRATION_VERSION.DUAL_PERSISTENCE,
    };
    const decryptMock = vi.fn();

    const result = hydrateMessageContent(message, decryptMock);

    expect(result).toEqual({
      content: "",
      source: "plaintext",
      status: "invalid",
      migrationVersion: MESSAGE_MIGRATION_VERSION.DUAL_PERSISTENCE,
    });
    expect(decryptMock).not.toHaveBeenCalled();
  });

  it("should invoke decryptCallback for version 1 with E2EE fields", () => {
    const message = {
      migration_version: MESSAGE_MIGRATION_VERSION.LEGACY_E2EE,
      is_encrypted: true,
      encrypted_content: "cipherText",
      encryption_iv: "iv",
      encryption_salt: "salt",
    };
    const decryptMock = vi.fn().mockReturnValue("decrypted text");

    const result = hydrateMessageContent(message, decryptMock);

    expect(result).toEqual({
      content: "decrypted text",
      source: "legacy",
      status: "success",
      migrationVersion: MESSAGE_MIGRATION_VERSION.LEGACY_E2EE,
    });
    expect(decryptMock).toHaveBeenCalled();
  });

  it("should return failed status if decryptCallback returns null or fails", () => {
    const message = {
      migration_version: MESSAGE_MIGRATION_VERSION.LEGACY_E2EE,
      is_encrypted: true,
      encrypted_content: "cipherText",
      encryption_iv: "iv",
      encryption_salt: "salt",
    };
    const decryptMock = vi.fn().mockImplementation(() => {
      throw new Error("crypto failed");
    });

    const result = hydrateMessageContent(message, decryptMock);

    expect(result).toEqual({
      content: "",
      source: "legacy",
      status: "failed",
      migrationVersion: MESSAGE_MIGRATION_VERSION.LEGACY_E2EE,
    });
    expect(decryptMock).toHaveBeenCalled();
  });

  it("should return system or fallback unencrypted content if not encrypted and version 1", () => {
    const message = {
      message_content: "system init",
      migration_version: MESSAGE_MIGRATION_VERSION.LEGACY_E2EE,
      is_encrypted: false,
    };
    const decryptMock = vi.fn();

    const result = hydrateMessageContent(message, decryptMock);

    expect(result).toEqual({
      content: "system init",
      source: "plaintext",
      status: "success",
      migrationVersion: MESSAGE_MIGRATION_VERSION.LEGACY_E2EE,
    });
    expect(decryptMock).not.toHaveBeenCalled();
  });

  it("should handle empty fallback when no content is available", () => {
    const message = {
      message_content: null,
      migration_version: MESSAGE_MIGRATION_VERSION.LEGACY_E2EE,
      is_encrypted: false,
    };
    const decryptMock = vi.fn();

    const result = hydrateMessageContent(message, decryptMock);

    expect(result).toEqual({
      content: "",
      source: "none",
      status: "empty",
      migrationVersion: MESSAGE_MIGRATION_VERSION.LEGACY_E2EE,
    });
    expect(decryptMock).not.toHaveBeenCalled();
  });
});
