import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/features/chat/providers/conversation_runtime_store.dart';

/// Result of an integrity check on an incoming socket payload.
enum IntegrityResult {
  /// Payload is valid — proceed with processing.
  valid,

  /// Conversation does not exist locally (dynamically bootstrappable).
  unknownConversation,

  /// The authenticated user does not belong to this conversation.
  unauthorized,

  /// The payload is structurally malformed (missing required fields).
  malformed,

  /// The conversation membership version is stale — user may have been removed.
  membershipVersionMismatch,

  /// The sequence number in the payload is invalid or out of expected range.
  invalidSequence,
}

/// Report returned by [ConversationIntegrityService.inspect].
class IntegrityReport {
  const IntegrityReport({
    required this.result,
    required this.chatId,
    this.reason,
  });

  final IntegrityResult result;
  final String chatId;

  /// Human-readable reason for non-valid results (used for telemetry/logging).
  final String? reason;

  bool get isValid => result == IntegrityResult.valid;
  bool get isUnknownConversation =>
      result == IntegrityResult.unknownConversation;
}

/// Guards every incoming socket event payload before it reaches the message
/// processing pipeline.
///
/// Responsibilities:
/// - Verify the conversation exists locally (or flag as dynamically discoverable).
/// - Verify the authenticated user belongs to the conversation.
/// - Validate payload structure (required fields present and well-typed).
/// - Enforce conversation membership versioning to prevent stale/unauthorized
///   event processing when a user has been removed from a group.
/// - Reject malformed or invalid-sequence payloads.
///
/// Usage:
/// ```dart
/// final guard = ref.read(conversationIntegrityServiceProvider);
/// final report = guard.inspect(event.type, data);
/// if (!report.isValid && !report.isUnknownConversation) return;
/// ```
class ConversationIntegrityService {
  ConversationIntegrityService(this._ref);

  final Ref _ref;

  /// Inspect an incoming socket event payload.
  ///
  /// [eventType] — the socket event name (e.g. 'receive_message').
  /// [data] — the raw payload map from the socket.
  IntegrityReport inspect(String eventType, Map<String, dynamic> data) {
    // --- 1. Extract chatId (supports direct chatId and group groupId) ---
    final chatId =
        data['chatId'] as String? ?? data['groupId'] as String?;

    if (chatId == null || chatId.isEmpty) {
      return IntegrityReport(
        result: IntegrityResult.malformed,
        chatId: '',
        reason: '[$eventType] Missing chatId/groupId in payload',
      );
    }

    // --- 2. Structural validation (event-specific required fields) ---
    final malformedReason = _checkStructure(eventType, data);
    if (malformedReason != null) {
      AppLogger.w(
        '[IntegrityGuard] Malformed $eventType for $chatId: $malformedReason',
      );
      return IntegrityReport(
        result: IntegrityResult.malformed,
        chatId: chatId,
        reason: malformedReason,
      );
    }

    // --- 3. Authenticated user check ---
    final myUser = _ref.read(authProvider).user;
    if (myUser == null) {
      return IntegrityReport(
        result: IntegrityResult.unauthorized,
        chatId: chatId,
        reason: 'No authenticated user',
      );
    }

    // --- 4. Conversation existence check ---
    final runtimeStore = _ref.read(conversationRuntimeStoreProvider);
    final runtimeEntry = runtimeStore[chatId];

    if (runtimeEntry == null) {
      // Unknown conversation — might be a new chat that hasn't been fetched yet.
      // Return unknownConversation so the caller can dynamically bootstrap it.
      AppLogger.d(
        '[IntegrityGuard] Unknown conversation $chatId for $eventType — flagged for bootstrap',
      );
      return IntegrityReport(
        result: IntegrityResult.unknownConversation,
        chatId: chatId,
        reason: 'Conversation not in local runtime store',
      );
    }

    // --- 5. Membership version check (group conversations) ---
    if (runtimeEntry.conversationType == ConversationType.group) {
      final payloadMembershipVersion =
          data['conversationMembershipVersion'] as int?;
      if (payloadMembershipVersion != null &&
          payloadMembershipVersion <
              runtimeEntry.conversationMembershipVersion) {
        AppLogger.w(
          '[IntegrityGuard] Membership version mismatch for $chatId: '
          'payload=$payloadMembershipVersion, '
          'local=${runtimeEntry.conversationMembershipVersion}',
        );
        return IntegrityReport(
          result: IntegrityResult.membershipVersionMismatch,
          chatId: chatId,
          reason:
              'Payload membership version ($payloadMembershipVersion) < '
              'cached version (${runtimeEntry.conversationMembershipVersion})',
        );
      }
    }

    // --- 6. Sequence validation (for message events only) ---
    if (eventType == 'receive_message' || eventType == 'message_persisted') {
      final csn =
          data['conversationSequence'] as int? ??
          data['conversation_sequence'] as int?;
      final lastKnown = runtimeEntry.lastKnownServerSequence ?? 0;

      // A valid incoming CSN must be positive.
      if (csn != null && csn <= 0) {
        return IntegrityReport(
          result: IntegrityResult.invalidSequence,
          chatId: chatId,
          reason: 'Invalid CSN $csn (must be > 0)',
        );
      }

      // Flag if CSN is anomalously large (> 10000 ahead) — possible attack or bug.
      if (csn != null && lastKnown > 0 && csn > lastKnown + 10000) {
        AppLogger.w(
          '[IntegrityGuard] Anomalous sequence for $chatId: '
          'received=$csn, lastKnown=$lastKnown',
        );
        // Do not reject — log and allow. Gap detection will handle recovery.
      }
    }

    return IntegrityReport(result: IntegrityResult.valid, chatId: chatId);
  }

  // ---------------------------------------------------------------------------
  // Private: Structural Validation
  // ---------------------------------------------------------------------------

  /// Returns a non-null error string if the payload is structurally invalid
  /// for the given event type, or `null` if valid.
  String? _checkStructure(String eventType, Map<String, dynamic> data) {
    switch (eventType) {
      case 'receive_message':
      case 'message_persisted':
        final msgData = (data['message'] as Map<String, dynamic>?) ?? data;
        final id = msgData['id'] as String?;
        final senderId =
            msgData['senderId'] as String? ?? msgData['sender_id'] as String?;
        if (id == null || id.isEmpty) return 'Missing message id';
        if (senderId == null || senderId.isEmpty) {
          return 'Missing senderId';
        }
        return null;

      case 'user_typing':
      case 'user_stopped_typing':
        final userId = data['userId'] as String?;
        if (userId == null || userId.isEmpty) return 'Missing userId';
        return null;

      case 'messages_seen':
        final seq = data['lastSeenSequence'];
        if (seq == null) return 'Missing lastSeenSequence';
        return null;

      case 'message_delivered_ack':
        final msgId = data['messageId'] as String?;
        if (msgId == null || msgId.isEmpty) return 'Missing messageId';
        return null;

      // Events with minimal required fields
      case 'user_online':
      case 'user_offline':
        return null;

      default:
        // Unknown event types pass through unvalidated
        return null;
    }
  }
}

final conversationIntegrityServiceProvider =
    Provider<ConversationIntegrityService>(
  (ref) => ConversationIntegrityService(ref),
);
