import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/core/realtime/socket_service.dart';
import 'package:mobile/core/realtime/socket_state.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/features/chat/providers/chat_mutation_service.dart';
import 'package:mobile/features/chat/providers/conversation_runtime_store.dart';
import 'package:mobile/features/chat/providers/message_store.dart';
import 'package:mobile/features/chat/utils/direct_chat_id.dart';

/// Tracks which chat rooms the user is currently subscribed to.
/// On reconnect, performs a sequence audit for each active room.
class RealtimeCoordinator extends Notifier<void> {
  final Map<String, int> _activeChatLastKnownSeq = {};

  @override
  void build() {
    // Use ref.listen (not ref.watch) so socket state changes trigger our
    // lifecycle callbacks WITHOUT rebuilding (and disposing) this notifier.
    // Rebuilding would wipe _activeChatLastKnownSeq on every state transition.
    ref.listen<SocketState>(socketServiceProvider, (previous, next) {
      if (next == SocketState.connected) {
        _onConnected();
      } else if (next.isDisconnected) {
        _onDisconnected();
      }
    });

    // Check initial state in case it connected before we started listening
    final initial = ref.read(socketServiceProvider);
    if (initial == SocketState.connected) {
      // Use microtask to avoid side-effects during build
      Future.microtask(() => _onConnected());
    }

    ref.onDispose(_dispose);
  }

  // ---------------------------------------------------------------------------
  // Chat Room Lifecycle
  // ---------------------------------------------------------------------------

  /// Join a chat room. Records the last known sequence for gap detection on reconnect.
  void joinChat(String chatId, {int lastKnownSequence = 0}) {
    _activeChatLastKnownSeq[chatId] = lastKnownSequence;

    final conv = ref.read(conversationRuntimeStoreProvider)[chatId]?.metadata;
    if (conv != null) {
      ref
          .read(conversationRuntimeStoreProvider.notifier)
          .ensureFromConversation(conv);
    }

    ref.read(socketServiceProvider.notifier).emit('join_chat', {
      'chatId': chatId,
      'lastKnownSequence': lastKnownSequence,
    });

    // Flush any pending mutations for this room
    ref.read(chatMutationServiceProvider).replayPendingMessages(chatId);

    // Eagerly refresh messages to pull any missed offline packets
    ref
        .read(messageStoreProvider(chatId).notifier)
        .resync(forceRefresh: true);

    if (chatId.contains('_')) {
      _fetchPartnerLastSeen(chatId);
    }

    AppLogger.i(
      '[RealtimeCoordinator] Joined chat: $chatId (lastSeq: $lastKnownSequence)',
    );
  }

  /// Fetches partner presence via socket ack (parity with web `get_last_seen`).
  void _fetchPartnerLastSeen(String chatId) {
    final conv = ref.read(conversationRuntimeStoreProvider)[chatId]?.metadata;
    var partnerId = conv?.partnerUserId;

    if (partnerId == null) {
      final user = ref.read(authProvider).user;
      if (user == null) {
        AppLogger.w(
          '[RealtimeCoordinator] _fetchPartnerLastSeen: no auth user for $chatId',
        );
        return;
      }
      partnerId = directChatPartnerId(
        chatId,
        user.id,
        myUserUuid: user.resolvedUuid ?? user.id,
      );
    }
    if (partnerId == null) {
      AppLogger.w(
        '[RealtimeCoordinator] _fetchPartnerLastSeen: could not resolve partnerId for $chatId',
      );
      return;
    }

    ref.read(socketServiceProvider.notifier).emit(
      'get_last_seen',
      {'userId': partnerId},
      (dynamic ack) => _applyLastSeenAck(chatId, ack),
    );
  }

  void _applyLastSeenAck(String chatId, dynamic ack) {
    if (ack == null) return;

    final conv = ref.read(conversationRuntimeStoreProvider)[chatId]?.metadata;
    if (conv != null) {
      ref
          .read(conversationRuntimeStoreProvider.notifier)
          .ensureFromConversation(conv);
    }

    if (ack is String && ack.toLowerCase() == 'online') {
      ref.read(conversationRuntimeStoreProvider.notifier).setPresence(
            chatId,
            isOnline: true,
            lastActivityAt: DateTime.now(),
          );
      return;
    }

    if (ack is String) {
      final parsed = DateTime.tryParse(ack);
      ref.read(conversationRuntimeStoreProvider.notifier).setPresence(
            chatId,
            isOnline: false,
            lastSeen: parsed,
          );
    }
  }

  /// Leave a chat room. Updates the last known sequence before leaving.
  void leaveChat(String chatId) {
    // Persist the final known sequence before leaving
    final msgState = ref.read(messageStoreProvider(chatId));
    _activeChatLastKnownSeq[chatId] = msgState.highestKnownSequence;
    ref.read(socketServiceProvider.notifier).emit('leave_chat', {
      'chatId': chatId,
    });
    AppLogger.i('[RealtimeCoordinator] Left chat: $chatId');
  }

  /// Send a message. The MessageStore handles optimistic insertion separately.
  void sendMessage({
    required String chatId,
    required Map<String, dynamic> messagePayload,
    void Function(Map<String, dynamic>)? onAck,
  }) {
    ref.read(socketServiceProvider.notifier).emit(
      'send_message',
      {'chatId': chatId, 'message': messagePayload},
      (dynamic ack) {
        if (ack is Map) {
          onAck?.call(Map<String, dynamic>.from(ack));
        }
      },
    );
  }

  /// Emit compressed read receipt for a conversation.
  void markSeenUpTo(String chatId, int lastSeenSequence) {
    AppLogger.i('⚡ [RealtimeCoordinator] markSeenUpTo: $chatId, sequence: $lastSeenSequence');
    ref
        .read(conversationRuntimeStoreProvider.notifier)
        .markSeenUpTo(chatId, lastSeenSequence);
    ref.read(socketServiceProvider.notifier).emit(
      'mark_seen',
      <String, dynamic>{
        'chatId': chatId,
        'messageIds': <String>[], // Legacy field — kept for server compat
        'lastSeenSequence': lastSeenSequence,
      },
    );
  }

  void startTyping(String chatId) => ref
      .read(socketServiceProvider.notifier)
      .emit('typing_start', {'chatId': chatId});

  void stopTyping(String chatId) => ref
      .read(socketServiceProvider.notifier)
      .emit('typing_stop', {'chatId': chatId});

  // ---------------------------------------------------------------------------
  // Reconnect Resync (Sequence Audit)
  // ---------------------------------------------------------------------------

  void _onConnected() {
    AppLogger.i(
      '[RealtimeCoordinator] Socket connected. Performing sequence audit for ${_activeChatLastKnownSeq.length} active rooms.',
    );

    // Re-join all previously active rooms with their last known sequence
    // The server will emit gap_found events if it detects missing messages
    for (final entry in _activeChatLastKnownSeq.entries) {
      joinChat(entry.key, lastKnownSequence: entry.value);
    }
  }

  void _onDisconnected() {
    AppLogger.w(
      '[RealtimeCoordinator] Socket disconnected. Preserving active room sequences.',
    );
    // Sequences are preserved in _activeChatLastKnownSeq for reconnect resync
  }

  void _dispose() {
    AppLogger.d('[RealtimeCoordinator] Disposed');
  }
}

final realtimeCoordinatorProvider = NotifierProvider<RealtimeCoordinator, void>(
  RealtimeCoordinator.new,
);
