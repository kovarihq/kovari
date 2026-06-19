import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/core/realtime/realtime_coordinator.dart';
import 'package:mobile/core/realtime/socket_service.dart';
import 'package:mobile/core/realtime/socket_state.dart';
import 'package:mobile/core/runtime/mutation_journal.dart';
import 'package:mobile/core/security/encryption_service.dart';
import 'package:mobile/core/security/group_encryption_service.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/features/chat/models/message_entity.dart';
import 'package:mobile/features/chat/providers/conversation_runtime_store.dart';
import 'package:mobile/features/chat/providers/conversation_store.dart';
import 'package:mobile/features/chat/providers/message_store.dart';
import 'package:uuid/uuid.dart';

/// Typed payload stored in the MutationJournal for message sends.
class SendMessagePayload {
  const SendMessagePayload({
    required this.chatId,
    required this.clientMessageId,
    required this.senderId,
    this.text,
    this.encryptedContent,
    this.encryptionIv,
    this.encryptionSalt,
    this.isEncrypted = false,
    this.receiverId,
    this.senderClerkId,
    this.receiverClerkId,
    this.mediaUrl,
    this.mediaType,
  });

  final String chatId;
  final String clientMessageId;
  final String senderId;

  // Plain or encrypted text
  final String? text;
  final String? encryptedContent;
  final String? encryptionIv;
  final String? encryptionSalt;
  final bool isEncrypted;

  // Direct chat target
  final String? receiverId;
  final String? senderClerkId;
  final String? receiverClerkId;

  // Media (Phase 11)
  final String? mediaUrl;
  final String? mediaType;

  Map<String, dynamic> toJson() => <String, dynamic>{
    'chatId': chatId,
    'clientMessageId': clientMessageId,
    'senderId': senderId,
    'text': text,
    'encryptedContent': encryptedContent,
    'iv': encryptionIv,
    'salt': encryptionSalt,
    'isEncrypted': isEncrypted,
    'receiverId': receiverId,
    'senderClerkId': senderClerkId,
    'receiverClerkId': receiverClerkId,
    'mediaUrl': mediaUrl,
    'mediaType': mediaType,
  };

  factory SendMessagePayload.fromJson(Map<String, dynamic> json) =>
      SendMessagePayload(
        chatId: json['chatId'] as String,
        clientMessageId: json['clientMessageId'] as String,
        senderId: json['senderId'] as String,
        text: json['text'] as String?,
        encryptedContent: json['encryptedContent'] as String?,
        encryptionIv: json['iv'] as String?,
        encryptionSalt: json['salt'] as String?,
        isEncrypted: json['isEncrypted'] as bool? ?? false,
        receiverId: json['receiverId'] as String?,
        senderClerkId: json['senderClerkId'] as String?,
        receiverClerkId: json['receiverClerkId'] as String?,
        mediaUrl: json['mediaUrl'] as String?,
        mediaType: json['mediaType'] as String?,
      );

  Map<String, dynamic> toSocketPayload() => <String, dynamic>{
    'tempId': clientMessageId,
    'text': text,
    'encryptedContent': encryptedContent,
    'iv': encryptionIv,
    'salt': encryptionSalt,
    'isEncrypted': isEncrypted,
    'receiverId': receiverId,
    'senderClerkId': senderClerkId,
    'receiverClerkId': receiverClerkId,
    'mediaUrl': mediaUrl,
    'mediaType': mediaType,
  };
}

/// Orchestrates the full message send lifecycle:
///
///   1. Generate clientMessageId (UUID)
///   2. Record in MutationJournal as PENDING
///   3. Insert optimistic MessageEntity in MessageStore
///   4. Emit via SocketService (if connected) or queue for replay
///   5. On Level-2 ACK (message_persisted): reconcile → resolve journal
///   6. On failure: mark journal entry as FAILURE → UI shows retry
///
/// The MutationJournal ensures that on reconnect, pending mutations
/// can be replayed in-order by the ReplayEngine.
class ChatMutationService {
  ChatMutationService(this._ref);

  final Ref _ref;
  final _uuid = const Uuid();

  /// Send a message. Returns the [clientMessageId] for tracking.
  /// Instant optimistic feedback, encryption happens in background.
  String sendMessage({
    required String chatId,
    required String senderId,
    String? text,
    String? receiverId,
    String? senderClerkId,
    String? receiverClerkId,
    String? mediaUrl,
    String? mediaType,
  }) {
    final clientMessageId = _uuid.v4();

    AppLogger.d('🚀 [ChatMutationService] sendMessage for chatId: $chatId');
    // Step 1: Immediate Optimistic Insert (instant UI)
    final optimistic = MessageEntity.optimistic(
      clientMessageId: clientMessageId,
      chatId: chatId,
      senderId: senderId,
      text: text,
      mediaUrl: mediaUrl,
      mediaType: mediaType,
    );

    final store = _ref.read(messageStoreProvider(chatId).notifier);
    AppLogger.d(
      '🚀 [ChatMutationService] Adding optimistic message: ${optimistic.id}',
    );
    store.addOptimistic(optimistic);

    _performSecureSend(
      chatId: chatId,
      clientMessageId: clientMessageId,
      senderId: senderId,
      text: text,
      receiverId: receiverId,
      senderClerkId: senderClerkId,
      receiverClerkId: receiverClerkId,
      mediaUrl: mediaUrl,
      mediaType: mediaType,
    );

    // 💎 Instagram-Pro: Update Inbox immediately with optimistic message
    _ref
        .read(conversationStoreProvider.notifier)
        .updateLastMessage(chatId, optimistic);

    return clientMessageId;
  }

  /// Sends a pre-processed message (e.g. media with E2EE fields already calculated).
  Future<void> sendProcessedMessage({
    required String chatId,
    required String clientMessageId,
    required SendMessagePayload payload,
  }) async {
    AppLogger.d(
      '🚀 [ChatMutationService] sendProcessedMessage: $clientMessageId',
    );

    // 1. Record in journal
    await _ref
        .read(mutationJournalProvider)
        .record(
          MutationEntry<SendMessagePayload>(
            id: clientMessageId,
            entityId: chatId,
            type: MutationType.sendMessage,
            payload: payload,
          ),
        );

    // 2. 💎 Instagram-Pro: Update Inbox immediately with media placeholder/meta
    final message = MessageEntity(
      id: 'pending_$clientMessageId',
      chatId: chatId,
      senderId: payload.senderId,
      senderClerkId: payload.senderClerkId,
      receiverClerkId: payload.receiverClerkId,
      clientMessageId: clientMessageId,
      createdAt: DateTime.now(),
      text: payload.mediaType == 'image' ? '📷 Photo' : '🎥 Video',
      mediaUrl: payload.mediaUrl,
      mediaType: payload.mediaType,
      deliveryStatus: MessageDeliveryStatus.pending,
    );

    _ref
        .read(conversationStoreProvider.notifier)
        .updateLastMessage(chatId, message);

    // 3. Emit via socket (respecting connectivity)
    _emitOrDefer(chatId, clientMessageId, payload);
  }

  Future<void> _performSecureSend({
    required String chatId,
    required String clientMessageId,
    required String senderId,
    String? text,
    String? receiverId,
    String? senderClerkId,
    String? receiverClerkId,
    String? mediaUrl,
    String? mediaType,
  }) async {
    String? encryptedContent;
    String? iv;
    String? salt;
    bool isEncrypted = false;
    String? myClerkId = senderClerkId ?? senderId;
    String? partnerClerkId = receiverClerkId ?? receiverId;

    // Apply encryption for direct chats (Phase 2 security parity)
    if (text != null && text.isNotEmpty && receiverId != null) {
      try {
        // Identity Strategy: UUID:UUID for cross-platform parity with Web
        // Since direct chatIds are already sorted(UUID1_UUID2), we just replace '_' with ':'
        final sharedSecret = chatId.replaceAll('_', ':');

        final result = await EncryptionService().encryptMessage(
          text,
          sharedSecret,
        );
        encryptedContent = result['encryptedContent'];
        iv = result['encryption_iv'];
        salt = result['encryption_salt'];
        isEncrypted = true;
      } catch (e) {
        AppLogger.e('[ChatMutationService] Encryption failed.', error: e);
      }
    }

    // Apply encryption for group chats (Workstream 8 — Group E2EE parity)
    if (text != null && text.isNotEmpty && receiverId == null) {
      // No receiverId means this is a group chat send.
      // Use the GroupEncryptionService to fetch/cache the shared group key.
      try {
        final groupSvc = _ref.read(groupEncryptionServiceProvider);
        final encrypted = await groupSvc.encryptMessage(chatId, text);
        if (encrypted != null) {
          encryptedContent = encrypted['encryptedContent'];
          iv = encrypted['encryption_iv'];
          salt = encrypted['encryption_salt'];
          isEncrypted = true;
          AppLogger.d('[ChatMutationService] Group message encrypted for $chatId');
        }
      } catch (e) {
        AppLogger.e('[ChatMutationService] Group encryption failed.', error: e);
      }
    }

    if (!_ref.mounted) {
      AppLogger.w('[ChatMutationService] Ref is no longer mounted; discarding secure send completion.');
      return;
    }

    final payload = SendMessagePayload(
      chatId: chatId,
      clientMessageId: clientMessageId,
      senderId: senderId,
      text: text,
      encryptedContent: encryptedContent,
      encryptionIv: iv,
      encryptionSalt: salt,
      isEncrypted: isEncrypted,
      receiverId: receiverId,
      senderClerkId: myClerkId,
      receiverClerkId: partnerClerkId,
      mediaUrl: mediaUrl,
      mediaType: mediaType,
    );

    // Step 3: Record in MutationJournal
    final entry = MutationEntry<SendMessagePayload>(
      id: clientMessageId,
      entityId: chatId,
      type: MutationType.sendMessage,
      payload: payload,
    );
    _ref.read(mutationJournalProvider).record(entry);

    // Step 4: Emit via socket
    _emitOrDefer(chatId, clientMessageId, payload);

    AppLogger.d('[ChatMutationService] Securely sent: $clientMessageId');
  }

  void _emitOrDefer(
    String chatId,
    String clientMessageId,
    SendMessagePayload payload,
  ) {
    final socketState = _ref.read(socketServiceProvider);

    if (socketState == SocketState.connected) {
      _emit(chatId, clientMessageId, payload);
    } else {
      // Socket is offline — the MutationJournal persists the PENDING entry.
      // ReplayEngine will call replayPendingMessages() on reconnect.
      AppLogger.w(
        '[ChatMutationService] Socket offline. Message $clientMessageId queued for replay.',
      );
    }
  }

  void _emit(
    String chatId,
    String clientMessageId,
    SendMessagePayload payload,
  ) {
    // Mark as SENDING in journal to prevent ReplayEngine collisions
    _ref
        .read(mutationJournalProvider)
        .resolve(chatId, clientMessageId, MutationStatus.sending);

    _ref
        .read(realtimeCoordinatorProvider.notifier)
        .sendMessage(
          chatId: chatId,
          messagePayload: payload.toSocketPayload(),
          onAck: (ack) {
            final status = ack['status'] as String?;
            if (status == 'sent') {
              AppLogger.d(
                '[ChatMutationService] Level-1 ACK for $clientMessageId',
              );
              // 💎 Instagram-Pro: Update UI to show one checkmark (sent)
              _ref
                  .read(messageStoreProvider(chatId).notifier)
                  .updateDeliveryStatus(
                    'pending_$clientMessageId',
                    MessageDeliveryStatus.sent,
                  );

              // 💎 Instagram-Pro: Resolve journal IMMEDIATELY on Level-1 ACK
              // This prevents ReplayEngine from triggering redundant re-sends.
              _ref
                  .read(mutationJournalProvider)
                  .resolve(chatId, clientMessageId, MutationStatus.success);
            } else {
              AppLogger.e(
                '[ChatMutationService] Send failed for $clientMessageId: $ack',
              );
              _markFailed(chatId, clientMessageId);
            }
          },
        );
  }

  /// Called by ReplayEngine on reconnect to flush pending sends.
  void replayPendingMessages(String chatId) {
    final journal = _ref.read(mutationJournalProvider);
    final pending = journal.getPendingFor(chatId);

    for (final entry in pending) {
      // 💎 Instagram-Pro: Skip if already in flight to prevent redundant re-sends
      if (entry.status == MutationStatus.sending) {
        AppLogger.d(
          '[ChatMutationService] Skipping replay for $chatId/${entry.id}: already SENDING',
        );
        continue;
      }

      if (entry.payload is SendMessagePayload) {
        final payload = entry.payload as SendMessagePayload;
        AppLogger.i('[ChatMutationService] Replaying: ${entry.id}');
        _emit(chatId, entry.id, payload);
      }
    }
  }

  /// Mark a message send as failed. The journal entry remains as FAILURE
  /// so the UI can surface a retry action.
  void _markFailed(String chatId, String clientMessageId) {
    _ref
        .read(mutationJournalProvider)
        .resolve(chatId, clientMessageId, MutationStatus.failure);
    _ref
        .read(messageStoreProvider(chatId).notifier)
        .updateDeliveryStatus(
          'pending_$clientMessageId',
          MessageDeliveryStatus.failed,
        );
  }

  void retryMessage(String chatId, String clientMessageId) {
    AppLogger.d('🚀 [ChatMutationService] Retrying message: $clientMessageId');
    final journal = _ref.read(mutationJournalProvider);
    final entries = journal.getPendingFor(chatId);
    
    // Find the corresponding journal entry
    final entryIndex = entries.indexWhere((e) => e.id == clientMessageId);
    if (entryIndex == -1) {
      AppLogger.w('[ChatMutationService] No pending entry found for retry: $clientMessageId');
      return;
    }
    final entry = entries[entryIndex];
    
    // Update journal status to pending
    journal.resolve(chatId, clientMessageId, MutationStatus.pending);
    
    // Reset UI state to pending
    _ref.read(messageStoreProvider(chatId).notifier).updateDeliveryStatus(
      'pending_$clientMessageId',
      MessageDeliveryStatus.pending,
    );
    
    final SendMessagePayload payload;
    if (entry.payload is SendMessagePayload) {
      payload = entry.payload as SendMessagePayload;
    } else {
      payload = SendMessagePayload.fromJson(Map<String, dynamic>.from(entry.payload as Map));
    }
    
    _emit(chatId, clientMessageId, payload);
  }

  /// Resolve a successfully persisted message. Called when Level-2 ACK arrives.
  void resolveSuccess(String chatId, String clientMessageId) {
    _ref
        .read(mutationJournalProvider)
        .resolve(chatId, clientMessageId, MutationStatus.success);
  }
}

final chatMutationServiceProvider = Provider<ChatMutationService>(
  (ref) => ChatMutationService(ref),
);
