import 'package:mobile/features/chat/models/message_entity.dart';

/// Metadata-only model for a conversation entry in the inbox list.
/// Background conversations are ONLY hydrated with this — never full messages.
class ConversationEntity {
  const ConversationEntity({
    required this.chatId,
    required this.participantIds,
    this.lastMessage,
    this.lastMessageAt,
    this.unreadCount = 0,
    this.lastSeenSequence,
    this.typingUserIds = const {},
    this.isGroup = false,
    this.groupName,
    this.groupAvatar,
    this.partnerName,
    this.partnerAvatar,
    this.partnerUserId,
    this.partnerClerkId,
    this.isPartnerOnline = false,
    this.partnerLastSeen,
    this.iBlockedThem = false,
    this.theyBlockedMe = false,
  });

  final String chatId;
  final List<String> participantIds;

  // --- Last Message Snippet ---
  final MessageEntity? lastMessage;
  final DateTime? lastMessageAt;

  // --- Unread State (Compressed Receipt) ---
  final int unreadCount;

  /// lastSeenSequence drives compressed read receipts.
  /// Implicitly marks all messages with CSN ≤ this as seen.
  final int? lastSeenSequence;

  // --- Typing (with TTL enforced by ConversationStore) ---
  final Set<String> typingUserIds;

  // --- Group Metadata ---
  final bool isGroup;
  final String? groupName;
  final String? groupAvatar;

  // --- Direct Chat Metadata ---
  final String? partnerName;
  final String? partnerAvatar;
  final String? partnerUserId;
  final String? partnerClerkId;

  // --- Presence ---
  final bool isPartnerOnline;
  final DateTime? partnerLastSeen;

  // --- Block Status ---
  final bool iBlockedThem;
  final bool theyBlockedMe;

  String get displayName =>
      isGroup ? (groupName ?? 'Group Chat') : (partnerName ?? 'User');

  String? get displayAvatar => isGroup ? groupAvatar : partnerAvatar;

  ConversationEntity copyWith({
    MessageEntity? lastMessage,
    DateTime? lastMessageAt,
    int? unreadCount,
    int? lastSeenSequence,
    Set<String>? typingUserIds,
    bool? isPartnerOnline,
    DateTime? partnerLastSeen,
    String? partnerName,
    String? partnerAvatar,
    bool? iBlockedThem,
    bool? theyBlockedMe,
  }) {
    return ConversationEntity(
      chatId: chatId,
      participantIds: participantIds,
      lastMessage: lastMessage ?? this.lastMessage,
      lastMessageAt: lastMessageAt ?? this.lastMessageAt,
      unreadCount: unreadCount ?? this.unreadCount,
      lastSeenSequence: lastSeenSequence ?? this.lastSeenSequence,
      typingUserIds: typingUserIds ?? this.typingUserIds,
      isGroup: isGroup,
      groupName: groupName,
      groupAvatar: groupAvatar,
      partnerName: partnerName ?? this.partnerName,
      partnerAvatar: partnerAvatar ?? this.partnerAvatar,
      partnerUserId: partnerUserId,
      partnerClerkId: partnerClerkId,
      isPartnerOnline: isPartnerOnline ?? this.isPartnerOnline,
      partnerLastSeen: partnerLastSeen ?? this.partnerLastSeen,
      iBlockedThem: iBlockedThem ?? this.iBlockedThem,
      theyBlockedMe: theyBlockedMe ?? this.theyBlockedMe,
    );
  }
}
