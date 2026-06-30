import 'package:hive/hive.dart';

class ConversationMetadata {
  final String conversationId;
  final int lastSequence;
  final int lastReadSequence;
  final DateTime lastSyncedAt;
  final int cacheSchemaVersion;
  final int cachedMessageCount;

  ConversationMetadata({
    required this.conversationId,
    required this.lastSequence,
    required this.lastReadSequence,
    required this.lastSyncedAt,
    required this.cacheSchemaVersion,
    required this.cachedMessageCount,
  });

  ConversationMetadata copyWith({
    String? conversationId,
    int? lastSequence,
    int? lastReadSequence,
    DateTime? lastSyncedAt,
    int? cacheSchemaVersion,
    int? cachedMessageCount,
  }) {
    return ConversationMetadata(
      conversationId: conversationId ?? this.conversationId,
      lastSequence: lastSequence ?? this.lastSequence,
      lastReadSequence: lastReadSequence ?? this.lastReadSequence,
      lastSyncedAt: lastSyncedAt ?? this.lastSyncedAt,
      cacheSchemaVersion: cacheSchemaVersion ?? this.cacheSchemaVersion,
      cachedMessageCount: cachedMessageCount ?? this.cachedMessageCount,
    );
  }
}

class CachedMessage {
  final String id;
  final String conversationId;
  final int sequence;
  final String text;
  final String senderId;
  final DateTime createdAt;
  final String? mediaUrl;
  final String? mediaType;
  final String status;
  final int messageMigrationVersion;

  CachedMessage({
    required this.id,
    required this.conversationId,
    required this.sequence,
    required this.text,
    required this.senderId,
    required this.createdAt,
    this.mediaUrl,
    this.mediaType,
    required this.status,
    required this.messageMigrationVersion,
  });

  CachedMessage copyWith({
    String? id,
    String? conversationId,
    int? sequence,
    String? text,
    String? senderId,
    DateTime? createdAt,
    String? mediaUrl,
    String? mediaType,
    String? status,
    int? messageMigrationVersion,
  }) {
    return CachedMessage(
      id: id ?? this.id,
      conversationId: conversationId ?? this.conversationId,
      sequence: sequence ?? this.sequence,
      text: text ?? this.text,
      senderId: senderId ?? this.senderId,
      createdAt: createdAt ?? this.createdAt,
      mediaUrl: mediaUrl ?? this.mediaUrl,
      mediaType: mediaType ?? this.mediaType,
      status: status ?? this.status,
      messageMigrationVersion:
          messageMigrationVersion ?? this.messageMigrationVersion,
    );
  }
}

class ConversationIndex {
  final String conversationId;
  final String lastMessageSnippet;
  final String lastMessageId;
  final int lastSequence;
  final DateTime updatedAt;
  final DateTime lastSyncAt;
  final int unreadCount;
  final List<String> participantIds;
  final String? participantNames;
  final String? avatarUrl;
  final bool isPinned;
  final bool isMuted;
  final String? draftMessage;
  final bool hasLocalChanges;
  final String? lastReadMessageId;
  final int cacheSchemaVersion;

  ConversationIndex({
    required this.conversationId,
    required this.lastMessageSnippet,
    required this.lastMessageId,
    required this.lastSequence,
    required this.updatedAt,
    required this.lastSyncAt,
    required this.unreadCount,
    required this.participantIds,
    this.participantNames,
    this.avatarUrl,
    this.isPinned = false,
    this.isMuted = false,
    this.draftMessage,
    this.hasLocalChanges = false,
    this.lastReadMessageId,
    this.cacheSchemaVersion = 2,
  });

  ConversationIndex copyWith({
    String? conversationId,
    String? lastMessageSnippet,
    String? lastMessageId,
    int? lastSequence,
    DateTime? updatedAt,
    DateTime? lastSyncAt,
    int? unreadCount,
    List<String>? participantIds,
    String? participantNames,
    String? avatarUrl,
    bool? isPinned,
    bool? isMuted,
    String? draftMessage,
    bool? hasLocalChanges,
    String? lastReadMessageId,
    int? cacheSchemaVersion,
  }) {
    return ConversationIndex(
      conversationId: conversationId ?? this.conversationId,
      lastMessageSnippet: lastMessageSnippet ?? this.lastMessageSnippet,
      lastMessageId: lastMessageId ?? this.lastMessageId,
      lastSequence: lastSequence ?? this.lastSequence,
      updatedAt: updatedAt ?? this.updatedAt,
      lastSyncAt: lastSyncAt ?? this.lastSyncAt,
      unreadCount: unreadCount ?? this.unreadCount,
      participantIds: participantIds ?? this.participantIds,
      participantNames: participantNames ?? this.participantNames,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      isPinned: isPinned ?? this.isPinned,
      isMuted: isMuted ?? this.isMuted,
      draftMessage: draftMessage ?? this.draftMessage,
      hasLocalChanges: hasLocalChanges ?? this.hasLocalChanges,
      lastReadMessageId: lastReadMessageId ?? this.lastReadMessageId,
      cacheSchemaVersion: cacheSchemaVersion ?? this.cacheSchemaVersion,
    );
  }
}
