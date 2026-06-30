import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/services/message_hydrator.dart';

void main() {
  group('MessageHydrator resolution tests', () {
    test('Version 2 with message_content present should usePlaintext', () {
      final decision = MessageHydrator.resolve(
        messageContent: 'Hello Plaintext',
        migrationVersion: 2,
        encryptedContent: null,
        isEncrypted: false,
        iv: null,
        salt: null,
      );

      expect(decision.action, HydrationAction.usePlaintext);
      expect(decision.migrationVersion, 2);
      expect(decision.messageContent, 'Hello Plaintext');
      expect(decision.anomaly, HydrationAnomaly.none);
    });

    test('Version 2 with message_content null should return invalid status with missingPlaintext anomaly', () {
      final decision = MessageHydrator.resolve(
        messageContent: null,
        migrationVersion: 2,
        encryptedContent: null,
        isEncrypted: false,
        iv: null,
        salt: null,
      );

      expect(decision.action, HydrationAction.invalid);
      expect(decision.migrationVersion, 2);
      expect(decision.anomaly, HydrationAnomaly.missingPlaintext);
    });

    test('Version 1 with isEncrypted and E2EE fields should route to decrypt', () {
      final decision = MessageHydrator.resolve(
        messageContent: null,
        migrationVersion: 1,
        encryptedContent: 'cipherText',
        isEncrypted: true,
        iv: 'iv',
        salt: 'salt',
      );

      expect(decision.action, HydrationAction.decrypt);
      expect(decision.migrationVersion, 1);
      expect(decision.anomaly, HydrationAnomaly.none);
    });

    test('Version 1 with isEncrypted but missing E2EE fields should return invalid status with missingFields anomaly', () {
      final decision = MessageHydrator.resolve(
        messageContent: null,
        migrationVersion: 1,
        encryptedContent: 'cipherText',
        isEncrypted: true,
        iv: null,
        salt: 'salt',
      );

      expect(decision.action, HydrationAction.invalid);
      expect(decision.migrationVersion, 1);
      expect(decision.anomaly, HydrationAnomaly.missingFields);
    });

    test('Version 1 without E2EE properties and message_content present should usePlaintext', () {
      final decision = MessageHydrator.resolve(
        messageContent: 'System init message',
        migrationVersion: 1,
        encryptedContent: null,
        isEncrypted: false,
        iv: null,
        salt: null,
      );

      expect(decision.action, HydrationAction.usePlaintext);
      expect(decision.migrationVersion, 1);
      expect(decision.messageContent, 'System init message');
      expect(decision.anomaly, HydrationAnomaly.none);
    });

    test('Fallback empty resolution status when no content is present', () {
      final decision = MessageHydrator.resolve(
        messageContent: null,
        migrationVersion: 1,
        encryptedContent: null,
        isEncrypted: false,
        iv: null,
        salt: null,
      );

      expect(decision.action, HydrationAction.empty);
      expect(decision.migrationVersion, 1);
      expect(decision.messageContent, isNull);
    });
  });
}
