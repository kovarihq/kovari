import 'dart:async';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/features/chat/models/message_entity.dart';
import 'package:mobile/features/chat/services/message_hydrator.dart';
import 'package:mobile/features/chat/telemetry/cache_metrics_events.dart';
import 'conversation_cache_models.dart';
import 'conversation_cache_repository.dart';
import 'conversation_repository.dart';
import 'conversation_conflict_resolver.dart';

class ConversationSyncEngine {
  final ConversationCacheRepository _cacheRepository;
  final ConversationRepository _remoteRepository;

  ConversationSyncEngine({
    required ConversationCacheRepository cacheRepository,
    required ConversationRepository remoteRepository,
  })  : _cacheRepository = cacheRepository,
        _remoteRepository = remoteRepository;

  Future<List<CachedMessage>> loadCachedMessages(String chatId) async {
    final msgs = _cacheRepository.getMessages(chatId);
    if (msgs.isNotEmpty) {
      MetricsService.record(CacheHitEvent(chatId));
    } else {
      MetricsService.record(CacheMissEvent(chatId));
    }
    return msgs;
  }

  Future<void> syncDelta({
    required String chatId,
    required String path,
    required Map<String, dynamic> baseParams,
    required String? partnerClerkId,
    required String? myUserId,
    required Future<String> Function(MessageEntity) decryptCallback,
  }) async {
    final stopwatch = Stopwatch()..start();
    MetricsService.record(DeltaSyncStartedEvent(chatId));

    final meta = _cacheRepository.getMetadata(chatId);
    final lastSeq = meta?.lastSequence ?? 0;

    final params = Map<String, dynamic>.from(baseParams)
      ..['afterSequence'] = lastSeq;

    AppLogger.d('[ConversationSyncEngine] Syncing delta for $chatId from sequence $lastSeq');

    final response = await _remoteRepository.fetchMessages(
      path: path,
      queryParameters: params,
    );

    if (response == null) {
      MetricsService.record(DeltaSyncFinishedEvent(chatId, 0, stopwatch.elapsed));
      return;
    }

    final rawMessages = response['messages'] as List<dynamic>? ?? [];
    if (rawMessages.isEmpty) {
      MetricsService.record(DeltaSyncFinishedEvent(chatId, 0, stopwatch.elapsed));
      return;
    }

    final List<CachedMessage> newCachedMsgs = [];
    var highestSeq = lastSeq;

    for (final raw in rawMessages) {
      if (raw is! Map) continue;
      final data = Map<String, dynamic>.from(raw);
      final entity = MessageEntity.fromSocket(data, chatId, currentUserId: myUserId);
      
      final seq = entity.conversationSequence ?? 0;
      if (seq > highestSeq) {
        highestSeq = seq;
      }

      // Check sequence drift assertions
      if (meta != null && seq <= meta.lastSequence) {
        AppLogger.w('[SyncEngine] Out-of-order sequence detected: $seq <= ${meta.lastSequence}. Reconciling.');
      }

      final decision = MessageHydrator.resolve(
        messageContent: entity.messageContent,
        migrationVersion: entity.migrationVersion,
        encryptedContent: entity.encryptedContent,
        isEncrypted: entity.isEncrypted,
        iv: entity.encryptionIv,
        salt: entity.encryptionSalt,
      );

      String finalContent = '';
      if (decision.action == HydrationAction.usePlaintext && decision.messageContent != null) {
        finalContent = decision.messageContent!;
      } else if (decision.action == HydrationAction.decrypt) {
        finalContent = await decryptCallback(entity);
      } else {
        finalContent = entity.text ?? '';
      }

      newCachedMsgs.add(CachedMessage(
        id: entity.id,
        conversationId: chatId,
        sequence: seq,
        text: finalContent,
        senderId: entity.senderId,
        createdAt: entity.createdAt,
        mediaUrl: entity.mediaUrl,
        mediaType: entity.mediaType,
        status: entity.deliveryStatus.name,
        messageMigrationVersion: entity.migrationVersion ?? MessageHydrator.legacy,
      ));
    }

    if (newCachedMsgs.isNotEmpty) {
      final existing = _cacheRepository.getMessages(chatId);
      final mergeResult = ConversationConflictResolver.merge(
        cached: existing,
        incoming: newCachedMsgs,
      );
      await _cacheRepository.saveMessages(mergeResult.messages);

      final nextMeta = ConversationMetadata(
        conversationId: chatId,
        lastSequence: highestSeq,
        lastReadSequence: meta?.lastReadSequence ?? 0,
        lastSyncedAt: DateTime.now(),
        cacheSchemaVersion: 2,
        cachedMessageCount: mergeResult.messages.length,
      );
      await _cacheRepository.saveMetadata(nextMeta);

      final lastMsg = mergeResult.messages.last;
      final index = ConversationIndex(
        conversationId: chatId,
        lastMessageSnippet: lastMsg.text,
        lastMessageId: lastMsg.id,
        lastSequence: highestSeq,
        updatedAt: lastMsg.createdAt,
        lastSyncAt: DateTime.now(),
        unreadCount: 0,
        participantIds: [lastMsg.senderId],
        cacheSchemaVersion: 2,
      );
      await _cacheRepository.saveIndex(index);
    }

    MetricsService.record(DeltaSyncFinishedEvent(
      chatId,
      newCachedMsgs.length,
      stopwatch.elapsed,
    ));
  }

  Future<CachedMessage> processRealtimeMessage({
    required String chatId,
    required Map<String, dynamic> data,
    required String? myUserId,
    required Future<String> Function(MessageEntity) decryptCallback,
  }) async {
    final entity = MessageEntity.fromSocket(data, chatId, currentUserId: myUserId);
    final seq = entity.conversationSequence ?? 0;

    final decision = MessageHydrator.resolve(
      messageContent: entity.messageContent,
      migrationVersion: entity.migrationVersion,
      encryptedContent: entity.encryptedContent,
      isEncrypted: entity.isEncrypted,
      iv: entity.encryptionIv,
      salt: entity.encryptionSalt,
    );

    String finalContent = '';
    if (decision.action == HydrationAction.usePlaintext && decision.messageContent != null) {
      finalContent = decision.messageContent!;
    } else if (decision.action == HydrationAction.decrypt) {
      finalContent = await decryptCallback(entity);
    } else {
      finalContent = entity.text ?? '';
    }

    final newCached = CachedMessage(
      id: entity.id,
      conversationId: chatId,
      sequence: seq,
      text: finalContent,
      senderId: entity.senderId,
      createdAt: entity.createdAt,
      mediaUrl: entity.mediaUrl,
      mediaType: entity.mediaType,
      status: entity.deliveryStatus.name,
      messageMigrationVersion: entity.migrationVersion ?? MessageHydrator.legacy,
    );

    final existing = _cacheRepository.getMessages(chatId);
    final mergeResult = ConversationConflictResolver.merge(
      cached: existing,
      incoming: [newCached],
    );
    await _cacheRepository.saveMessages(mergeResult.messages);

    final meta = _cacheRepository.getMetadata(chatId);
    final highestSeq = seq > (meta?.lastSequence ?? 0) ? seq : (meta?.lastSequence ?? 0);

    final nextMeta = ConversationMetadata(
      conversationId: chatId,
      lastSequence: highestSeq,
      lastReadSequence: meta?.lastReadSequence ?? 0,
      lastSyncedAt: DateTime.now(),
      cacheSchemaVersion: 2,
      cachedMessageCount: mergeResult.messages.length,
    );
    await _cacheRepository.saveMetadata(nextMeta);

    final index = ConversationIndex(
      conversationId: chatId,
      lastMessageSnippet: finalContent,
      lastMessageId: entity.id,
      lastSequence: highestSeq,
      updatedAt: entity.createdAt,
      lastSyncAt: DateTime.now(),
      unreadCount: 0,
      participantIds: [entity.senderId],
      cacheSchemaVersion: 2,
    );
    await _cacheRepository.saveIndex(index);

    return newCached;
  }
}
