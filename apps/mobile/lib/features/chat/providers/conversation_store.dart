import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/core/realtime/socket_service.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/core/security/encryption_service.dart';
import 'package:mobile/features/chat/models/conversation_entity.dart';
import 'package:mobile/features/chat/models/message_entity.dart';
import 'package:mobile/features/chat/providers/conversation_runtime_store.dart';

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
  }

  /// Fetch the latest inbox state from the server.
  Future<void> fetchInbox({bool forceRefresh = false}) async {
    print(
      '🛡️ [ConversationStore] 📥 Starting fetchInbox (forceRefresh: $forceRefresh)...',
    );
    ref.read(inboxLoadingProvider.notifier).state = true;
    try {
      final apiClient = ref.read(apiClientProvider);
      final response = await apiClient.get<Map<String, dynamic>>(
        'direct-chat/inbox',
        parser: (data) => data as Map<String, dynamic>,
        ignoreCache: forceRefresh,
      );

      final rawData = response.data ?? {};
      // Support both DM-only inbox ('messages') and unified inbox ('conversations')
      final messages =
          rawData['conversations'] as List<dynamic>? ??
          rawData['messages'] as List<dynamic>? ??
          [];
      AppLogger.d('[ConversationStore] Fetched inbox: ${messages.length} conversations');

      if (messages.isNotEmpty) {
        final Map<String, ConversationEntity> newConversations = {};
        final myUser = ref.read(authProvider).user;
        if (myUser == null) {
          AppLogger.w('[ConversationStore] Cannot process inbox: myUser is null');
          return;
        }

        final myUuid = myUser.uuid ?? myUser.id;

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
    } catch (e) {
      AppLogger.e('[ConversationStore] Failed to fetch inbox', error: e);
    } finally {
      ref.read(inboxLoadingProvider.notifier).state = false;
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
    // 💎 Instagram-Pro: If we already have the clear text (e.g. optimistic send), return it!
    if (entity.text?.isNotEmpty ?? false) return entity;

    if (!entity.isEncrypted ||
        entity.encryptedContent == null ||
        entity.encryptionIv == null ||
        entity.encryptionSalt == null)
      return null;

    final myUser = ref.read(authProvider).user;
    if (myUser == null) return null;

    try {
      // Primary Strategy: UUID:UUID for cross-platform parity with Web
      // Since direct chatIds are already sorted(UUID1_UUID2), we just replace '_' with ':'
      final sharedSecret = conv.chatId.replaceAll('_', ':');

      final decrypted = await EncryptionService().decryptMessage(
        encryptedContent: entity.encryptedContent!,
        iv: entity.encryptionIv!,
        salt: entity.encryptionSalt!,
        key: sharedSecret,
      );

      if (decrypted != '[Failed to decrypt]') {
        return entity.copyWith(text: decrypted);
      }

      // Fallback Strategy: Try Clerk IDs if UUID decryption fails (for legacy messages)
      final myClerkId = myUser.id;
      final partnerClerkId = conv.partnerClerkId;
      if (partnerClerkId != null) {
        final ids = [myClerkId, partnerClerkId]..sort();
        final legacySecret = '${ids[0]}:${ids[1]}';
        if (legacySecret != sharedSecret) {
          AppLogger.d(
            '🛡️ [ConversationStore] Attempting legacy fallback decryption...',
          );
          final fallbackResult = await EncryptionService().decryptMessage(
            encryptedContent: entity.encryptedContent!,
            iv: entity.encryptionIv!,
            salt: entity.encryptionSalt!,
            key: legacySecret,
          );
          if (fallbackResult != '[Failed to decrypt]') {
            return entity.copyWith(text: fallbackResult);
          }
        }
      }
    } catch (e) {
      AppLogger.e(
        '🔓 [ConversationStore] Decryption pipeline failed',
        error: e,
      );
    }
    return null;
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
    if (existing == null) return;
    state = {
      ...state,
      chatId: existing.copyWith(
        isPartnerOnline: isOnline,
        partnerLastSeen: lastSeen,
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
      case 'receive_message':
      case 'message_persisted':
        final msgData = data['message'] ?? data;
        if (msgData is Map<String, dynamic>) {
          final message = MessageEntity.fromSocket(msgData, chatId);
          updateLastMessage(chatId, message);
        }
      case 'messages_seen':
        final lastSeenSeq = data['lastSeenSequence'] as int?;
        if (lastSeenSeq != null) markSeenUpTo(chatId, lastSeenSeq);
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
