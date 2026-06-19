import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/realtime/socket_service.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/features/chat/models/conversation_entity.dart';
import 'package:mobile/features/chat/models/message_entity.dart';

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
        lastMessageMediaType: lastMessageMediaType ?? this.lastMessageMediaType,
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
    if (existing == null) return;
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

      // --- Read Receipts ---
      case 'messages_seen':
        final lastSeenSeq = data['lastSeenSequence'] as int?;
        if (lastSeenSeq != null) markSeenUpTo(chatId, lastSeenSeq);

      // --- Delivery Receipts ---
      case 'message_delivered_ack':
        final csn = data['conversationSequence'] as int?;
        if (csn != null) updateDeliveredWatermark(chatId, csn);

      // --- Incoming Message (update snippet + server sequence) ---
      case 'receive_message':
      case 'message_persisted':
        final msgData =
            (data['message'] as Map<String, dynamic>?) ?? data;
        final snippet =
            msgData['text'] as String? ?? msgData['encrypted_content'] as String?;
        final senderId =
            msgData['senderId'] as String? ?? msgData['sender_id'] as String?;
        final msgId = msgData['id'] as String?;
        final mediaType =
            msgData['mediaType'] as String? ?? msgData['media_type'] as String?;
        final csn =
            msgData['conversationSequence'] as int? ??
            msgData['conversation_sequence'] as int?;

        if (msgId != null && senderId != null) {
          updateLastMessage(
            chatId: chatId,
            messageId: msgId,
            snippet: snippet,
            at: DateTime.now(),
            senderId: senderId,
            mediaType: mediaType,
          );
        }
        if (csn != null) {
          updateServerSequence(chatId, csn);
          updateDeliveredWatermark(chatId, csn);
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
