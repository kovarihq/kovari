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

import 'package:mobile/core/network/sync_engine.dart';
import 'package:mobile/core/providers/cache_provider.dart';

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

  /// Ordered, renderable messages currently loaded in memory.
  List<MessageEntity> get hotMessages {
    return orderedIds
        .map((id) => messages[id])
        .whereType<MessageEntity>()
        .toList();
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
  bool _isDisposed = false;

  String? get _myUserId {
    final user = ref.read(authProvider).user;
    return user?.resolvedUuid ?? user?.id;
  }

  /// Parses API/socket JSON and restores [MessageDeliveryStatus.seen] from
  /// persisted [read_at] for the current user's outgoing messages.
  MessageEntity _parseMessageJson(Map<String, dynamic> json) {
    final entity = MessageEntity.fromSocket(
      json,
      _chatId,
      currentUserId: _myUserId,
    );
    if (entity.deliveryStatus == MessageDeliveryStatus.seen) {
      return entity;
    }
    if (_isOwnSentMessage(entity)) {
      final readAt = json['readAt'] ?? json['read_at'];
      if (readAt != null && readAt.toString().isNotEmpty) {
        return entity.copyWith(deliveryStatus: MessageDeliveryStatus.seen);
      }
    }
    return entity;
  }

  MessageDeliveryStatus _maxDeliveryStatus(
    MessageDeliveryStatus current,
    MessageDeliveryStatus incoming,
  ) {
    int rank(MessageDeliveryStatus status) => switch (status) {
      MessageDeliveryStatus.seen => 4,
      MessageDeliveryStatus.delivered => 3,
      MessageDeliveryStatus.sent => 2,
      MessageDeliveryStatus.pending => 1,
      MessageDeliveryStatus.failed => 0,
    };
    return rank(current) >= rank(incoming) ? current : incoming;
  }

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
      _isDisposed = true;
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

    final events = ref.read(socketServiceProvider.notifier).events;
    final sub = events.listen((SocketEvent event) => _handleSocketEvent(event));
    ref.onDispose(() => sub.cancel());

    // Eagerly hydrate from API in the next microtask to ensure state is initialized
    Future.microtask(() => _hydrate());

    return ConversationMessageState(chatId: _chatId);
  }

  Future<void> _hydrate({bool forceRefresh = false}) async {
    AppLogger.d(
      '[MessageStore] HYDRATE START for $_chatId (forceRefresh: $forceRefresh)',
    );

    // Only show loading state if we have ZERO messages in memory
    final isFirstLoad = state.messages.isEmpty;
    if (isFirstLoad) {
      if (_isDisposed || !_isActive) return;
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

        if (_isDisposed || !_isActive) return;
        final updated = Map<String, MessageEntity>.from(state.messages);
        for (final m in pendingEntities) {
          updated[m.id] = m;
        }
        state = state.copyWith(
          messages: updated,
          orderedIds: _buildOrderedIds(updated),
        );
      }

      // --- Dual Hydration Path (Workstream 1) ---
      // Determine conversation type from runtime store. If the runtime store
      // already has an entry with isGroup=true metadata, use group path.
      // Fallback: check whether chatId looks like a UUID pair (direct) or not.
      // A direct chat ID is always "uuid_uuid" (exactly 2 parts when split on '_').
      // Group chat IDs are single UUIDs and will have != 2 parts.
      final runtimeEntry = ref.read(conversationRuntimeStoreProvider)[_chatId];
      final isGroupChat =
          runtimeEntry?.conversationType == ConversationType.group ||
          runtimeEntry?.metadata?.isGroup == true ||
          _chatId.split('_').length !=
              2; // Structural fallback: group IDs aren't uuid_uuid

      _conversationType = isGroupChat
          ? ConversationType.group
          : ConversationType.direct;

      final syncEngine = ref.read(syncEngineProvider);

      if (_conversationType == ConversationType.group) {
        // --- Group Chat Hydration ---
        AppLogger.d('[MessageStore] Group SWR hydration path for $_chatId');
        final rawData = await syncEngine.swrFetch<Map<String, dynamic>>(
          path: 'groups/$_chatId/messages',
          queryParameters: {'limit': _kHotWindowSize},
          parser: (data) {
            if (data is List) {
              return {'messages': data};
            }
            return data as Map<String, dynamic>;
          },
          ignoreCache: forceRefresh,
          onUpdate: (updatedData) {
            if (!_isDisposed && _isActive) {
              _processHistoryData(
                updatedData,
                path: 'groups/$_chatId/messages',
                params: {'limit': _kHotWindowSize},
              );
            }
          },
        );
        if (_isDisposed || !_isActive) return;
        if (rawData != null) {
          await _processHistoryData(
            rawData,
            path: 'groups/$_chatId/messages',
            params: {'limit': _kHotWindowSize},
          );
        }
      } else {
        // --- Direct Chat Hydration ---
        final partnerId = directChatPartnerId(
          _chatId,
          authUser.id,
          myUserUuid: authUser.resolvedUuid,
        );
        if (partnerId == null) {
          AppLogger.e('[MessageStore] FAILED: partnerId is NULL for $_chatId');
          if (!_isDisposed && _isActive) {
            state = state.copyWith(isHydrating: false);
          }
          return;
        }
        AppLogger.d(
          '[MessageStore] Direct SWR hydration path — partnerId: $partnerId',
        );
        final rawData = await syncEngine.swrFetch<Map<String, dynamic>>(
          path: 'direct-chat/messages',
          queryParameters: {'partnerId': partnerId, 'limit': _kHotWindowSize},
          parser: (data) => data as Map<String, dynamic>,
          ignoreCache: forceRefresh,
          onUpdate: (updatedData) {
            if (!_isDisposed && _isActive) {
              _processHistoryData(
                updatedData,
                path: 'direct-chat/messages',
                params: {'partnerId': partnerId, 'limit': _kHotWindowSize},
              );
            }
          },
        );
        if (_isDisposed || !_isActive) return;
        if (rawData != null) {
          await _processHistoryData(
            rawData,
            path: 'direct-chat/messages',
            params: {'partnerId': partnerId, 'limit': _kHotWindowSize},
          );
        }
      }
    } catch (e, stack) {
      AppLogger.e(
        '[MessageStore] Hydration failed',
        error: e,
        stackTrace: stack,
      );
    } finally {
      if (!_isDisposed && _isActive) {
        state = state.copyWith(isHydrating: false);
      }
    }
  }

  Future<void> _processHistoryData(
    Map<String, dynamic> data, {
    required String path,
    required Map<String, dynamic> params,
  }) async {
    if (_isDisposed || !_isActive) return;
    final rawMessages = data['messages'] as List<dynamic>? ?? [];
    final List<MessageEntity> entities = [];
    var anyDecrypted = false;
    for (final json in rawMessages) {
      try {
        final entity = _parseMessageJson(json as Map<String, dynamic>);
        AppLogger.d(
          '[MessageStore DEBUG] Raw JSON: $json | Entity: id=${entity.id}, text=${entity.text}, isEncrypted=${entity.isEncrypted}, mediaUrl=${entity.mediaUrl}, mediaType=${entity.mediaType}',
        );
        if (entity.isEncrypted) {
          final decrypted = await _decryptIfNeeded(entity);
          if (decrypted != null) {
            entities.add(decrypted);
            anyDecrypted = true;
          } else {
            entities.add(entity);
          }
        } else {
          entities.add(entity);
        }
      } catch (e) {
        AppLogger.e('[MessageStore] Error parsing message', error: e);
      }
    }

    if (_isDisposed || !_isActive) return;

    if (anyDecrypted) {
      try {
        final decryptedJson = {
          'messages': entities.map((e) => e.toSocket()).toList(),
        };
        await ref
            .read(localCacheProvider)
            .set(path, decryptedJson, params: params);
        AppLogger.d(
          '🔒 [Cache] Saved decrypted history back to cache for $path',
        );
      } catch (e) {
        AppLogger.e('Failed to save decrypted history back to cache', error: e);
      }
    }

    final requestedLimit = params['limit'] as int? ?? _kHotWindowSize;
    hydrateFromHistory(
      entities,
      hasReachedTop: entities.length < requestedLimit,
    );
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  void setHydrating({required bool value}) =>
      state = state.copyWith(isHydrating: value);

  /// Trigger a full sync of the conversation messages from the server.
  void resync({bool forceRefresh = false}) =>
      _hydrate(forceRefresh: forceRefresh);

  /// Loads the next page of older messages using the oldest message's timestamp as cursor.
  Future<void> loadMore() async {
    if (state.isHydrating || state.hasReachedTop || _isDisposed || !_isActive)
      return;
    if (state.orderedIds.isEmpty) return;

    // The first message in orderedIds is the oldest loaded in memory.
    final oldestId = state.orderedIds.first;
    final oldestMsg = state.messages[oldestId];
    if (oldestMsg == null) return;

    final cursor = oldestMsg.createdAt.toUtc().toIso8601String();

    // Set hydrating flag to prevent concurrent pagination calls
    state = state.copyWith(isHydrating: true);

    try {
      final syncEngine = ref.read(syncEngineProvider);
      final authUser = ref.read(authProvider).user;
      if (authUser == null) return;

      Map<String, dynamic>? rawData;
      String path;
      Map<String, dynamic> params;

      if (_conversationType == ConversationType.group) {
        path = 'groups/$_chatId/messages';
        params = {'limit': 50, 'cursor': cursor};
        rawData = await syncEngine.swrFetch<Map<String, dynamic>>(
          path: path,
          queryParameters: params,
          parser: (data) {
            if (data is List) {
              return {'messages': data};
            }
            return data as Map<String, dynamic>;
          },
          ignoreCache: true, // Pagination bypasses cache to get fresh history
        );
      } else {
        final partnerId = directChatPartnerId(
          _chatId,
          authUser.id,
          myUserUuid: authUser.resolvedUuid,
        );
        if (partnerId == null) return;

        path = 'direct-chat/messages';
        params = {'partnerId': partnerId, 'cursor': cursor, 'limit': 50};
        rawData = await syncEngine.swrFetch<Map<String, dynamic>>(
          path: path,
          queryParameters: params,
          parser: (data) => data as Map<String, dynamic>,
          ignoreCache: true,
        );
      }

      if (_isDisposed || !_isActive) return;

      if (rawData != null) {
        final rawMessages = rawData['messages'] as List<dynamic>? ?? [];
        final List<MessageEntity> fetchedEntities = [];
        var anyDecrypted = false;
        for (final json in rawMessages) {
          try {
            final entity = _parseMessageJson(json as Map<String, dynamic>);
            if (entity.isEncrypted) {
              final decrypted = await _decryptIfNeeded(entity);
              if (decrypted != null) {
                fetchedEntities.add(decrypted);
                anyDecrypted = true;
              } else {
                fetchedEntities.add(entity);
              }
            } else {
              fetchedEntities.add(entity);
            }
          } catch (e) {
            AppLogger.e(
              '[MessageStore] Error parsing paginated message',
              error: e,
            );
          }
        }

        if (_isDisposed || !_isActive) return;

        if (fetchedEntities.isEmpty) {
          state = state.copyWith(hasReachedTop: true, isHydrating: false);
        } else {
          // Merge paginated messages with current state
          final updated = Map<String, MessageEntity>.from(state.messages);
          for (final msg in fetchedEntities) {
            updated[msg.id] = msg;
          }

          if (anyDecrypted) {
            try {
              final decryptedJson = {
                'messages': fetchedEntities.map((e) => e.toSocket()).toList(),
              };
              await ref
                  .read(localCacheProvider)
                  .set(path, decryptedJson, params: params);
            } catch (e) {
              AppLogger.e(
                'Failed to cache decrypted paginated messages',
                error: e,
              );
            }
          }

          state = state.copyWith(
            messages: updated,
            orderedIds: _buildOrderedIds(updated),
            isHydrating: false,
            hasReachedTop: fetchedEntities.length < 50,
          );
          _enforceBudget();
        }
      }
    } catch (e, stack) {
      AppLogger.e(
        '[MessageStore] Load more failed',
        error: e,
        stackTrace: stack,
      );
    } finally {
      if (!_isDisposed && _isActive) {
        state = state.copyWith(isHydrating: false);
      }
    }
  }

  /// Bulk-insert messages from a history API response page.
  void hydrateFromHistory(
    List<MessageEntity> messages, {
    String? nextCursor,
    bool hasReachedTop = false,
  }) {
    if (_isDisposed) return;
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
          deliveryStatus: _maxDeliveryStatus(
            updated[existingKey]!.deliveryStatus,
            msg.deliveryStatus,
          ),
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
    ref
        .read(conversationRuntimeStoreProvider.notifier)
        .updateLastMessage(
          chatId: _chatId,
          messageId: optimistic.id,
          snippet: optimistic.text,
          at: optimistic.createdAt,
          senderId: optimistic.senderId,
          deliveryState: optimistic.deliveryStatus,
          mediaType: optimistic.mediaType,
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
    ref
        .read(conversationRuntimeStoreProvider.notifier)
        .updateLastMessage(
          chatId: _chatId,
          messageId: serverMessageId,
          snippet: authoritative.text,
          at: authoritative.createdAt,
          senderId: authoritative.senderId,
          deliveryState: MessageDeliveryStatus.sent,
          mediaType: authoritative.mediaType,
        );
    ref
        .read(conversationRuntimeStoreProvider.notifier)
        .updateServerSequence(_chatId, conversationSequence);

    unawaited(_persistMessageToHistoryCache(authoritative));

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

  /// Mark explicit [messageIds] as seen (parity with web `handleMessagesSeen`).
  void markSeenByMessageIds(List<String> messageIds) {
    if (messageIds.isEmpty) return;
    final idSet = messageIds.toSet();
    final updated = Map<String, MessageEntity>.from(state.messages);
    var changed = false;

    for (final entry in updated.entries) {
      final msg = entry.value;
      if (!_isOwnSentMessage(msg)) continue;
      if (msg.deliveryStatus == MessageDeliveryStatus.seen) continue;

      final clientId = msg.clientMessageId;
      final matches =
          idSet.contains(msg.id) ||
          (clientId != null && idSet.contains(clientId)) ||
          (clientId != null && idSet.contains('pending_$clientId'));

      if (matches) {
        updated[entry.key] = msg.copyWith(
          deliveryStatus: MessageDeliveryStatus.seen,
        );
        changed = true;
      }
    }

    if (changed) state = state.copyWith(messages: updated);
  }

  /// Mark all own sent messages with CSN ≤ [lastSeenSequence] as seen.
  void markSeenUpTo(int lastSeenSequence) {
    final updated = Map<String, MessageEntity>.from(state.messages);
    var changed = false;
    for (final entry in updated.entries) {
      final msg = entry.value;
      if (!_isOwnSentMessage(msg)) continue;
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

  bool _isOwnSentMessage(MessageEntity msg) {
    final user = ref.read(authProvider).user;
    if (user == null) return false;
    final myIds = {
      user.id,
      user.resolvedUuid,
      user.uuid,
    }.whereType<String>().where((id) => id.isNotEmpty).toSet();
    return myIds.contains(msg.senderId);
  }

  /// True when [readerUserId] is the chat partner (not the local user).
  bool _isPartnerReadReceipt(String? readerUserId) {
    if (readerUserId == null || readerUserId.isEmpty) return true;

    final user = ref.read(authProvider).user;
    if (user == null) return false;

    final myIds = {
      user.id,
      user.resolvedUuid,
      user.uuid,
    }.whereType<String>().where((id) => id.isNotEmpty).toSet();
    if (myIds.contains(readerUserId)) return false;

    final partnerId =
        ref.read(conversationProvider(_chatId))?.partnerUserId ??
        directChatPartnerId(
          _chatId,
          user.id,
          myUserUuid: user.resolvedUuid ?? user.id,
        );
    if (partnerId == null) return true;

    return readerUserId == partnerId ||
        readerUserId == ref.read(conversationProvider(_chatId))?.partnerClerkId;
  }

  int? _parseSocketInt(dynamic value) {
    if (value == null) return null;
    if (value is int) return value;
    if (value is double) return value.toInt();
    if (value is String) return int.tryParse(value);
    return null;
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
    final msgChatId = data['chatId'] as String? ?? data['groupId'] as String?;
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
        // Only the partner's read receipt should upgrade our outgoing ticks.
        if (!_isPartnerReadReceipt(data['userId'] as String?)) break;

        final messageIds = (data['messageIds'] as List<dynamic>?)
            ?.map((id) => id.toString())
            .toList();
        if (messageIds != null && messageIds.isNotEmpty) {
          markSeenByMessageIds(messageIds);
        }
        final lastSeenSeq = _parseSocketInt(data['lastSeenSequence']);
        if (lastSeenSeq != null) {
          markSeenUpTo(lastSeenSeq);
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
      final entity = _parseMessageJson(data);

      // 1. Content-based deduplication for real-time race conditions
      final pendingId = entity.clientMessageId != null
          ? 'pending_${entity.clientMessageId}'
          : null;
      if (pendingId != null && state.messages.containsKey(pendingId)) {
        final csn = entity.conversationSequence;
        final ssn = entity.serverSequence;
        if (csn != null && ssn != null) {
          reconcileOptimistic(
            clientMessageId: entity.clientMessageId!,
            serverMessageId: entity.id,
            conversationSequence: csn,
            serverSequence: ssn,
          );
        }
        return;
      }

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
          mediaType: finalEntity.mediaType,
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
        <String, dynamic>{'chatId': _chatId, 'messageId': finalEntity.id},
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
    // Structural fallback: a direct chat ID is always "uuid_uuid" (2 parts).
    // Group IDs are single UUIDs — they will not have exactly 2 underscore-separated parts.
    final runtimeEntry = ref.read(conversationRuntimeStoreProvider)[_chatId];
    final isGroup =
        _conversationType == ConversationType.group ||
        runtimeEntry?.conversationType == ConversationType.group ||
        _chatId.split('_').length != 2; // Structural fallback

    if (isGroup) {
      AppLogger.d(
        '[MessageStore] 🔑 Group decryption path for $_chatId | '
        'isEncrypted=${entity.isEncrypted} | '
        'iv=${entity.encryptionIv} | '
        'salt=${entity.encryptionSalt} | '
        'content=${entity.encryptedContent?.substring(0, 8)}...',
      );
      try {
        final groupSvc = ref.read(groupEncryptionServiceProvider);
        final keyAvailable = groupSvc.isKeyAvailable(_chatId);
        AppLogger.d('[MessageStore] 🔑 Group key cached: $keyAvailable');
        final plain = await groupSvc.decryptMessage(
          groupId: _chatId,
          encryptedContent: entity.encryptedContent!,
          iv: entity.encryptionIv!,
          salt: entity.encryptionSalt!,
        );
        AppLogger.d('[MessageStore] 🔑 Decryption result: "$plain"');
        if (plain != '[Encrypted message]' && plain != '[Failed to decrypt]') {
          return entity.copyWith(text: plain, isEncrypted: false);
        }
        AppLogger.w(
          '[MessageStore] Group decryption returned fallback for ${entity.id}',
        );
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
    final serverMessageId =
        data['messageId'] as String? ?? data['id'] as String?;
    final csn = _parseSocketInt(data['conversationSequence']);
    final ssn = _parseSocketInt(data['serverSequence']);

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

  ({String path, Map<String, dynamic> params})? _historyCacheKey() {
    final authUser = ref.read(authProvider).user;
    if (authUser == null) return null;

    if (_conversationType == ConversationType.group) {
      return (
        path: 'groups/$_chatId/messages',
        params: {'limit': _kHotWindowSize},
      );
    }

    final partnerId = directChatPartnerId(
      _chatId,
      authUser.id,
      myUserUuid: authUser.resolvedUuid,
    );
    if (partnerId == null) return null;

    return (
      path: 'direct-chat/messages',
      params: {'partnerId': partnerId, 'limit': _kHotWindowSize},
    );
  }

  Future<void> _persistMessageToHistoryCache(MessageEntity message) async {
    final cacheKey = _historyCacheKey();
    if (cacheKey == null) return;

    try {
      final cache = ref.read(localCacheProvider);
      final cached = cache.get(cacheKey.path, params: cacheKey.params);
      final rawEnvelope = cached?.data;
      final dynamic payload =
          rawEnvelope is Map && (rawEnvelope).containsKey('data')
          ? (rawEnvelope as Map)['data']
          : rawEnvelope;

      final existingMessages = payload is Map
          ? (payload['messages'] as List<dynamic>? ?? [])
          : <dynamic>[];

      final serialized = message.toSocket();
      final updatedMessages = <Map<String, dynamic>>[];
      var replaced = false;

      for (final item in existingMessages) {
        if (item is! Map) continue;
        final map = Map<String, dynamic>.from(item);
        final sameId = map['id'] == message.id;
        final sameClientId =
            message.clientMessageId != null &&
            (map['tempId'] == message.clientMessageId ||
                map['client_id'] == message.clientMessageId);
        if (sameId || sameClientId) {
          updatedMessages.add(serialized);
          replaced = true;
        } else {
          updatedMessages.add(map);
        }
      }

      if (!replaced) {
        updatedMessages.add(serialized);
      }

      updatedMessages.sort((a, b) {
        final aSeq = a['conversationSequence'] as int? ?? 0;
        final bSeq = b['conversationSequence'] as int? ?? 0;
        if (aSeq != 0 || bSeq != 0) return aSeq.compareTo(bSeq);
        final aAt =
            DateTime.tryParse(a['createdAt'] as String? ?? '') ??
            DateTime.fromMillisecondsSinceEpoch(0);
        final bAt =
            DateTime.tryParse(b['createdAt'] as String? ?? '') ??
            DateTime.fromMillisecondsSinceEpoch(0);
        return aAt.compareTo(bAt);
      });

      if (updatedMessages.length > _kHotWindowSize) {
        updatedMessages.removeRange(
          0,
          updatedMessages.length - _kHotWindowSize,
        );
      }

      final nextPayload = {'messages': updatedMessages};
      final nextEnvelope =
          rawEnvelope is Map && (rawEnvelope).containsKey('data')
          ? {
              ...Map<String, dynamic>.from(rawEnvelope as Map),
              'data': nextPayload,
            }
          : nextPayload;

      await cache.set(cacheKey.path, nextEnvelope, params: cacheKey.params);
      AppLogger.d(
        '[MessageStore] Persisted reconciled message ${message.id} to history cache',
      );
    } catch (e) {
      AppLogger.e(
        '[MessageStore] Failed to persist reconciled message to cache',
        error: e,
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
      ref
          .read(messagingTelemetryProvider)
          .recordGapFillRequested(
            chatId: _chatId,
            fromSequence: fromSeq,
            toSequence: toSeq,
          );

      // WS 11: Drift detection — anomalous jumps get a separate high-priority event
      ref
          .read(messagingTelemetryProvider)
          .recordSequenceDrift(
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
                    final entity = _parseMessageJson(
                      Map<String, dynamic>.from(m as Map),
                    );
                    gapMessages.add(entity);
                  } catch (e) {
                    AppLogger.e('Error parsing gap message', error: e);
                  }
                }
                applyGapFill(gapMessages);
                // WS 11: Record successful gap fill resolution
                ref
                    .read(messagingTelemetryProvider)
                    .recordGapFillResolved(
                      chatId: _chatId,
                      recoveredCount: gapMessages.length,
                      fallbackToRest: false,
                    );
              }
            } else if (status == 'GAP_TOO_LARGE') {
              AppLogger.w(
                '[MessageStore] GAP_TOO_LARGE status returned. Falling back to REST hydration.',
              );
              // WS 11: Record fallback resolution
              ref
                  .read(messagingTelemetryProvider)
                  .recordGapFillResolved(
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

    final toKeepIds = state.orderedIds.sublist(
      state.orderedIds.length - maxCount,
    );
    final updatedMessages = <String, MessageEntity>{};
    for (final id in toKeepIds) {
      if (state.messages.containsKey(id)) {
        updatedMessages[id] = state.messages[id]!;
      }
    }

    state = state.copyWith(messages: updatedMessages, orderedIds: toKeepIds);
    AppLogger.d(
      '[MessageStore:$_chatId] Trimmed memory to $maxCount messages (isActive: $_isActive)',
    );
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
