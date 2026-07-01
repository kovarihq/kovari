import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/features/chat/models/message_entity.dart';
import 'package:mobile/features/chat/providers/message_store.dart';

class ConversationRuntimeManagerState {
  ConversationRuntimeManagerState({
    required this.chatId,
    this.firstVisibleIndex = 0,
    this.lastVisibleIndex = 0,
  });

  final String chatId;
  final int firstVisibleIndex;
  final int lastVisibleIndex;

  ConversationRuntimeManagerState copyWith({
    int? firstVisibleIndex,
    int? lastVisibleIndex,
  }) {
    return ConversationRuntimeManagerState(
      chatId: chatId,
      firstVisibleIndex: firstVisibleIndex ?? this.firstVisibleIndex,
      lastVisibleIndex: lastVisibleIndex ?? this.lastVisibleIndex,
    );
  }
}

class ConversationRuntimeManager
    extends Notifier<ConversationRuntimeManagerState> {
  late final String _chatId;

  void init(String chatId) {
    _chatId = chatId;
  }

  @override
  ConversationRuntimeManagerState build() {
    return ConversationRuntimeManagerState(chatId: _chatId);
  }

  void updateViewport(
    List<MessageEntity> allMessages,
    int firstIndex,
    int lastIndex,
  ) {
    // Plaintext only: viewport updates are no-ops
  }

  void warmCache(List<MessageEntity> messages, {int count = 50}) {
    // Plaintext only: cache warming is a no-op
  }

  Future<MessageEntity?> decryptMessageDirect(
    MessageEntity entity, {
    String? partnerClerkId,
  }) async {
    return entity;
  }
}

final conversationRuntimeManagerProvider =
    NotifierProvider.family<
      ConversationRuntimeManager,
      ConversationRuntimeManagerState,
      String
    >((chatId) => ConversationRuntimeManager()..init(chatId));

/// Consolidated provider that watches messageStore state.
/// UI components watch this provider to render plaintext messages dynamically.
final decryptedMessagesProvider = Provider.family<List<MessageEntity>, String>((
  ref,
  chatId,
) {
  final msgState = ref.watch(messageStoreProvider(chatId));
  return msgState.hotMessages;
});
