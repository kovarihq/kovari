import { hydrateMessageContent } from "@/services/messaging/messageHydrator";

// Phase 8A: E2EE fully decommissioned. This hook is a no-op shim retained only
// for call-site compatibility. Remove entirely in Phase 8B once callers are updated.
export const useGroupEncryption = (_groupId: string) => {
  // encryptMessage: plaintext passthrough — no-op after E2EE removal.
  const encryptMessage = (_message: string): null => null;

  // decryptMessage: plaintext passthrough shim.
  const decryptMessage = (plainMessage: { message_content?: string | null; migration_version?: number | null }): string | null => {
    const hydration = hydrateMessageContent({
      message_content: plainMessage.message_content,
      migration_version: plainMessage.migration_version,
    });
    return hydration.status === "empty" ? null : hydration.content;
  };

  return {
    groupKey: null,
    keyFingerprint: null,
    loading: false,
    error: null,
    encryptMessage,
    decryptMessage,
    refreshKey: async () => null,
    isEncryptionAvailable: true, // Always available — plaintext mode
  };
};
