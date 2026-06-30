import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/core/realtime/socket_service.dart';
import 'package:mobile/core/services/fcm_service.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/features/chat/models/conversation_entity.dart';
import 'package:mobile/features/chat/models/message_entity.dart';
import 'package:mobile/features/chat/providers/chat_runtime_providers.dart';
import 'package:mobile/features/chat/providers/conversation_runtime_store.dart';
import 'package:mobile/features/chat/providers/conversation_runtime_manager.dart';
import 'package:mobile/shared/models/kovari_user.dart';

import 'package:mobile/core/network/sync_engine.dart';

/// Typing indicator TTL in seconds.
const _kTypingTtlSeconds = 5;

/// Manages all conversation metadata independently from message entities.
///
/// Responsibilities:
/// - Unread counts & compressed read receipts (lastSeenSequence)
/// - Typing indicators with TTL auto-expiry
/// - Presence (online/offline/lastSeen)
/// - Last message snippet for the inbox list
/// - Conversation ordering
class ConversationStore extends Notifier<Map<String, ConversationEntity>> {
  final Map<String, Timer> _typingTimers = {};

  @override
  Map<String, ConversationEntity> build() {
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

    // Subscribe to socket events that affect conversation metadata
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
  // Public API
  // ---------------------------------------------------------------------------

  /// Upsert a conversation from the inbox API response.
  void upsertConversation(ConversationEntity entity) {
    state = {...state, entity.chatId: entity};
    ref
        .read(conversationRuntimeStoreProvider.notifier)
        .ensureFromConversation(entity);
  }

  /// Fetch the latest inbox state from the server.
  Future<void> fetchInbox({bool forceRefresh = false}) async {
    AppLogger.d(
      '🛡️ [ConversationStore] 📥 Starting fetchInbox (forceRefresh: $forceRefresh)...',
    );
    // Only show loading state if we have zero conversations in memory
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
      AppLogger.e('[ConversationStore] Failed to fetch inbox', error: e);
    } finally {
      ref.read(inboxLoadingProvider.notifier).state = false;
    }
  }

  Future<void> _processInboxData(Map<String, dynamic> rawData) async {
    // Support both DM-only inbox ('messages') and unified inbox ('conversations')
    final messages =
        rawData['conversations'] as List<dynamic>? ??
        rawData['messages'] as List<dynamic>? ??
        [];
    AppLogger.d(
      '[ConversationStore] Processing inbox data: ${messages.length} conversations',
    );

    if (messages.isNotEmpty) {
      final Map<String, ConversationEntity> newConversations = {};
      final myUser = ref.read(authProvider).user;
      if (myUser == null) {
        AppLogger.w('[ConversationStore] Cannot process inbox: myUser is null');
        return;
      }

      final myUuid = myUser.resolvedUuid ?? myUser.id;

      for (final msg in messages) {
        // --- Group Conversation Detection ---
        final isGroup = msg['is_group'] as bool? ?? false;
        final groupId = msg['group_id'] as String?;

        if (isGroup && groupId != null) {
          // Group conversation entry
          if (!newConversations.containsKey(groupId)) {
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
            newConversations[groupId] = conv;
          }
          continue;
        }

        // --- Direct Conversation Entry ---
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

        if (!newConversations.containsKey(canonicalChatId)) {
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

          // 🔓 Zero-Flicker Decryption: Unlock BEFORE adding to the map
          final decrypted = await _decryptMessageEntity(lastMsgRaw, conv);
          newConversations[canonicalChatId] = conv.copyWith(
            lastMessage: decrypted ?? lastMsgRaw,
          );
        }
      }

      state = {...state, ...newConversations};

      // --- Workstream 2.5: Bootstrap ConversationRuntimeStore ---
      // Seed the runtime store so background socket events can instantly
      // update metadata without requiring manual REST re-fetches.
      ref
          .read(conversationRuntimeStoreProvider.notifier)
          .seedFromInbox(newConversations.values.toList());
    }
  }

  /// 🔓 Decrypt all last messages in the current inbox state
  Future<void> _decryptConversations() async {
    final updatedState = Map<String, ConversationEntity>.from(state);
    var changed = false;

    for (final conv in updatedState.values) {
      final lastMsg = conv.lastMessage;
      if (lastMsg == null ||
          !lastMsg.isEncrypted ||
          (lastMsg.text?.isNotEmpty ?? false))
        continue;

      final decryptedMsg = await _decryptMessageEntity(lastMsg, conv);
      if (decryptedMsg != null && decryptedMsg.text != lastMsg.text) {
        updatedState[conv.chatId] = conv.copyWith(lastMessage: decryptedMsg);
        changed = true;
      }
    }

    if (changed) {
      state = updatedState;
    }
  }

  /// 🗝️ Centralized decryption logic for inbox previews
  Future<MessageEntity?> _decryptMessageEntity(
    MessageEntity entity,
    ConversationEntity conv,
  ) async {
    // Delegate to ConversationRuntimeManager to respect the invariant limit
    final manager = ref.read(conversationRuntimeManagerProvider(conv.chatId).notifier);
    return manager.decryptMessageDirect(entity, partnerClerkId: conv.partnerClerkId);
  }

  /// Update the last message snippet when a new message arrives.
  Future<void> updateLastMessage(String chatId, MessageEntity message) async {
    final existing = state[chatId];
    if (existing == null) return;

    // Decrypt on-the-fly for real-time inbox updates
    final decrypted = await _decryptMessageEntity(message, existing);
    final finalMsg = decrypted ?? message;

    state = {
      ...state,
      chatId: existing.copyWith(
        lastMessage: finalMsg,
        lastMessageAt: finalMsg.createdAt,
      ),
    };

    // Propagate to ConversationRuntimeStore to ensure inbox UI updates instantly
    ref
        .read(conversationRuntimeStoreProvider.notifier)
        .updateLastMessage(
          chatId: chatId,
          messageId: finalMsg.id,
          snippet: finalMsg.text,
          at: finalMsg.createdAt,
          senderId: finalMsg.senderId,
          mediaType: finalMsg.mediaType,
          deliveryState: finalMsg.deliveryStatus,
        );
  }

  /// Increment unread count for a conversation not currently active.
  void incrementUnread(String chatId) {
    final existing = state[chatId];
    if (existing == null) return;
    state = {
      ...state,
      chatId: existing.copyWith(unreadCount: existing.unreadCount + 1),
    };
  }

  /// Mark a conversation as read via compressed lastSeenSequence.
  /// This single call implicitly marks all CSN ≤ [sequence] as seen.
  void markSeenUpTo(String chatId, int sequence) {
    final existing = state[chatId];
    if (existing == null) return;
    final currentSeq = existing.lastSeenSequence ?? -1;
    if (sequence <= currentSeq) return; // Already seen
    state = {
      ...state,
      chatId: existing.copyWith(unreadCount: 0, lastSeenSequence: sequence),
    };

    // Propagate to ConversationRuntimeStore to reset unread count and set watermark
    ref
        .read(conversationRuntimeStoreProvider.notifier)
        .markSeenUpTo(chatId, sequence);
  }

  // ---------------------------------------------------------------------------
  // Typing Indicators (TTL-based)
  // ---------------------------------------------------------------------------

  void _setTyping(String chatId, String userId) {
    final existing = state[chatId];
    if (existing == null) return;

    final updatedTyping = {...existing.typingUserIds, userId};
    state = {...state, chatId: existing.copyWith(typingUserIds: updatedTyping)};

    // Cancel existing timer for this user, then restart TTL
    _typingTimers['$chatId:$userId']?.cancel();
    _typingTimers['$chatId:$userId'] = Timer(
      const Duration(seconds: _kTypingTtlSeconds),
      () => _clearTyping(chatId, userId),
    );
  }

  void _clearTyping(String chatId, String userId) {
    final existing = state[chatId];
    if (existing == null) return;
    final updatedTyping = {...existing.typingUserIds}..remove(userId);
    state = {...state, chatId: existing.copyWith(typingUserIds: updatedTyping)};
    _typingTimers.remove('$chatId:$userId');
  }

  // ---------------------------------------------------------------------------
  // Presence
  // ---------------------------------------------------------------------------

  void setPartnerOnline(
    String chatId, {
    required bool isOnline,
    DateTime? lastSeen,
  }) {
    final existing = state[chatId];
    if (existing == null) {
      AppLogger.w(
        '[ConversationStore] setPartnerOnline skipped: no entry for $chatId',
      );
      return;
    }
    state = {
      ...state,
      chatId: existing.copyWith(
        isPartnerOnline: isOnline,
        partnerLastSeen: lastSeen ?? existing.partnerLastSeen,
      ),
    };
  }

  // ---------------------------------------------------------------------------
  // Socket Event Handler
  // ---------------------------------------------------------------------------

  void _handleSocketEvent(SocketEvent event) {
    final data = event.data as Map<String, dynamic>?;
    if (data == null) return;

    final chatId = data['chatId'] as String?;
    if (chatId == null) return;

    switch (event.type) {
      case 'user_typing':
        final userId = data['userId'] as String?;
        if (userId != null) _setTyping(chatId, userId);
      case 'user_stopped_typing':
        final userId = data['userId'] as String?;
        if (userId != null) _clearTyping(chatId, userId);
      case 'user_online':
        setPartnerOnline(chatId, isOnline: true);
      case 'user_offline':
        final lastSeenStr = data['lastSeen'] as String?;
        setPartnerOnline(
          chatId,
          isOnline: false,
          lastSeen: lastSeenStr != null ? DateTime.tryParse(lastSeenStr) : null,
        );
      case 'new_notification':
        final currentChatId = ref.read(activeConversationProvider);
        AppLogger.d(
          '[ConversationStore] Received new_notification. ActiveChatId: $currentChatId, TargetChatId: $chatId',
        );
        if (currentChatId != chatId) {
          incrementUnread(chatId);
          final conv = state[chatId];
          if (conv == null) {
            fetchInbox(forceRefresh: true);
          }
          final senderName =
              conv?.displayName ?? (data['title'] as String?) ?? 'New Message';
          final bodyMessage =
              data['message'] as String? ?? 'Open Kovari to view message';
          AppLogger.i(
            '[ConversationStore] Triggering local notification: "$senderName" - "$bodyMessage"',
          );
          FCMService.instance.showLocalNotification(
            title: senderName,
            body: bodyMessage,
            data: {'entity_type': 'chat', 'entity_id': chatId},
          );
        }
      case 'receive_message':
        final msgData = data['message'] ?? data;
        if (msgData is Map<String, dynamic>) {
          final message = MessageEntity.fromSocket(msgData, chatId);
          updateLastMessage(chatId, message);
        }
      default:
        break;
    }

    AppLogger.d('[ConversationStore] Handled event: ${event.type} for $chatId');
  }
}

final conversationStoreProvider =
    NotifierProvider<ConversationStore, Map<String, ConversationEntity>>(
      ConversationStore.new,
    );

/// Tracks whether the inbox is currently fetching data.
final inboxLoadingProvider = StateProvider<bool>((ref) => false);

/// Convenience: watch a single conversation by chatId.
final conversationProvider = Provider.family<ConversationEntity?, String>(
  (ref, chatId) => ref.watch(conversationStoreProvider)[chatId],
);
