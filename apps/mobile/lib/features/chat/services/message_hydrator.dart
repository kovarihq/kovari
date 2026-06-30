enum HydrationAction {
  usePlaintext,
  decrypt,
  empty,
  invalid,
}

enum HydrationAnomaly {
  none,
  missingPlaintext,
  missingCipher,
  invalidVersion,
  missingFields,
}

enum MessageOrigin {
  socket,
  api,
  cache,
  optimistic,
}

class HydrationDecision {
  final HydrationAction action;
  final int migrationVersion;
  final HydrationAnomaly anomaly;
  final String? messageContent;

  HydrationDecision({
    required this.action,
    required this.migrationVersion,
    this.anomaly = HydrationAnomaly.none,
    this.messageContent,
  });
}

class MessageHydrator {
  static const int legacy = 1;
  static const int dual = 2;
  static const int plaintext = 3;

  static HydrationDecision resolve({
    required String? messageContent,
    required int? migrationVersion,
    required String? encryptedContent,
    required bool isEncrypted,
    required String? iv,
    required String? salt,
  }) {
    final version = migrationVersion ?? legacy;

    // 1. Dual Persistence / Plaintext Path (Version >= 2)
    if (version >= dual) {
      if (messageContent != null) {
        return HydrationDecision(
          action: HydrationAction.usePlaintext,
          migrationVersion: version,
          messageContent: messageContent,
        );
      }
      return HydrationDecision(
        action: HydrationAction.invalid,
        migrationVersion: version,
        anomaly: HydrationAnomaly.missingPlaintext,
      );
    }

    // 2. Legacy Decryption Path (Version 1)
    if (isEncrypted) {
      if (encryptedContent != null && iv != null && salt != null) {
        return HydrationDecision(
          action: HydrationAction.decrypt,
          migrationVersion: version,
        );
      }
      return HydrationDecision(
        action: HydrationAction.invalid,
        migrationVersion: version,
        anomaly: HydrationAnomaly.missingFields,
      );
    }

    // 3. Fallback unencrypted legacy or system messages
    return HydrationDecision(
      action: messageContent != null ? HydrationAction.usePlaintext : HydrationAction.empty,
      migrationVersion: version,
      messageContent: messageContent,
    );
  }
}
