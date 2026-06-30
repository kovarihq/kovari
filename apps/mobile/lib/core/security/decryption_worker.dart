import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/features/chat/models/message_entity.dart';
import 'package:mobile/features/chat/providers/decryption_cache.dart';
import 'package:mobile/features/chat/providers/conversation_runtime_manager.dart';

class DecryptionTask {
  DecryptionTask({
    required this.messageId,
    required this.chatId,
    required this.encryptedContent,
    required this.iv,
    required this.salt,
    required this.key,
    required this.sequence,
    this.message,
  });

  final String messageId;
  final String chatId;
  final String encryptedContent;
  final String iv;
  final String salt;
  final String key;
  final int sequence;
  final MessageEntity? message;
}

class DecryptionWorker {
  DecryptionWorker(this.ref);
  final Ref ref;

  final List<DecryptionTask> _queue = [];
  bool _processing = false;
  static const int _maxConcurrency = 4;
  int _activeJobs = 0;

  void queueDecryption(DecryptionTask task) {
    // 1. Check if already in cache
    final cached = ref.read(messageRuntimeCacheProvider.notifier).lookup(task.chatId, task.messageId);
    if (cached != null) return;

    // 2. Add to queue if not already queued
    if (_queue.any((t) => t.messageId == task.messageId)) return;

    _queue.add(task);
    _processNext();
  }

  void queueBatch(List<DecryptionTask> tasks) {
    for (final task in tasks) {
      queueDecryption(task);
    }
  }

  Future<void> _processNext() async {
    if (_processing || _queue.isEmpty) return;
    if (_activeJobs >= _maxConcurrency) return;

    _processing = true;

    while (_queue.isNotEmpty && _activeJobs < _maxConcurrency) {
      final task = _queue.removeAt(0);
      _activeJobs++;

      // Process task asynchronously
      unawaited(_decryptTask(task).then((_) {
        _activeJobs--;
        _processNext();
      }));
    }

    _processing = false;
  }

  Future<void> _decryptTask(DecryptionTask task) async {
    try {
      final cache = ref.read(messageRuntimeCacheProvider.notifier);
      final cached = cache.lookup(task.chatId, task.messageId);
      if (cached != null) {
        cache.recordReuse();
        return;
      }

      // Delegate decryption to ConversationRuntimeManager (single source of truth for EncryptionService.decrypt calls)
      final manager = ref.read(conversationRuntimeManagerProvider(task.chatId).notifier);
      
      final entity = task.message ?? MessageEntity(
        id: task.messageId,
        chatId: task.chatId,
        senderId: '',
        createdAt: DateTime.now(),
        deliveryStatus: MessageDeliveryStatus.sent,
        encryptedContent: task.encryptedContent,
        encryptionIv: task.iv,
        encryptionSalt: task.salt,
        isEncrypted: true,
        conversationSequence: task.sequence,
      );

      await manager.decryptMessageDirect(entity);
    } catch (e) {
      AppLogger.e('🔓 [DecryptionWorker] Failed to decrypt task: ${task.messageId}', error: e);
    }
  }
}

final decryptionWorkerProvider = Provider<DecryptionWorker>((ref) => DecryptionWorker(ref));
