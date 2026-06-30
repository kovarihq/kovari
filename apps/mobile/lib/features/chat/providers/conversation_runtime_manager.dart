import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/security/decryption_worker.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/features/chat/models/message_entity.dart';
import 'package:mobile/features/chat/services/message_hydrator.dart';
import 'package:mobile/features/chat/providers/decryption_cache.dart';
import 'package:mobile/features/chat/providers/message_store.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/core/security/encryption_service.dart';
import 'package:mobile/core/security/group_encryption_service.dart';

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

  // Guards against calling warmCache on every rebuild.
  bool _initialWarmDone = false;

  // Debounce timer for viewport update to avoid firing once per list item
  Timer? _viewportDebounce;
  int _pendingFirstIndex = 0;
  int _pendingLastIndex = 0;
  List<MessageEntity> _pendingAllMessages = [];

  void init(String chatId) {
    _chatId = chatId;
  }

  @override
  ConversationRuntimeManagerState build() {
    ref.onDispose(() {
      _viewportDebounce?.cancel();
    });

    return ConversationRuntimeManagerState(chatId: _chatId);
  }

  void _handleMessageStoreUpdate(
    ConversationMessageState? previous,
    ConversationMessageState next,
  ) {
    if (previous == null) return;

    // Find genuinely new messages added to the store (e.g. from real-time socket)
    final prevIds = previous.messages.keys.toSet();
    final newMessages = next.messages.values
        .where((m) => !prevIds.contains(m.id))
        .toList();

    if (newMessages.isEmpty) return;

    // Filter out messages already in the decryption cache — no need to re-queue
    final cache = ref.read(messageRuntimeCacheProvider.notifier);
    final trulyNew = newMessages.where((m) {
      final decision = MessageHydrator.resolve(
        messageContent: m.messageContent,
        migrationVersion: m.migrationVersion,
        encryptedContent: m.encryptedContent,
        isEncrypted: m.isEncrypted,
        iv: m.encryptionIv,
        salt: m.encryptionSalt,
      );
      if (decision.action != HydrationAction.decrypt) {
        if (decision.action == HydrationAction.usePlaintext &&
            decision.messageContent != null) {
          cache.insert(
            _chatId,
            m.id,
            decision.messageContent!,
            m.conversationSequence ?? 0,
          );
        }
        return false;
      }
      return cache.lookup(_chatId, m.id) == null;
    }).toList();

    if (trulyNew.isNotEmpty) {
      AppLogger.d(
        '🔓 [RuntimeManager:$_chatId] ${trulyNew.length} new encrypted message(s) → queue decrypt',
      );
      _queueDecryptionForEntities(trulyNew);
    }
  }

  /// Triggers lazy decryption of messages currently in or near the viewport.
  /// Debounced so the ListView itemBuilder calling this per-item doesn't flood
  /// the queue — only the final combined range fires after one frame.
  void updateViewport(
    List<MessageEntity> allMessages,
    int firstIndex,
    int lastIndex,
  ) {
    if (allMessages.isEmpty) return;

    // Accumulate the widest range seen within this frame
    _pendingAllMessages = allMessages;
    if (firstIndex < _pendingFirstIndex) _pendingFirstIndex = firstIndex;
    if (lastIndex > _pendingLastIndex) _pendingLastIndex = lastIndex;

    _viewportDebounce?.cancel();
    _viewportDebounce = Timer(Duration.zero, () {
      final start = (_pendingFirstIndex - 50).clamp(
        0,
        _pendingAllMessages.length - 1,
      );
      final end = (_pendingLastIndex + 50).clamp(
        0,
        _pendingAllMessages.length - 1,
      );

      final viewportSlice = _pendingAllMessages.sublist(start, end + 1);
      _queueDecryptionForEntities(viewportSlice);

      // Reset accumulators
      _pendingFirstIndex = 0;
      _pendingLastIndex = 0;
    });
  }

  void _queueDecryptionForEntities(List<MessageEntity> entities) {
    final myUserId = ref.read(authProvider).user?.id;
    if (myUserId == null) return;

    final sharedSecret = _chatId.replaceAll('_', ':');
    final worker = ref.read(decryptionWorkerProvider);
    final cache = ref.read(messageRuntimeCacheProvider.notifier);

    final List<DecryptionTask> tasksToQueue = [];

    for (final entity in entities) {
      final decision = MessageHydrator.resolve(
        messageContent: entity.messageContent,
        migrationVersion: entity.migrationVersion,
        encryptedContent: entity.encryptedContent,
        isEncrypted: entity.isEncrypted,
        iv: entity.encryptionIv,
        salt: entity.encryptionSalt,
      );

      if (decision.action != HydrationAction.decrypt) {
        if (decision.action == HydrationAction.usePlaintext &&
            decision.messageContent != null) {
          cache.insert(
            _chatId,
            entity.id,
            decision.messageContent!,
            entity.conversationSequence ?? 0,
          );
        }
        continue;
      }

      // Hard cache-hit guard — never queue an already-cached message
      if (cache.lookup(_chatId, entity.id) != null) {
        continue;
      }

      tasksToQueue.add(
        DecryptionTask(
          messageId: entity.id,
          chatId: _chatId,
          encryptedContent: entity.encryptedContent!,
          iv: entity.encryptionIv!,
          salt: entity.encryptionSalt!,
          key: sharedSecret,
          sequence: entity.conversationSequence ?? 0,
          message: entity,
        ),
      );
    }

    if (tasksToQueue.isNotEmpty) {
      worker.queueBatch(tasksToQueue);
    }
  }

  /// Warm up the cache for the initial batch of messages.
  /// Only runs once per conversation session — subsequent rebuilds are no-ops.
  void warmCache(List<MessageEntity> messages, {int count = 50}) {
    if (messages.isEmpty) return;

    // Check how many are already in cache
    final cache = ref.read(messageRuntimeCacheProvider.notifier);
    final uncached = messages.where((m) {
      if (!m.isEncrypted || m.encryptedContent == null) return false;
      return cache.lookup(_chatId, m.id) == null;
    }).toList();

    // Emit diagnostic log block on every warmCache call so you can watch in terminal
    final conversationCache = ref.read(messageRuntimeCacheProvider)[_chatId];
    final cachedCount = conversationCache?.decryptedMessages.length ?? 0;
    final totalEncrypted = messages.where((m) => m.isEncrypted).length;
    final cacheHit = _initialWarmDone && uncached.isEmpty;

    AppLogger.d('''
======== CHAT CACHE ========
Conversation: $_chatId
  cache_hit        = $cacheHit
  Cached Messages  = $cachedCount
  Total Encrypted  = $totalEncrypted
  New to Decrypt   = ${uncached.length}
  Warm Done Before = $_initialWarmDone
  Cache Hits       = ${cache.cacheHits}
  Cache Misses     = ${cache.cacheMisses}
  Decryptions      = ${cache.messagesDecrypted}
  Reuses           = ${cache.messagesReused}
============================''');

    if (_initialWarmDone && uncached.isEmpty) {
      // All messages already decrypted — nothing to do
      return;
    }

    _initialWarmDone = true;

    final recent = uncached.length > count
        ? uncached.sublist(uncached.length - count)
        : uncached;
    _queueDecryptionForEntities(recent);
  }

  /// Unified decryption method (Single Source of Truth).
  /// Performs cache lookup, duplicate decryption assertions, AES invocation, and cache insertion.
  Future<MessageEntity?> decryptMessageDirect(
    MessageEntity entity, {
    String? partnerClerkId,
  }) async {
    final decision = MessageHydrator.resolve(
      messageContent: entity.messageContent,
      migrationVersion: entity.migrationVersion,
      encryptedContent: entity.encryptedContent,
      isEncrypted: entity.isEncrypted,
      iv: entity.encryptionIv,
      salt: entity.encryptionSalt,
    );

    if (decision.action != HydrationAction.decrypt) {
      if (decision.action == HydrationAction.usePlaintext &&
          decision.messageContent != null) {
        return entity.copyWith(
          text: decision.messageContent,
          isEncrypted: false,
        );
      }
      return entity;
    }

    final cache = ref.read(messageRuntimeCacheProvider.notifier);
    final cached = cache.lookup(_chatId, entity.id);
    if (cached != null) {
      cache.recordReuse();
      return entity.copyWith(text: cached, isEncrypted: false);
    }

    final myUser = ref.read(authProvider).user;
    if (myUser == null) return null;

    final sharedSecret = _chatId.replaceAll('_', ':');

    // Verification Layer assertion
    cache.assertNoDuplicateDecryption(_chatId, entity.id);

    try {
      final startTime = DateTime.now();
      String decrypted;

      final isGroup = _chatId.split('_').length != 2;
      if (isGroup) {
        final groupSvc = ref.read(groupEncryptionServiceProvider);
        decrypted = await groupSvc.decryptMessage(
          groupId: _chatId,
          encryptedContent: entity.encryptedContent!,
          iv: entity.encryptionIv!,
          salt: entity.encryptionSalt!,
        );
      } else {
        decrypted = await EncryptionService().decryptMessage(
          encryptedContent: entity.encryptedContent!,
          iv: entity.encryptionIv!,
          salt: entity.encryptionSalt!,
          key: sharedSecret,
        );
      }

      final duration = DateTime.now().difference(startTime);
      cache.recordDecryption(duration);

      if (decrypted != '[Failed to decrypt]' &&
          decrypted != '[Encrypted message]') {
        cache.insert(
          _chatId,
          entity.id,
          decrypted,
          entity.conversationSequence ?? 0,
        );
        return entity.copyWith(text: decrypted, isEncrypted: false);
      }

      // Fallback Strategy: Try Clerk IDs if UUID decryption fails (for legacy messages)
      final myClerkId = myUser.id;
      if (partnerClerkId != null) {
        final ids = [myClerkId, partnerClerkId]..sort();
        final legacySecret = '${ids[0]}:${ids[1]}';
        if (legacySecret != sharedSecret) {
          AppLogger.d(
            '🛡️ [ConversationRuntimeManager] Attempting legacy fallback decryption...',
          );
          cache.assertNoDuplicateDecryption(_chatId, entity.id);
          final fallbackResult = await EncryptionService().decryptMessage(
            encryptedContent: entity.encryptedContent!,
            iv: entity.encryptionIv!,
            salt: entity.encryptionSalt!,
            key: legacySecret,
          );
          if (fallbackResult != '[Failed to decrypt]') {
            cache.insert(
              _chatId,
              entity.id,
              fallbackResult,
              entity.conversationSequence ?? 0,
            );
            return entity.copyWith(text: fallbackResult, isEncrypted: false);
          }
        }
      }
    } catch (e) {
      AppLogger.e(
        '🔓 [ConversationRuntimeManager] Decryption pipeline failed',
        error: e,
      );
    }
    return null;
  }
}

final conversationRuntimeManagerProvider =
    NotifierProvider.family<
      ConversationRuntimeManager,
      ConversationRuntimeManagerState,
      String
    >((chatId) => ConversationRuntimeManager()..init(chatId));

/// Consolidated provider that watches messageStore state and merges decryption cache.
/// UI components watch this provider to render plaintext messages dynamically.
final decryptedMessagesProvider = Provider.family<List<MessageEntity>, String>((
  ref,
  chatId,
) {
  final msgState = ref.watch(messageStoreProvider(chatId));
  final cache = ref.watch(messageRuntimeCacheProvider);

  return msgState.orderedIds
      .map((id) {
        final msg = msgState.messages[id];
        if (msg == null) return null;

        final cached = cache[chatId]?.decryptedMessages[id];
        if (cached != null && msg.isEncrypted) {
          return msg.copyWith(text: cached.plaintext, isEncrypted: false);
        }
        return msg;
      })
      .whereType<MessageEntity>()
      .toList();
});
