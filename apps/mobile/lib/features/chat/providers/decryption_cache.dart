import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/utils/app_logger.dart';

class RuntimeMessage {
  RuntimeMessage({
    required this.messageId,
    required this.conversationId,
    required this.sequence,
    this.encryptedPayload,
    required this.plaintext,
    required this.isDecrypted,
    required this.decryptedAt,
    required this.cacheGeneration,
    required this.runtimeVersion,
  });

  final String messageId;
  final String conversationId;
  final int sequence;
  final String? encryptedPayload;
  final String plaintext;
  final bool isDecrypted;
  final DateTime decryptedAt;
  final int cacheGeneration;
  final int runtimeVersion;
}

class ConversationCacheState {
  ConversationCacheState({
    required this.chatId,
    required this.decryptedMessages,
    required this.lastSequence,
    required this.createdAt,
    required this.lastAccess,
  });

  final String chatId;
  final Map<String, RuntimeMessage> decryptedMessages; // messageId -> RuntimeMessage
  final int lastSequence;
  final DateTime createdAt;
  DateTime lastAccess;

  ConversationCacheState copyWith({
    Map<String, RuntimeMessage>? decryptedMessages,
    int? lastSequence,
    DateTime? lastAccess,
  }) {
    return ConversationCacheState(
      chatId: chatId,
      decryptedMessages: decryptedMessages ?? this.decryptedMessages,
      lastSequence: lastSequence ?? this.lastSequence,
      createdAt: createdAt,
      lastAccess: lastAccess ?? this.lastAccess,
    );
  }
}

class MessageRuntimeCache extends Notifier<Map<String, ConversationCacheState>> {
  static const int _maxConversations = 10;
  static const Duration _ttl = Duration(minutes: 10);
  Timer? _cleanupTimer;

  // Cache Statistics / Telemetry Metrics
  int cacheHits = 0;
  int cacheMisses = 0;
  int messagesDecrypted = 0;
  int messagesReused = 0;
  int duplicateDecryptionAttempts = 0;
  int lruEvictions = 0;
  int _cacheGeneration = 0;
  static const int _runtimeVersion = 1;

  final List<int> _aesTimesMs = [];

  double get averageAesTimeMs {
    if (_aesTimesMs.isEmpty) return 0.0;
    final total = _aesTimesMs.reduce((a, b) => a + b);
    return total / _aesTimesMs.length;
  }

  int get peakCacheSize {
    var maxCount = 0;
    for (final conv in state.values) {
      if (conv.decryptedMessages.length > maxCount) {
        maxCount = conv.decryptedMessages.length;
      }
    }
    return maxCount;
  }

  int get conversationCacheHits => cacheHits;
  int get conversationCacheMisses => cacheMisses;

  // Duplicate decryption tracking map (tracks count of decrypt calls per message ID)
  final Map<String, int> _decryptionCounts = {};

  @override
  Map<String, ConversationCacheState> build() {
    _cleanupTimer?.cancel();
    _cleanupTimer = Timer.periodic(const Duration(minutes: 1), (_) => _cleanupExpiredEntries());
    
    ref.onDispose(() {
      _cleanupTimer?.cancel();
    });

    return {};
  }

  /// Increments decryption count for a message and asserts/checks that it doesn't exceed 1.
  void assertNoDuplicateDecryption(String chatId, String messageId) {
    _decryptionCounts[messageId] = (_decryptionCounts[messageId] ?? 0) + 1;
    final count = _decryptionCounts[messageId]!;
    
    if (count > 1) {
      duplicateDecryptionAttempts++;
      AppLogger.e('''
🚨 RUNTIME VIOLATION: Duplicate Decryption Detected!
Message: $messageId
Conversation: $chatId
Attempts: $count
Stack Trace:
${StackTrace.current}
''');
      assert(false, 'Duplicate decryption violation for message $messageId');
    }
  }

  void recordDecryption(Duration duration) {
    messagesDecrypted++;
    _aesTimesMs.add(duration.inMilliseconds);
  }

  void recordReuse() {
    messagesReused++;
  }

  String? lookup(String chatId, String messageId) {
    final conversation = state[chatId];
    if (conversation == null) {
      cacheMisses++;
      return null;
    }

    final msg = conversation.decryptedMessages[messageId];
    if (msg != null && msg.isDecrypted) {
      conversation.lastAccess = DateTime.now();
      cacheHits++;
      return msg.plaintext;
    }

    cacheMisses++;
    return null;
  }

  void insert(String chatId, String messageId, String plaintext, int sequence, {String? encryptedPayload}) {
    final now = DateTime.now();
    _cacheGeneration++;
    final runtimeMsg = RuntimeMessage(
      messageId: messageId,
      conversationId: chatId,
      sequence: sequence,
      encryptedPayload: encryptedPayload,
      plaintext: plaintext,
      isDecrypted: true,
      decryptedAt: now,
      cacheGeneration: _cacheGeneration,
      runtimeVersion: _runtimeVersion,
    );

    final updated = Map<String, ConversationCacheState>.from(state);

    if (!updated.containsKey(chatId)) {
      // LRU Eviction check
      if (updated.length >= _maxConversations) {
        _evictOldest(updated);
      }

      updated[chatId] = ConversationCacheState(
        chatId: chatId,
        decryptedMessages: {messageId: runtimeMsg},
        lastSequence: sequence,
        createdAt: now,
        lastAccess: now,
      );
    } else {
      final current = updated[chatId]!;
      final newMessages = Map<String, RuntimeMessage>.from(current.decryptedMessages)..[messageId] = runtimeMsg;
      updated[chatId] = current.copyWith(
        decryptedMessages: newMessages,
        lastSequence: sequence > current.lastSequence ? sequence : current.lastSequence,
        lastAccess: now,
      );
    }

    state = updated;

    // Structured diagnostic log for every new decryption inserted into the runtime cache
    AppLogger.d('''
New message decrypted → runtime cache
  Conversation : $chatId
  Message      : $messageId
  Sequence     : $sequence
  Cache Hit    = false
  Decryptions  = $messagesDecrypted
  Inserted into runtime cache ✓''');
  }

  void _evictOldest(Map<String, ConversationCacheState> cache) {
    if (cache.isEmpty) return;

    String? oldestChatId;
    DateTime? oldestAccess;

    for (final entry in cache.entries) {
      if (oldestAccess == null || entry.value.lastAccess.isBefore(oldestAccess)) {
        oldestAccess = entry.value.lastAccess;
        oldestChatId = entry.key;
      }
    }

    if (oldestChatId != null) {
      AppLogger.i('🔓 [MessageRuntimeCache] Evicting oldest conversation cache: $oldestChatId');
      lruEvictions++;
      
      // Clean up decryption counts of evicted messages to allow re-decryption if needed
      final evictedConv = cache[oldestChatId];
      if (evictedConv != null) {
        for (final msgId in evictedConv.decryptedMessages.keys) {
          _decryptionCounts.remove(msgId);
        }
      }
      
      cache.remove(oldestChatId);
    }
  }

  void _cleanupExpiredEntries() {
    final now = DateTime.now();
    final updated = Map<String, ConversationCacheState>.from(state);
    var changed = false;

    updated.removeWhere((chatId, cacheState) {
      final isExpired = now.difference(cacheState.lastAccess) > _ttl;
      if (isExpired) {
        AppLogger.i('🔓 [MessageRuntimeCache] Evicted expired cache for chatId: $chatId');
        
        // Clean up decryption counts
        for (final msgId in cacheState.decryptedMessages.keys) {
          _decryptionCounts.remove(msgId);
        }
        
        lruEvictions++;
        changed = true;
      }
      return isExpired;
    });

    if (changed) {
      state = updated;
    }
  }

  void invalidate(String chatId) {
    if (state.containsKey(chatId)) {
      final evictedConv = state[chatId];
      if (evictedConv != null) {
        for (final msgId in evictedConv.decryptedMessages.keys) {
          _decryptionCounts.remove(msgId);
        }
      }
      
      final updated = Map<String, ConversationCacheState>.from(state)..remove(chatId);
      state = updated;
      AppLogger.i('🔓 [MessageRuntimeCache] Invalidated cache for: $chatId');
    }
  }

  void clearAll() {
    _decryptionCounts.clear();
    state = {};
    AppLogger.i('🔓 [MessageRuntimeCache] Cleared all caches');
  }
}

final messageRuntimeCacheProvider = NotifierProvider<MessageRuntimeCache, Map<String, ConversationCacheState>>(
  MessageRuntimeCache.new,
);
