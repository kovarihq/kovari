import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:mobile/core/realtime/socket_service.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/core/services/fcm_service.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/features/chat/providers/chat_runtime_providers.dart';
import 'package:mobile/features/chat/models/conversation_entity.dart';
import 'package:mobile/features/chat/models/message_entity.dart';
import 'package:mobile/core/network/sync_engine.dart';
import 'package:mobile/shared/models/kovari_user.dart';

// ---------------------------------------------------------------------------
// ConversationType
// ---------------------------------------------------------------------------

/// Describes the type of a conversation. Critical for routing hydration
/// paths in MessageStore and mutation payloads in ChatMutationService.
enum ConversationType {
  direct,
  group,
}

// ---------------------------------------------------------------------------
// ConversationRuntimeState
// ---------------------------------------------------------------------------

/// Authoritative per-conversation runtime state.
///
/// Isolation Rule (STRICT):
/// - This class holds ONLY metadata, control-plane signals, watermarks, and
///   counters. It NEVER holds lists or maps of [MessageEntity] instances.
///   Message entities are exclusively owned by [MessageStore].
///
/// Architecture pattern: mirrors Messenger/Discord/Slack conversation runtime.
class ConversationRuntimeState {
  const ConversationRuntimeState({
    required this.chatId,
    required this.conversationType,
    this.metadata,

    // --- Unread & Watermarks ---
    this.unreadCount = 0,
    this.lastReadSequence,
    this.lastDeliveredSequence,
    this.lastKnownServerSequence,

    // --- Last Message Snippet (for Inbox UI only) ---
    this.lastMessageId,
    this.lastMessageSnippet,
    this.lastMessageAt,
    this.lastMessageSenderId,
    this.lastMessageMediaType,

    // --- Delivery State (sender-side) ---
    this.deliveryState = MessageDeliveryStatus.pending,

    // --- Presence ---
    this.isPartnerOnline = false,
    this.partnerLastSeen,
    this.partnerLastActivityAt,

    // --- Typing (TTL-managed by ConversationRuntimeStore) ---
    this.typingUserIds = const {},

    // --- Misc ---
    this.isMuted = false,
    this.isPinned = false,
    this.isArchived = false,
    this.draft,

    // --- Membership versioning (for Integrity Guard) ---
    this.conversationMembershipVersion = 0,
  });

  final String chatId;
  final ConversationType conversationType;

  /// Full conversation metadata (display name, avatar, participant list, etc.)
  /// Populated from the inbox REST response or Conversation Bootstrap.
  final ConversationEntity? metadata;

  // --- Unread & Watermarks ---
  final int unreadCount;

  /// The highest conversation sequence the user has explicitly read (Mark Seen).
  final int? lastReadSequence;

  /// The highest sequence delivered to this device. Drives the double-tick.
  final int? lastDeliveredSequence;

  /// The last sequence number known from the server. Used for gap detection.
  final int? lastKnownServerSequence;

  // --- Last Message Snippet ---
  final String? lastMessageId;
  final String? lastMessageSnippet;
  final DateTime? lastMessageAt;
  final String? lastMessageSenderId;
  final String? lastMessageMediaType;

  // --- Delivery State (sender perspective, last outgoing message) ---
  final MessageDeliveryStatus deliveryState;

  // --- Presence ---
  final bool isPartnerOnline;
  final DateTime? partnerLastSeen;
  final DateTime? partnerLastActivityAt;

  // --- Typing ---
  final Set<String> typingUserIds;

  // --- Misc ---
  final bool isMuted;
  final bool isPinned;
  final bool isArchived;
  final String? draft;

  // --- Membership Versioning ---
  final int conversationMembershipVersion;

  ConversationRuntimeState copyWith({
    ConversationEntity? metadata,
    int? unreadCount,
    int? lastReadSequence,
    int? lastDeliveredSequence,
    int? lastKnownServerSequence,
    String? lastMessageId,
    String? lastMessageSnippet,
    DateTime? lastMessageAt,
    String? lastMessageSenderId,
    String? lastMessageMediaType,
    bool replaceLastMessageMediaType = false,
    MessageDeliveryStatus? deliveryState,
    bool? isPartnerOnline,
    DateTime? partnerLastSeen,
    DateTime? partnerLastActivityAt,
    Set<String>? typingUserIds,
    bool? isMuted,
    bool? isPinned,
    bool? isArchived,
    String? draft,
    int? conversationMembershipVersion,
  }) =>
      ConversationRuntimeState(
        chatId: chatId,
        conversationType: conversationType,
        metadata: metadata ?? this.metadata,
        unreadCount: unreadCount ?? this.unreadCount,
        lastReadSequence: lastReadSequence ?? this.lastReadSequence,
        lastDeliveredSequence:
            lastDeliveredSequence ?? this.lastDeliveredSequence,
        lastKnownServerSequence:
            lastKnownServerSequence ?? this.lastKnownServerSequence,
        lastMessageId: lastMessageId ?? this.lastMessageId,
        lastMessageSnippet: lastMessageSnippet ?? this.lastMessageSnippet,
        lastMessageAt: lastMessageAt ?? this.lastMessageAt,
        lastMessageSenderId: lastMessageSenderId ?? this.lastMessageSenderId,
        lastMessageMediaType: replaceLastMessageMediaType
            ? lastMessageMediaType
            : (lastMessageMediaType ?? this.lastMessageMediaType),
        deliveryState: deliveryState ?? this.deliveryState,
        isPartnerOnline: isPartnerOnline ?? this.isPartnerOnline,
        partnerLastSeen: partnerLastSeen ?? this.partnerLastSeen,
        partnerLastActivityAt:
            partnerLastActivityAt ?? this.partnerLastActivityAt,
        typingUserIds: typingUserIds ?? this.typingUserIds,
        isMuted: isMuted ?? this.isMuted,
        isPinned: isPinned ?? this.isPinned,
        isArchived: isArchived ?? this.isArchived,
        draft: draft ?? this.draft,
        conversationMembershipVersion:
            conversationMembershipVersion ?? this.conversationMembershipVersion,
      );
}

// ---------------------------------------------------------------------------
// ConversationRuntimeStore
// ---------------------------------------------------------------------------

/// Runtime source-of-truth for ALL conversation metadata across the app.
///
/// Responsibilities:
/// - Holds [ConversationRuntimeState] for every known conversation.
/// - Reacts to socket events to update presence, typing, watermarks, and
///   last-message snippets independently from [MessageStore].
/// - [MessageStore] is ONLY for message entity payloads.
///   [ConversationRuntimeStore] is for everything else.
///
/// Typing TTL: Each typing event creates a [Timer] that auto-clears the
/// typing indicator after [_kTypingTtlSeconds] with no new event.
class ConversationRuntimeStore
    extends Notifier<Map<String, ConversationRuntimeState>> {
  static const _kTypingTtlSeconds = 5;
  final Map<String, Timer> _typingTimers = {};

  @override
  Map<String, ConversationRuntimeState> build() {
    // Listen to user changes. If user transitions to non-null and has a resolved UUID, fetch inbox
    ref.listen<KovariUser?>(authProvider.select((s) => s.user), (
      previous,
      next,
    ) {
      if (next != null && next.resolvedUuid != null) {
        Future.microtask(() => fetchInbox());
      }
    });

    // If user is already loaded and has resolved UUID, fetch inbox eagerly
    final myUser = ref.read(authProvider).user;
    if (myUser != null && myUser.resolvedUuid != null) {
      Future.microtask(() => fetchInbox());
    }

    final events = ref.watch(socketServiceProvider.notifier).events;
    final sub = events.listen(_handleSocketEvent);
    ref.onDispose(() {
      sub.cancel();
      for (final t in _typingTimers.values) {
        t.cancel();
      }
    });
    return {};
  }

  // ---------------------------------------------------------------------------
  // Bootstrap API
  // ---------------------------------------------------------------------------

  /// Seed the runtime from a [ConversationEntity] list (inbox REST response
  /// or local cache). Called during Workstream 2.5 — Conversation Bootstrap.
  ///
  Future<void> fetchInbox({bool forceRefresh = false}) async {
    AppLogger.d(
      '🛡️ [ConversationRuntimeStore] 📥 Starting fetchInbox (forceRefresh: $forceRefresh)...',
    );
    if (state.isEmpty) {
      ref.read(inboxLoadingProvider.notifier).state = true;
    }
    try {
      final syncEngine = ref.read(syncEngineProvider);
      final rawData = await syncEngine.swrFetch<Map<String, dynamic>>(
        path: 'direct-chat/inbox',
        parser: (data) => data as Map<String, dynamic>,
        ignoreCache: forceRefresh,
        onUpdate: (updatedData) {
          _processInboxData(updatedData);
        },
      );

      if (rawData != null) {
        await _processInboxData(rawData);
      }
    } catch (e) {
      AppLogger.e('[ConversationRuntimeStore] Failed to fetch inbox', error: e);
    } finally {
      ref.read(inboxLoadingProvider.notifier).state = false;
    }
  }

  Future<void> _processInboxData(Map<String, dynamic> rawData) async {
    final messages =
        rawData['conversations'] as List<dynamic>? ??
        rawData['messages'] as List<dynamic>? ??
        [];
    AppLogger.d(
      '[ConversationRuntimeStore] Processing inbox data: ${messages.length} conversations',
    );

    if (messages.isNotEmpty) {
      final List<ConversationEntity> newConversations = [];
      final myUser = ref.read(authProvider).user;
      if (myUser == null) {
        AppLogger.w('[ConversationRuntimeStore] Cannot process inbox: myUser is null');
        return;
      }

      final myUuid = myUser.resolvedUuid ?? myUser.id;

      for (final msg in messages) {
        final isGroup = msg['is_group'] as bool? ?? false;
        final groupId = msg['group_id'] as String?;

        if (isGroup && groupId != null) {
          final lastMsgRaw = MessageEntity.fromSocket(
            msg as Map<String, dynamic>,
            groupId,
          );
          final conv = ConversationEntity(
            chatId: groupId,
            participantIds: const [],
            isGroup: true,
            groupName: msg['group_name'] as String? ?? 'Group',
            groupAvatar: msg['group_avatar'] as String?,
            lastMessageAt: lastMsgRaw.createdAt,
            lastMessage: lastMsgRaw,
          );
          newConversations.add(conv);
          continue;
        }

        final senderId = msg['sender_id'] as String? ?? '';
        final receiverId = msg['receiver_id'] as String? ?? '';
        final serverChatId = msg['chat_id'] as String?;

        final partnerId =
            msg['partner_id'] as String? ??
            (senderId == myUuid ? receiverId : senderId);

        final partnerClerkId = (senderId == myUuid)
            ? msg['receiver_clerk_id'] as String?
            : msg['sender_clerk_id'] as String?;

        final canonicalChatId =
            serverChatId ??
            (() {
              final sortedIds = [myUuid, partnerId]..sort();
              return '${sortedIds[0]}_${sortedIds[1]}';
            })();

        final lastMsgRaw = MessageEntity.fromSocket(
          msg as Map<String, dynamic>,
          canonicalChatId,
        );

        final conv = ConversationEntity(
          chatId: canonicalChatId,
          participantIds: [senderId, receiverId],
          partnerUserId: partnerId,
          partnerClerkId: partnerClerkId,
          partnerName: msg['partner_name'] as String? ?? 'User',
          partnerAvatar: msg['partner_avatar'] as String?,
          lastMessageAt: lastMsgRaw.createdAt,
          lastMessage: lastMsgRaw,
        );

        newConversations.add(conv);
      }

      seedFromInbox(newConversations);
    }
  }

  /// This is ADDITIVE: existing runtime state is preserved; only missing
  /// conversations are inserted. Use [updateMetadata] for individual updates.
  void seedFromInbox(List<ConversationEntity> conversations) {
    final updated = Map<String, ConversationRuntimeState>.from(state);
    for (final conv in conversations) {
      if (!updated.containsKey(conv.chatId)) {
        updated[conv.chatId] = ConversationRuntimeState(
          chatId: conv.chatId,
          conversationType:
              conv.isGroup ? ConversationType.group : ConversationType.direct,
          metadata: conv,
          unreadCount: conv.unreadCount,
          lastMessageAt: conv.lastMessageAt,
          lastMessageSnippet: conv.lastMessage?.text,
          lastMessageSenderId: conv.lastMessage?.senderId,
          lastMessageId: conv.lastMessage?.id,
          lastMessageMediaType: conv.lastMessage?.mediaType,
          isPartnerOnline: conv.isPartnerOnline,
          partnerLastSeen: conv.partnerLastSeen,
        );
      } else {
        // Update metadata reference but preserve live runtime state
        final existing = updated[conv.chatId]!;
        updated[conv.chatId] = existing.copyWith(metadata: conv);
      }
    }
    state = updated;
    AppLogger.d(
      '[ConversationRuntimeStore] Seeded ${conversations.length} conversations',
    );
  }

  /// Upsert a single conversation runtime entry. Creates if absent.
  void upsert(ConversationRuntimeState runtimeState) {
    state = {...state, runtimeState.chatId: runtimeState};
  }

  /// Ensures a runtime entry exists for [conv] without clobbering live state.
  void ensureFromConversation(ConversationEntity conv) {
    if (state.containsKey(conv.chatId)) return;
    upsert(
      ConversationRuntimeState(
        chatId: conv.chatId,
        conversationType:
            conv.isGroup ? ConversationType.group : ConversationType.direct,
        metadata: conv,
        unreadCount: conv.unreadCount,
        lastMessageAt: conv.lastMessageAt,
        lastMessageSnippet: conv.lastMessage?.text,
        lastMessageSenderId: conv.lastMessage?.senderId,
        lastMessageId: conv.lastMessage?.id,
        lastMessageMediaType: conv.lastMessage?.mediaType,
        isPartnerOnline: conv.isPartnerOnline,
        partnerLastSeen: conv.partnerLastSeen,
      ),
    );
  }

  /// Update just the metadata reference for an existing runtime entry.
  void updateMetadata(String chatId, ConversationEntity metadata) {
    final existing = state[chatId];
    if (existing == null) {
      upsert(
        ConversationRuntimeState(
          chatId: chatId,
          conversationType:
              metadata.isGroup ? ConversationType.group : ConversationType.direct,
          metadata: metadata,
        ),
      );
    } else {
      state = {...state, chatId: existing.copyWith(metadata: metadata)};
    }
  }

  // ---------------------------------------------------------------------------
  // Last-Message Snippet (Inbox UI only)
  // ---------------------------------------------------------------------------

  /// Update the last-message snippet for the inbox tile. Call this from
  /// [MessageStore] after every new received/sent message.
  void updateLastMessage({
    required String chatId,
    required String messageId,
    required String? snippet,
    required DateTime at,
    required String senderId,
    String? mediaType,
    MessageDeliveryStatus? deliveryState,
  }) {
    final existing = state[chatId];
    if (existing == null) return;
    state = {
      ...state,
      chatId: existing.copyWith(
        lastMessageId: messageId,
        lastMessageSnippet: snippet,
        lastMessageAt: at,
        lastMessageSenderId: senderId,
        lastMessageMediaType: mediaType,
        replaceLastMessageMediaType: true,
        deliveryState: deliveryState,
      ),
    };
  }

  // ---------------------------------------------------------------------------
  // Unread & Watermarks
  // ---------------------------------------------------------------------------

  void incrementUnread(String chatId) {
    final existing = state[chatId];
    if (existing == null) return;
    state = {
      ...state,
      chatId: existing.copyWith(unreadCount: existing.unreadCount + 1),
    };
  }

  /// Mark conversation as read up to [sequence]. Also resets unread count.
  void markSeenUpTo(String chatId, int sequence) {
    final existing = state[chatId];
    if (existing == null) return;
    final currentSeq = existing.lastReadSequence ?? -1;
    if (sequence <= currentSeq) return;
    state = {
      ...state,
      chatId: existing.copyWith(
        unreadCount: 0,
        lastReadSequence: sequence,
      ),
    };
  }

  /// Update [lastDeliveredSequence] for multi-device watermark sync.
  void updateDeliveredWatermark(String chatId, int sequence) {
    final existing = state[chatId];
    if (existing == null) return;
    final current = existing.lastDeliveredSequence ?? -1;
    if (sequence <= current) return;
    state = {
      ...state,
      chatId: existing.copyWith(lastDeliveredSequence: sequence),
    };
  }

  /// Update [lastKnownServerSequence] for gap detection cross-referencing.
  void updateServerSequence(String chatId, int sequence) {
    final existing = state[chatId];
    if (existing == null) return;
    final current = existing.lastKnownServerSequence ?? -1;
    if (sequence <= current) return;
    state = {
      ...state,
      chatId: existing.copyWith(lastKnownServerSequence: sequence),
    };
  }

  // ---------------------------------------------------------------------------
  // Presence
  // ---------------------------------------------------------------------------

  void setPresence(
    String chatId, {
    required bool isOnline,
    DateTime? lastSeen,
    DateTime? lastActivityAt,
  }) {
    final existing = state[chatId];
    if (existing == null) {
      AppLogger.w(
        '[ConversationRuntimeStore] setPresence skipped: no entry for $chatId',
      );
      return;
    }
    state = {
      ...state,
      chatId: existing.copyWith(
        isPartnerOnline: isOnline,
        partnerLastSeen: lastSeen ?? existing.partnerLastSeen,
        partnerLastActivityAt:
            lastActivityAt ?? existing.partnerLastActivityAt,
      ),
    };
  }

  // ---------------------------------------------------------------------------
  // Typing Indicators (TTL-based)
  // ---------------------------------------------------------------------------

  void _setTyping(String chatId, String userId) {
    final existing = state[chatId];
    if (existing == null) return;

    final updated = {...existing.typingUserIds, userId};
    state = {...state, chatId: existing.copyWith(typingUserIds: updated)};

    _typingTimers['$chatId:$userId']?.cancel();
    _typingTimers['$chatId:$userId'] = Timer(
      const Duration(seconds: _kTypingTtlSeconds),
      () => _clearTyping(chatId, userId),
    );
  }

  void _clearTyping(String chatId, String userId) {
    final existing = state[chatId];
    if (existing == null) return;
    final updated = {...existing.typingUserIds}..remove(userId);
    state = {...state, chatId: existing.copyWith(typingUserIds: updated)};
    _typingTimers.remove('$chatId:$userId');
  }

  // ---------------------------------------------------------------------------
  // Socket Event Handler
  // ---------------------------------------------------------------------------

  void _handleSocketEvent(SocketEvent event) {
    final data = event.data as Map<String, dynamic>?;
    if (data == null) return;

    // Determine chatId from payload — supports both direct (chatId) and
    // group (groupId) events by normalising to a single chatId key.
    final chatId =
        data['chatId'] as String? ?? data['groupId'] as String?;
    if (chatId == null) return;

    switch (event.type) {
      // --- Typing ---
      case 'user_typing':
        final userId = data['userId'] as String?;
        if (userId != null) _setTyping(chatId, userId);

      case 'user_stopped_typing':
        final userId = data['userId'] as String?;
        if (userId != null) _clearTyping(chatId, userId);

      // --- Presence ---
      case 'user_online':
        setPresence(
          chatId,
          isOnline: true,
          lastActivityAt: DateTime.now(),
        );

      case 'user_offline':
        final lastSeenStr = data['lastSeen'] as String?;
        setPresence(
          chatId,
          isOnline: false,
          lastSeen:
              lastSeenStr != null ? DateTime.tryParse(lastSeenStr) : null,
        );

      // --- Read Receipts (outgoing delivery ticks handled in MessageStore) ---

      case 'new_notification':
        final currentChatId = ref.read(activeConversationProvider);
        AppLogger.d(
          '[ConversationRuntimeStore] Received new_notification. ActiveChatId: $currentChatId, TargetChatId: $chatId',
        );
        if (currentChatId != chatId) {
          incrementUnread(chatId);
          final existing = state[chatId];
          if (existing == null) {
            fetchInbox(forceRefresh: true);
          }
          final senderName =
              existing?.metadata?.displayName ?? (data['title'] as String?) ?? 'New Message';
          final bodyMessage =
              data['message'] as String? ?? 'Open Kovari to view message';
          AppLogger.i(
            '[ConversationRuntimeStore] Triggering local notification: "$senderName" - "$bodyMessage"',
          );
          FCMService.instance.showLocalNotification(
            title: senderName,
            body: bodyMessage,
            data: {'entity_type': 'chat', 'entity_id': chatId},
          );
        }

      // --- Delivery Receipts ---
      case 'message_delivered_ack':
        final csn = data['conversationSequence'] as int?;
        if (csn != null) updateDeliveredWatermark(chatId, csn);

      // --- Incoming Message (update sequence, watermarks & last message) ---
      case 'receive_message':
      case 'message_persisted':
        final msgData =
            (data['message'] as Map<String, dynamic>?) ?? data;
        final csn =
            msgData['conversationSequence'] as int? ??
            msgData['conversation_sequence'] as int?;

        if (csn != null) {
          updateServerSequence(chatId, csn);
          updateDeliveredWatermark(chatId, csn);
        }

        // Direct snippet update from incoming socket
        if (msgData is Map<String, dynamic>) {
          final message = MessageEntity.fromSocket(msgData, chatId);
          updateLastMessage(
            chatId: chatId,
            messageId: message.id,
            snippet: message.text,
            at: message.createdAt,
            senderId: message.senderId,
            mediaType: message.mediaType,
            deliveryState: message.deliveryStatus,
          );
        }

      default:
        break;
    }

    AppLogger.d(
      '[ConversationRuntimeStore] Handled: ${event.type} for $chatId',
    );
  }
}

final conversationRuntimeStoreProvider = NotifierProvider<
    ConversationRuntimeStore, Map<String, ConversationRuntimeState>>(
  ConversationRuntimeStore.new,
);

/// Convenience provider: watch a single conversation's runtime state.
final conversationRuntimeProvider =
    Provider.family<ConversationRuntimeState?, String>(
  (ref, chatId) => ref.watch(conversationRuntimeStoreProvider)[chatId],
);

/// Tracks whether the inbox is currently fetching data.
final inboxLoadingProvider = StateProvider<bool>((ref) => false);
