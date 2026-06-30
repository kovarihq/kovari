import 'dart:convert';
import 'package:hive/hive.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'conversation_cache_models.dart';
import 'cache_policy.dart';

class ConversationCacheRepository {
  final String userId;
  final CachePolicy policy;
  Box<String>? _metadataBox;
  Box<String>? _messageBox;
  Box<String>? _indexBox;

  ConversationCacheRepository({
    required this.userId,
    this.policy = const CachePolicy(),
  });

  Future<void> init() async {
    try {
      _metadataBox = await Hive.openBox<String>('chat_meta_${userId}_v3');
      _messageBox = await Hive.openBox<String>('chat_msg_${userId}_v3');
      _indexBox = await Hive.openBox<String>('chat_idx_${userId}_v3');

      await validateAndRepairCache();
      AppLogger.i('ConversationCacheRepository initialized for user: $userId');
    } catch (e, stack) {
      AppLogger.e(
        'Cache corruption detected during Hive open. Attempting recovery...',
        error: e,
        stackTrace: stack,
      );
      await recoverFromCorruption();
    }
  }

  Future<void> validateAndRepairCache() async {
    if (_messageBox == null) return;
    final keys = List<String>.from(_messageBox!.keys);
    final Map<String, List<String>> duplicates = {};

    for (final key in keys) {
      final raw = _messageBox!.get(key);
      if (raw == null) continue;
      try {
        final map = jsonDecode(raw) as Map<String, dynamic>;
        final id = map['id'] as String;
        duplicates.putIfAbsent(id, () => []).add(key);
      } catch (e) {
        // Remove corrupted entries
        await _messageBox!.delete(key);
      }
    }

    // Repair duplicates by keeping the one with the highest sequence/timestamp
    for (final entry in duplicates.entries) {
      if (entry.value.length > 1) {
        String? bestKey;
        int maxSeq = -1;
        for (final key in entry.value) {
          final raw = _messageBox!.get(key);
          if (raw != null) {
            final map = jsonDecode(raw) as Map<String, dynamic>;
            final seq = map['sequence'] as int;
            if (seq > maxSeq) {
              maxSeq = seq;
              bestKey = key;
            }
          }
        }
        for (final key in entry.value) {
          if (key != bestKey) {
            await _messageBox!.delete(key);
          }
        }
      }
    }
  }

  Future<void> recoverFromCorruption() async {
    try {
      await Hive.deleteBoxFromDisk('chat_meta_${userId}_v3');
      await Hive.deleteBoxFromDisk('chat_msg_${userId}_v3');
      await Hive.deleteBoxFromDisk('chat_idx_${userId}_v3');

      _metadataBox = await Hive.openBox<String>('chat_meta_${userId}_v3');
      _messageBox = await Hive.openBox<String>('chat_msg_${userId}_v3');
      _indexBox = await Hive.openBox<String>('chat_idx_${userId}_v3');

      AppLogger.i('Cache recovered successfully from disk corruption.');
    } catch (e) {
      AppLogger.e('Severe cache failure. Recovery failed: $e');
    }
  }

  Future<void> saveMetadata(ConversationMetadata metadata) async {
    final map = {
      'conversationId': metadata.conversationId,
      'lastSequence': metadata.lastSequence,
      'lastReadSequence': metadata.lastReadSequence,
      'lastSyncedAt': metadata.lastSyncedAt.toIso8601String(),
      'cacheSchemaVersion': metadata.cacheSchemaVersion,
      'cachedMessageCount': metadata.cachedMessageCount,
    };
    await _metadataBox?.put(metadata.conversationId, jsonEncode(map));
  }

  ConversationMetadata? getMetadata(String conversationId) {
    final raw = _metadataBox?.get(conversationId);
    if (raw == null) return null;
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      return ConversationMetadata(
        conversationId: map['conversationId'] as String,
        lastSequence: map['lastSequence'] as int,
        lastReadSequence: map['lastReadSequence'] as int,
        lastSyncedAt: DateTime.parse(map['lastSyncedAt'] as String),
        cacheSchemaVersion: map['cacheSchemaVersion'] as int,
        cachedMessageCount: map['cachedMessageCount'] as int,
      );
    } catch (e) {
      AppLogger.e('Failed to parse metadata cache: $e');
      return null;
    }
  }

  Future<void> saveMessage(CachedMessage message) async {
    final key = '${message.conversationId}_${message.id}';
    final map = _messageToMap(message);
    await _messageBox?.put(key, jsonEncode(map));
    await _pruneOldMessages(message.conversationId);
  }

  Future<void> saveMessages(List<CachedMessage> messages) async {
    if (messages.isEmpty) return;
    final Map<String, String> map = {};
    for (final m in messages) {
      map['${m.conversationId}_${m.id}'] = jsonEncode(_messageToMap(m));
    }
    await _messageBox?.putAll(map);
    await _pruneOldMessages(messages.first.conversationId);
  }

  List<CachedMessage> getMessages(String conversationId) {
    if (_messageBox == null) return [];

    final List<CachedMessage> msgs = [];
    for (final raw in _messageBox!.values) {
      try {
        final map = jsonDecode(raw) as Map<String, dynamic>;
        if (map['conversationId'] == conversationId) {
          msgs.add(_mapToMessage(map));
        }
      } catch (e) {
        AppLogger.e('Failed to parse message cache: $e');
      }
    }

    msgs.sort((a, b) => a.sequence.compareTo(b.sequence));
    return msgs;
  }

  Future<void> saveIndex(ConversationIndex index) async {
    final map = {
      'conversationId': index.conversationId,
      'lastMessageSnippet': index.lastMessageSnippet,
      'lastMessageId': index.lastMessageId,
      'lastSequence': index.lastSequence,
      'updatedAt': index.updatedAt.toIso8601String(),
      'lastSyncAt': index.lastSyncAt.toIso8601String(),
      'unreadCount': index.unreadCount,
      'participantIds': index.participantIds,
      'participantNames': index.participantNames,
      'avatarUrl': index.avatarUrl,
      'isPinned': index.isPinned,
      'isMuted': index.isMuted,
      'draftMessage': index.draftMessage,
      'hasLocalChanges': index.hasLocalChanges,
      'lastReadMessageId': index.lastReadMessageId,
      'cacheSchemaVersion': index.cacheSchemaVersion,
    };
    await _indexBox?.put(index.conversationId, jsonEncode(map));
    await _pruneOldConversations();
  }

  List<ConversationIndex> getIndices() {
    if (_indexBox == null) return [];
    final List<ConversationIndex> list = [];
    for (final raw in _indexBox!.values) {
      try {
        final map = jsonDecode(raw) as Map<String, dynamic>;
        list.add(
          ConversationIndex(
            conversationId: map['conversationId'] as String,
            lastMessageSnippet: map['lastMessageSnippet'] as String,
            lastMessageId: map['lastMessageId'] as String? ?? '',
            lastSequence: map['lastSequence'] as int,
            updatedAt: DateTime.parse(map['updatedAt'] as String),
            lastSyncAt: DateTime.parse(map['lastSyncAt'] as String? ?? DateTime.now().toIso8601String()),
            unreadCount: map['unreadCount'] as int,
            participantIds: List<String>.from(map['participantIds'] as List? ?? []),
            participantNames: map['participantNames'] as String?,
            avatarUrl: map['avatarUrl'] as String?,
            isPinned: map['isPinned'] as bool? ?? false,
            isMuted: map['isMuted'] as bool? ?? false,
            draftMessage: map['draftMessage'] as String?,
            hasLocalChanges: map['hasLocalChanges'] as bool? ?? false,
            lastReadMessageId: map['lastReadMessageId'] as String?,
            cacheSchemaVersion: map['cacheSchemaVersion'] as int? ?? 2,
          ),
        );
      } catch (e) {
        AppLogger.e('Failed to parse index cache: $e');
      }
    }
    list.sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
    return list;
  }

  Future<void> close() async {
    await _metadataBox?.close();
    await _messageBox?.close();
    await _indexBox?.close();
  }

  Future<void> deleteCache() async {
    await _metadataBox?.clear();
    await _messageBox?.clear();
    await _indexBox?.clear();
  }

  Future<void> _pruneOldMessages(String conversationId) async {
    if (_messageBox == null) return;

    final msgs = getMessages(conversationId);
    if (msgs.length <= policy.maxMessagesPerConversation) return;

    final pruneCount = msgs.length - policy.maxMessagesPerConversation;
    for (var i = 0; i < pruneCount; i++) {
      final key = '${msgs[i].conversationId}_${msgs[i].id}';
      await _messageBox!.delete(key);
    }

    AppLogger.d('Pruned $pruneCount messages for conversation $conversationId');
  }

  Future<void> _pruneOldConversations() async {
    if (_indexBox == null) return;
    final list = getIndices();
    if (list.length <= policy.maxConversations) return;

    final pruneCount = list.length - policy.maxConversations;
    // Prune the oldest conversations based on updatedAt
    for (var i = list.length - 1; i >= list.length - pruneCount; i--) {
      final chatId = list[i].conversationId;
      await _indexBox!.delete(chatId);
      await _metadataBox!.delete(chatId);
      
      // Clean up related messages
      final keys = List<String>.from(_messageBox?.keys ?? []);
      for (final key in keys) {
        if (key.startsWith('${chatId}_')) {
          await _messageBox!.delete(key);
        }
      }
    }
  }

  Map<String, dynamic> _messageToMap(CachedMessage m) {
    return {
      'id': m.id,
      'conversationId': m.conversationId,
      'sequence': m.sequence,
      'text': m.text,
      'senderId': m.senderId,
      'createdAt': m.createdAt.toIso8601String(),
      'mediaUrl': m.mediaUrl,
      'mediaType': m.mediaType,
      'status': m.status,
      'messageMigrationVersion': m.messageMigrationVersion,
    };
  }

  CachedMessage _mapToMessage(Map<String, dynamic> map) {
    return CachedMessage(
      id: map['id'] as String,
      conversationId: map['conversationId'] as String,
      sequence: map['sequence'] as int,
      text: map['text'] as String,
      senderId: map['senderId'] as String,
      createdAt: DateTime.parse(map['createdAt'] as String),
      mediaUrl: map['mediaUrl'] as String?,
      mediaType: map['mediaType'] as String?,
      status: map['status'] as String,
      messageMigrationVersion: map['messageMigrationVersion'] as int,
    );
  }
}
