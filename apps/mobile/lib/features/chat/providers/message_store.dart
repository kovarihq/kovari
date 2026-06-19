import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/core/realtime/socket_service.dart';
import 'package:mobile/core/runtime/mutation_journal.dart';
import 'package:mobile/core/security/encryption_service.dart';
import 'package:mobile/core/security/group_encryption_service.dart';
import 'package:mobile/core/telemetry/messaging_telemetry_service.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/features/chat/models/message_entity.dart';
import 'package:mobile/features/chat/providers/chat_mutation_service.dart';
import 'package:mobile/features/chat/providers/conversation_runtime_store.dart';
import 'package:mobile/features/chat/providers/conversation_store.dart';
import 'package:mobile/features/chat/utils/direct_chat_id.dart';
import 'package:mobile/core/realtime/conversation_integrity_service.dart';

/// Max messages to keep HOT in memory per conversation.
const _kHotWindowSize = 75;

/// State held by the MessageStore for a single conversation.
class ConversationMessageState {
  const ConversationMessageState({
    required this.chatId,
    this.messages = const {},
    this.orderedIds = const [],
    this.highestKnownSequence = 0,
    this.isHydrating = false,
    this.hasReachedTop = false,
    this.nextCursor,
    this.pendingGap,
  });

  final String chatId;

  /// Normalized entity map: messageId → MessageEntity
  final Map<String, MessageEntity> messages;

  /// Ordered list of IDs, sorted by conversationSequence (authoritative).
  final List<String> orderedIds;

  /// The highest CSN we have seen. Used for gap detection.
  final int highestKnownSequence;

  final bool isHydrating;
  final bool hasReachedTop;
  final String? nextCursor;

  /// A detected gap (fromSeq, toSeq) awaiting recovery.
  final (int, int)? pendingGap;

  /// Ordered, renderable messages — sliding HOT window (tail of the list).
  List<MessageEntity> get hotMessages {
    final all = orderedIds
        .map((id) => messages[id])
        .whereType<MessageEntity>()
        .toList();
    if (all.length > _kHotWindowSize) {
      return all.sublist(all.length - _kHotWindowSize);
    }
    return all;
  }

  ConversationMessageState copyWith({
    Map<String, MessageEntity>? messages,
    List<String>? orderedIds,
    int? highestKnownSequence,
    bool? isHydrating,
    bool? hasReachedTop,
    String? nextCursor,
    (int, int)? pendingGap,
    bool clearGap = false,
  }) => ConversationMessageState(
    chatId: chatId,
    messages: messages ?? this.messages,
    orderedIds: orderedIds ?? this.orderedIds,
    highestKnownSequence: highestKnownSequence ?? this.highestKnownSequence,
    isHydrating: isHydrating ?? this.isHydrating,
    hasReachedTop: hasReachedTop ?? this.hasReachedTop,
    nextCursor: nextCursor ?? this.nextCursor,
    pendingGap: clearGap ? null : (pendingGap ?? this.pendingGap),
  );
}

/// Normalized message store for a single conversation, keyed by [chatId].
///
/// Ordering: always by [conversationSequence] (authoritative). Falls back to
/// [createdAt] for optimistic (pending) messages without a CSN.
///
/// Sliding window: only [_kHotWindowSize] most recent messages are HOT.
/// Gap detection: emits `request_gap_fill` automatically via SocketService.
class MessageStore extends Notifier<ConversationMessageState> {
  late String _chatId;

  // Resolved conversation type — set during _hydrate() on first load.
  // Defaults to direct; corrected when a group chatId is detected.
  ConversationType _conversationType = ConversationType.direct;

  bool _isActive = true;

  void init(String chatId) => _chatId = chatId;
  @override
  ConversationMessageState build() {
    // 💎 Instagram-Pro: Keep messages HOT in memory even after leaving the screen
    final link = ref.keepAlive();
    _isActive = true;

    // Auto-dispose after 5 minutes of inactivity to save memory
    Timer? disposeTimer;
    ref.onDispose(() {
      disposeTimer?.cancel();
    });
    
    ref.onCancel(() {
      _isActive = false;
      // Defer trim: modifying state inside onCancel violates Riverpod lifecycle
      Future.microtask(() => _trimMessages(50));
      disposeTimer = Timer(const Duration(minutes: 5), () => link.close());
    });
    
    ref.onResume(() {
      _isActive = true;
      disposeTimer?.cancel();
    });

    final events = ref.watch(socketServiceProvider.notifier).events;
    final sub = events.listen((SocketEvent event) => _handleSocketEvent(event));
    ref.onDispose(() => sub.cancel());

    // Eagerly hydrate from API in the next microtask to ensure state is initialized
    Future.microtask(() => _hydrate());

    return ConversationMessageState(chatId: _chatId);
  }

  Future<void> _hydrate() async {
    AppLogger.d('[MessageStore] HYDRATE START for $_chatId');

    // Only show loading state if we have ZERO messages in memory
    final isFirstLoad = state.messages.isEmpty;
    if (isFirstLoad) {
      state = state.copyWith(isHydrating: true);
    }

    try {
      final authUser = ref.read(authProvider).user;
      if (authUser == null) {
        AppLogger.e('[MessageStore] FAILED: authUser is NULL');
        return;
      }

      // --- Pending Mutations from Journal ---
      // Ensures that even after a hot restart, unsent messages reappear instantly.
      final journal = ref.read(mutationJournalProvider);
      final pendingMutations = journal.getPendingFor(_chatId);

      if (pendingMutations.isNotEmpty) {
        final pendingEntities = pendingMutations.map((e) {
          SendMessagePayload payload;
          if (e.payload is SendMessagePayload) {
            payload = e.payload as SendMessagePayload;
          } else {
            payload = SendMessagePayload.fromJson(
              Map<String, dynamic>.from(e.payload as Map),
            );
          }

          return MessageEntity.optimistic(
            clientMessageId: payload.clientMessageId,
            chatId: payload.chatId,
            senderId: payload.senderId,
            text: payload.text,
            mediaUrl: payload.mediaUrl,
            mediaType: payload.mediaType,
          ).copyWith(
            createdAt: e.timestamp,
            deliveryStatus: e.status == MutationStatus.failure
                ? MessageDeliveryStatus.failed
                : MessageDeliveryStatus.pending,
          );
        }).toList();

        state = state.copyWith(
          messages: {for (var m in pendingEntities) m.id: m},
          orderedIds: pendingEntities.map((m) => m.id).toList(),
        );
      }

      // --- Dual Hydration Path (Workstream 1) ---
      // Determine conversation type from runtime store. If the runtime store
      // already has an entry with isGroup=true metadata, use group path.
      // Fallback: check whether chatId looks like a UUID pair (direct) or not.
      final runtimeEntry =
          ref.read(conversationRuntimeStoreProvider)[_chatId];
      final isGroupChat =
          runtimeEntry?.conversationType == ConversationType.group ||
          runtimeEntry?.metadata?.isGroup == true;

      _conversationType =
          isGroupChat ? ConversationType.group : ConversationType.direct;

      final apiClient = ref.read(apiClientProvider);
      List<dynamic> rawMessages = [];

      if (_conversationType == ConversationType.group) {
        // --- Group Chat Hydration ---
        AppLogger.d('[MessageStore] Group hydration path for $_chatId');
        final response = await apiClient.get<Map<String, dynamic>>(
          'groups/$_chatId/messages',
          queryParameters: {'limit': _kHotWindowSize},
          parser: (data) => data as Map<String, dynamic>,
          ignoreCache: true,
        );
        rawMessages = response.data?['messages'] as List<dynamic>? ?? [];
      } else {
        // --- Direct Chat Hydration ---
        final partnerId = directChatPartnerId(
          _chatId,
          authUser.id,
          myUserUuid: authUser.resolvedUuid,
        );
        if (partnerId == null) {
          AppLogger.e('[MessageStore] FAILED: partnerId is NULL for $_chatId');
          state = state.copyWith(isHydrating: false);
          return;
        }
        AppLogger.d('[MessageStore] Direct hydration path — partnerId: $partnerId');
        final response = await apiClient.get<Map<String, dynamic>>(
          'direct-chat/messages',
          queryParameters: {'partnerId': partnerId},
          parser: (data) => data as Map<String, dynamic>,
          ignoreCache: true,
        );
        rawMessages = response.data?['messages'] as List<dynamic>? ?? [];
      }

      final List<MessageEntity> entities = [];
      for (final json in rawMessages) {
        try {
          final entity = MessageEntity.fromSocket(
            json as Map<String, dynamic>,
            _chatId,
          );
          final decrypted = await _decryptIfNeeded(entity);
          entities.add(decrypted ?? entity);
        } catch (e) {
          AppLogger.e('[MessageStore] Error parsing message', error: e);
        }
      }

      hydrateFromHistory(
        entities,
        hasReachedTop: entities.length < _kHotWindowSize,
      );
    } catch (e, stack) {
      AppLogger.e(
        '[MessageStore] Hydration failed',
        error: e,
        stackTrace: stack,
      );
    } finally {
      state = state.copyWith(isHydrating: false);
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  void setHydrating({required bool value}) =>
      state = state.copyWith(isHydrating: value);

  /// Trigger a full sync of the conversation messages from the server.
  void resync() => _hydrate();

  /// Bulk-insert messages from a history API response page.
  void hydrateFromHistory(
    List<MessageEntity> messages, {
    String? nextCursor,
    bool hasReachedTop = false,
  }) {
    if (messages.isEmpty) {
      state = state.copyWith(isHydrating: false, hasReachedTop: hasReachedTop);
      return;
    }

    final updated = Map<String, MessageEntity>.from(state.messages);

    for (final msg in messages) {
      // 1. Precise ID deduplication (Map key)
      // 2. Client ID deduplication (reconcile pending)
      String? existingKey;
      if (msg.clientMessageId != null) {
        existingKey = updated.keys.firstWhere(
          (k) => updated[k]?.clientMessageId == msg.clientMessageId,
          orElse: () => '',
        );
      }

      // 3. Content Fingerprint (Robust fallback for modern social feel)
      if (existingKey == null || existingKey.isEmpty) {
        existingKey = updated.keys.firstWhere((k) {
          final e = updated[k]!;
          return e.senderId == msg.senderId &&
              e.text == msg.text &&
              (e.createdAt.difference(msg.createdAt).inSeconds.abs() < 2);
        }, orElse: () => '');
      }

      if (existingKey.isNotEmpty) {
        // Merge: Keep existing ID if it's authoritative, but update data
        updated[existingKey] = updated[existingKey]!.copyWith(
          id: msg.id, // Ensure we have the latest server ID
          conversationSequence: msg.conversationSequence,
          deliveryStatus: msg.deliveryStatus,
          serverSequence: msg.serverSequence,
        );
      } else {
        updated[msg.id] = msg;
      }
    }

    final ordered = _buildOrderedIds(updated);
    final highestSeq = _computeHighestSeq(updated);

    state = state.copyWith(
      messages: updated,
      orderedIds: ordered,
      highestKnownSequence: highestSeq > state.highestKnownSequence
          ? highestSeq
          : state.highestKnownSequence,
      isHydrating: false,
      hasReachedTop: hasReachedTop,
      nextCursor: nextCursor,
    );

    _enforceBudget();

    AppLogger.d(
      '[MessageStore:$_chatId] Hydrated ${messages.length} msgs. Deduplicated to ${updated.length} total.',
    );
  }

  /// Insert an optimistic message for immediate UI display.
  void addOptimistic(MessageEntity optimistic) {
    final updated = Map<String, MessageEntity>.from(state.messages)
      ..[optimistic.id] = optimistic;
    state = state.copyWith(
      messages: updated,
      orderedIds: _buildOrderedIds(updated),
    );

    _enforceBudget();

    // Update both stores: legacy ConversationStore (inbox) + new RuntimeStore (watermarks/snippets)
    ref
        .read(conversationStoreProvider.notifier)
        .updateLastMessage(_chatId, optimistic);
    ref.read(conversationRuntimeStoreProvider.notifier).updateLastMessage(
      chatId: _chatId,
      messageId: optimistic.id,
      snippet: optimistic.text,
      at: optimistic.createdAt,
      senderId: optimistic.senderId,
      deliveryState: optimistic.deliveryStatus,
    );
  }

  /// Reconcile optimistic → authoritative. Prevents duplicate renders.
  /// [clientMessageId] → [serverMessageId] mapping.
  void reconcileOptimistic({
    required String clientMessageId,
    required String serverMessageId,
    required int conversationSequence,
    required int serverSequence,
  }) {
    final pendingId = 'pending_$clientMessageId';
    final optimistic = state.messages[pendingId];
    if (optimistic == null) {
      AppLogger.w(
        '[MessageStore] reconcileOptimistic: no pending msg for $clientMessageId',
      );
      return;
    }

    final authoritative = optimistic.copyWith(
      id: serverMessageId,
      clientMessageId: clientMessageId,
      conversationSequence: conversationSequence,
      serverSequence: serverSequence,
      deliveryStatus: MessageDeliveryStatus.sent,
    );

    final updated = Map<String, MessageEntity>.from(state.messages)
      ..remove(pendingId)
      ..[serverMessageId] = authoritative;

    _detectAndHandleGap(conversationSequence, updated);

    state = state.copyWith(
      messages: updated,
      orderedIds: _buildOrderedIds(updated),
      highestKnownSequence: conversationSequence > state.highestKnownSequence
          ? conversationSequence
          : state.highestKnownSequence,
    );

    _enforceBudget();

    // Update both stores with authoritative message info
    ref
        .read(conversationStoreProvider.notifier)
        .updateLastMessage(_chatId, authoritative);
    ref.read(conversationRuntimeStoreProvider.notifier).updateLastMessage(
      chatId: _chatId,
      messageId: serverMessageId,
      snippet: authoritative.text,
      at: authoritative.createdAt,
      senderId: authoritative.senderId,
      deliveryState: MessageDeliveryStatus.sent,
    );
    ref
        .read(conversationRuntimeStoreProvider.notifier)
        .updateServerSequence(_chatId, conversationSequence);

    AppLogger.d(
      '[MessageStore] Reconciled $clientMessageId → $serverMessageId (CSN: $conversationSequence)',
    );
  }

  /// Update the delivery status of a single message.
  void updateDeliveryStatus(String messageId, MessageDeliveryStatus status) {
    final msg = state.messages[messageId];
    if (msg == null) return;
    final updated = Map<String, MessageEntity>.from(state.messages)
      ..[messageId] = msg.copyWith(deliveryStatus: status);
    state = state.copyWith(messages: updated);
  }

  /// 💎 Instagram-Pro: Update upload progress for a pending media message.
  void updateUploadProgress(String messageId, double progress) {
    final msg = state.messages[messageId];
    if (msg == null) return;
    final updated = Map<String, MessageEntity>.from(state.messages)
      ..[messageId] = msg.copyWith(uploadProgress: progress);
    state = state.copyWith(messages: updated);
  }

  /// 💎 Instagram-Pro: Update upload state for a media message.
  void updateUploadState(String messageId, MediaUploadState uploadState) {
    final msg = state.messages[messageId];
    if (msg == null) return;
    final updated = Map<String, MessageEntity>.from(state.messages)
      ..[messageId] = msg.copyWith(mediaUploadState: uploadState);
    state = state.copyWith(messages: updated);
  }

  /// Heuristic to get the partner's Clerk ID for E2EE routing.
  String? getPartnerClerkId() {
    final conversation = ref.read(conversationProvider(_chatId));
    return conversation?.partnerClerkId;
  }

  /// Mark all messages with CSN ≤ [lastSeenSequence] as seen.
  void markSeenUpTo(int lastSeenSequence) {
    final updated = Map<String, MessageEntity>.from(state.messages);
    var changed = false;
    for (final entry in updated.entries) {
      final msg = entry.value;
      final csn = msg.conversationSequence;
      if (csn != null &&
          csn <= lastSeenSequence &&
          msg.deliveryStatus != MessageDeliveryStatus.seen) {
        updated[entry.key] = msg.copyWith(
          deliveryStatus: MessageDeliveryStatus.seen,
        );
        changed = true;
      }
    }
    if (changed) state = state.copyWith(messages: updated);
  }

  /// Apply gap-fill messages from the server.
  void applyGapFill(List<MessageEntity> gapMessages) {
    if (gapMessages.isEmpty) return;
    final updated = Map<String, MessageEntity>.from(state.messages);
    for (final msg in gapMessages) {
      updated[msg.id] = msg;
    }
    final highestSeq = _computeHighestSeq(updated);
    state = state.copyWith(
      messages: updated,
      orderedIds: _buildOrderedIds(updated),
      highestKnownSequence: highestSeq,
      clearGap: true,
    );
    _enforceBudget();
    AppLogger.i(
      '[MessageStore] Gap filled with ${gapMessages.length} messages',
    );
  }

  // ---------------------------------------------------------------------------
  // Socket Event Handling
  // ---------------------------------------------------------------------------

  void _handleSocketEvent(SocketEvent event) {
    final data = event.data as Map<String, dynamic>?;
    if (data == null) return;

    // Support both direct (chatId) and group (groupId) event routing
    final msgChatId =
        data['chatId'] as String? ?? data['groupId'] as String?;
    if (msgChatId != _chatId) return;

    // --- Integrity Guard (Workstream 3) ---
    // Validate payload before entering the processing pipeline.
    final guard = ref.read(conversationIntegrityServiceProvider);
    final report = guard.inspect(event.type, data);
    if (!report.isValid && !report.isUnknownConversation) {
      AppLogger.w(
        '[MessageStore] Rejected ${event.type}: ${report.result} — ${report.reason}',
      );
      return;
    }

    switch (event.type) {
      case 'receive_message':
        _onReceiveMessage(data);
      case 'message_persisted':
        _onMessagePersisted(data);
      case 'messages_seen':
        final lastSeenSeq = data['lastSeenSequence'] as int?;
        if (lastSeenSeq != null) {
          markSeenUpTo(lastSeenSeq);
          ref
              .read(conversationRuntimeStoreProvider.notifier)
              .markSeenUpTo(_chatId, lastSeenSeq);
        }
      case 'message_delivered_ack':
        final messageId = data['messageId'] as String?;
        if (messageId != null) {
          updateDeliveryStatus(messageId, MessageDeliveryStatus.delivered);
          final csn = data['conversationSequence'] as int?;
          if (csn != null) {
            ref
                .read(conversationRuntimeStoreProvider.notifier)
                .updateDeliveredWatermark(_chatId, csn);
          }
        }
      default:
        break;
    }
  }

  void _onReceiveMessage(Map<String, dynamic> data) async {
    try {
      final entity = MessageEntity.fromSocket(data, _chatId);

      // 1. Content-based deduplication for real-time race conditions
      final isDuplicate = state.messages.values.any(
        (e) =>
            (e.id == entity.id) ||
            (entity.clientMessageId != null &&
                e.clientMessageId == entity.clientMessageId) ||
            (e.senderId == entity.senderId &&
                e.text == entity.text &&
                e.createdAt.difference(entity.createdAt).inSeconds.abs() < 2),
      );

      if (isDuplicate) {
        print(
          '🛡️ [MessageStore] Dropping duplicate real-time message: ${entity.id}',
        );
        return;
      }

      // Decrypt if necessary
      final decrypted = await _decryptIfNeeded(entity);
      final finalEntity = decrypted ?? entity;

      final csn = finalEntity.conversationSequence;
      final updated = Map<String, MessageEntity>.from(state.messages)
        ..[finalEntity.id] = finalEntity;

      if (csn != null) _detectAndHandleGap(csn, updated);

      final highestSeq = csn != null && csn > state.highestKnownSequence
          ? csn
          : state.highestKnownSequence;

      state = state.copyWith(
        messages: updated,
        orderedIds: _buildOrderedIds(updated),
        highestKnownSequence: highestSeq,
      );

      _enforceBudget();

      // Update legacy ConversationStore (inbox list)
      ref.read(conversationStoreProvider.notifier)
        ..updateLastMessage(_chatId, finalEntity)
        ..incrementUnread(_chatId);

      // Update new ConversationRuntimeStore (watermarks, snippets, unread)
      ref.read(conversationRuntimeStoreProvider.notifier)
        ..updateLastMessage(
          chatId: _chatId,
          messageId: finalEntity.id,
          snippet: finalEntity.text,
          at: finalEntity.createdAt,
          senderId: finalEntity.senderId,
        )
        ..incrementUnread(_chatId);

      if (csn != null) {
        ref
            .read(conversationRuntimeStoreProvider.notifier)
            .updateServerSequence(_chatId, csn);
      }

      // Emit delivery receipt for incoming messages (Workstream 5)
      ref.read(socketServiceProvider.notifier).emit(
        'message_delivered',
        <String, dynamic>{
          'chatId': _chatId,
          'messageId': finalEntity.id,
        },
      );
    } catch (e, stack) {
      AppLogger.e(
        '[MessageStore] Error in _onReceiveMessage',
        error: e,
        stackTrace: stack,
      );
    }
  }

  Future<MessageEntity?> _decryptIfNeeded(MessageEntity entity) async {
    final myUserId = ref.read(authProvider).user?.id;
    if (myUserId == null) return null;

    if (!entity.isEncrypted ||
        entity.encryptedContent == null ||
        entity.encryptionIv == null ||
        entity.encryptionSalt == null) {
      return null;
    }

    // --- Group Chat Decryption (Workstream 8) ---
    // Detect group conversations by checking the runtime store entry.
    final runtimeEntry = ref.read(conversationRuntimeStoreProvider)[_chatId];
    final isGroup = _conversationType == ConversationType.group ||
        runtimeEntry?.conversationType == ConversationType.group;

    if (isGroup) {
      try {
        final groupSvc = ref.read(groupEncryptionServiceProvider);
        final plain = await groupSvc.decryptMessage(
          groupId: _chatId,
          encryptedContent: entity.encryptedContent!,
          iv: entity.encryptionIv!,
          salt: entity.encryptionSalt!,
        );
        if (plain != '[Encrypted message]' && plain != '[Failed to decrypt]') {
          return entity.copyWith(text: plain, isEncrypted: false);
        }
        AppLogger.w('[MessageStore] Group decryption returned fallback for ${entity.id}');
      } catch (e) {
        AppLogger.e('[MessageStore] Group decryption failed', error: e);
      }
      return null;
    }

    // --- Direct Chat Decryption ---
    final user = ref.read(authProvider).user;
    final partnerId = directChatPartnerId(
      _chatId,
      myUserId,
      myUserUuid: user?.resolvedUuid,
    );
    if (partnerId == null) return null;

    final conversation = ref.read(conversationProvider(_chatId));

    // Identity Strategy: UUID:UUID for cross-platform parity with Web
    // Since direct chatIds are already sorted(UUID1_UUID2), we just replace '_' with ':'
    final sharedSecret = _chatId.replaceAll('_', ':');

    try {
      var decryptedText = await EncryptionService().decryptMessage(
        encryptedContent: entity.encryptedContent!,
        iv: entity.encryptionIv!,
        salt: entity.encryptionSalt!,
        key: sharedSecret,
      );

      // Fallback Strategy: Try Clerk IDs if UUID decryption fails (for legacy messages)
      if (decryptedText == '[Failed to decrypt]') {
        final conversation = ref.read(conversationProvider(_chatId));
        final myClerkId = user?.id ?? myUserId;
        final partnerClerkId = conversation?.partnerClerkId;

        if (partnerClerkId != null) {
          final ids = [myClerkId, partnerClerkId]..sort();
          final legacySecret = '${ids[0]}:${ids[1]}';
          if (legacySecret != sharedSecret) {
            AppLogger.d(
              '🛡️ [MessageStore] Attempting legacy fallback decryption...',
            );
            final fallbackResult = await EncryptionService().decryptMessage(
              encryptedContent: entity.encryptedContent!,
              iv: entity.encryptionIv!,
              salt: entity.encryptionSalt!,
              key: legacySecret,
            );
            if (fallbackResult != '[Failed to decrypt]') {
              decryptedText = fallbackResult;
            }
          }
        }
      }

      if (decryptedText != '[Failed to decrypt]') {
        return entity.copyWith(text: decryptedText, isEncrypted: false);
      }
    } catch (e) {
      AppLogger.e('[MessageStore] Decryption pipeline failed', error: e);
    }
    return null;
  }

  void _onMessagePersisted(Map<String, dynamic> data) {
    final tempId = data['tempId'] as String?;
    final serverMessageId = data['messageId'] as String?;
    final csn = data['conversationSequence'] as int?;
    final ssn = data['serverSequence'] as int?;

    if (tempId != null &&
        serverMessageId != null &&
        csn != null &&
        ssn != null) {
      reconcileOptimistic(
        clientMessageId: tempId,
        serverMessageId: serverMessageId,
        conversationSequence: csn,
        serverSequence: ssn,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Gap Detection
  // ---------------------------------------------------------------------------

  void _detectAndHandleGap(
    int incomingCsn,
    Map<String, MessageEntity> currentMessages,
  ) {
    // Find the highest sequence number in the store that is less than incomingCsn
    var highest = 0;
    for (final msg in currentMessages.values) {
      final csn = msg.conversationSequence;
      if (csn != null && csn < incomingCsn && csn > highest) {
        highest = csn;
      }
    }
    if (highest == 0 || incomingCsn == 0) return;
    if (incomingCsn > highest + 1) {
      final fromSeq = highest + 1;
      final toSeq = incomingCsn - 1;
      final gapSize = toSeq - fromSeq + 1;
      AppLogger.w(
        '[MessageStore:$_chatId] 🚨 Gap detected! Missing CSN $fromSeq–$toSeq',
      );
      state = state.copyWith(pendingGap: (fromSeq, toSeq));

      // WS 11: Record gap fill request telemetry
      ref.read(messagingTelemetryProvider).recordGapFillRequested(
        chatId: _chatId,
        fromSequence: fromSeq,
        toSequence: toSeq,
      );

      // WS 11: Drift detection — anomalous jumps get a separate high-priority event
      ref.read(messagingTelemetryProvider).recordSequenceDrift(
        conversationId: _chatId,
        expectedSequence: highest + 1,
        receivedSequence: incomingCsn,
      );

      ref.read(socketServiceProvider.notifier).emit(
        'request_gap_fill',
        <String, dynamic>{
          'chatId': _chatId,
          'fromSequence': fromSeq,
          'toSequence': toSeq,
        },
        (dynamic response) {
          if (response is Map) {
            final status = response['status'] as String?;
            if (status == 'success') {
              final msgs = response['messages'] as List?;
              if (msgs != null) {
                final List<MessageEntity> gapMessages = [];
                for (final m in msgs) {
                  try {
                    final entity = MessageEntity.fromSocket(
                      Map<String, dynamic>.from(m as Map),
                      _chatId,
                    );
                    gapMessages.add(entity);
                  } catch (e) {
                    AppLogger.e('Error parsing gap message', error: e);
                  }
                }
                applyGapFill(gapMessages);
                // WS 11: Record successful gap fill resolution
                ref.read(messagingTelemetryProvider).recordGapFillResolved(
                  chatId: _chatId,
                  recoveredCount: gapMessages.length,
                  fallbackToRest: false,
                );
              }
            } else if (status == 'GAP_TOO_LARGE') {
              AppLogger.w('[MessageStore] GAP_TOO_LARGE status returned. Falling back to REST hydration.');
              // WS 11: Record fallback resolution
              ref.read(messagingTelemetryProvider).recordGapFillResolved(
                chatId: _chatId,
                recoveredCount: gapSize,
                fallbackToRest: true,
              );
              _hydrate();
            }
          }
        },
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  List<String> _buildOrderedIds(Map<String, MessageEntity> messages) {
    final sorted = messages.values.toList()
      ..sort((a, b) {
        final aSeq = a.conversationSequence;
        final bSeq = b.conversationSequence;
        if (aSeq != null && bSeq != null) return aSeq.compareTo(bSeq);
        if (aSeq != null) return -1;
        if (bSeq != null) return 1;
        return a.createdAt.compareTo(b.createdAt);
      });
    return sorted.map((m) => m.id).toList();
  }

  int _computeHighestSeq(Map<String, MessageEntity> messages) {
    var highest = 0;
    for (final msg in messages.values) {
      final csn = msg.conversationSequence;
      if (csn != null && csn > highest) highest = csn;
    }
    return highest;
  }

  void _trimMessages(int maxCount) {
    if (state.orderedIds.length <= maxCount) return;

    final toKeepIds = state.orderedIds.sublist(state.orderedIds.length - maxCount);
    final updatedMessages = <String, MessageEntity>{};
    for (final id in toKeepIds) {
      if (state.messages.containsKey(id)) {
        updatedMessages[id] = state.messages[id]!;
      }
    }

    state = state.copyWith(
      messages: updatedMessages,
      orderedIds: toKeepIds,
    );
    AppLogger.d('[MessageStore:$_chatId] Trimmed memory to $maxCount messages (isActive: $_isActive)');
  }

  void _enforceBudget() {
    final limit = _isActive ? 500 : 50;
    _trimMessages(limit);
  }
}

/// Factory that creates a per-conversation [MessageStore] keyed by [chatId].
///
/// Usage: `ref.watch(messageStoreProvider('chatId_here'))`
final messageStoreProvider =
    NotifierProvider.family<MessageStore, ConversationMessageState, String>(
      (chatId) => MessageStore()..init(chatId),
    );
