/// Authoritative delivery state machine.
/// Transitions: pending → sent → delivered → seen → failed
enum MessageDeliveryStatus {
  pending,
  sent,
  delivered,
  seen,
  failed;

  bool get isFinal => this == seen || this == failed;
  bool get isOptimistic => this == pending;

  int get statePriority {
    switch (this) {
      case MessageDeliveryStatus.failed:
        return 0;
      case MessageDeliveryStatus.pending:
        return 1;
      case MessageDeliveryStatus.sent:
        return 2;
      case MessageDeliveryStatus.delivered:
        return 3;
      case MessageDeliveryStatus.seen:
        return 4;
    }
  }
}

/// Media upload state for Phase 11 readiness.
enum MediaUploadState { idle, uploading, uploaded, failed }

class MessageEntity {
  const MessageEntity({
    required this.id,
    required this.chatId,
    required this.senderId,
    required this.createdAt,
    required this.deliveryStatus,
    this.clientMessageId,
    this.text,
    this.conversationSequence,
    this.serverSequence,
    this.mediaUrl,
    this.mediaType,
    this.localFilePath,
    this.blurHash,
    this.thumbnailUrl,
    this.mediaUploadState = MediaUploadState.idle,
    this.uploadProgress = 0.0,
  });

  /// Authoritative server-assigned ID. Null when optimistic.
  final String id;

  /// Chat room this message belongs to.
  final String chatId;

  /// Database UUID of sender.
  final String senderId;

  /// Local (ephemeral) ID used for optimistic reconciliation.
  final String? clientMessageId;

  final DateTime createdAt;

  /// Plaintext content.
  final String? text;

  // --- Authoritative Ordering ---
  /// Monotonic per-conversation sequence number. PRIMARY sort key.
  final int? conversationSequence;

  /// Global server-wide sequence for cross-conversation ordering.
  final int? serverSequence;

  // --- Media (Phase 11 ready) ---
  final String? mediaUrl;
  final String? mediaType;
  final String? localFilePath;
  final String? blurHash;
  final String? thumbnailUrl;
  final MediaUploadState mediaUploadState;
  final double uploadProgress;

  // --- Delivery State Machine ---
  final MessageDeliveryStatus deliveryStatus;

  bool get isOptimistic => deliveryStatus == MessageDeliveryStatus.pending;

  MessageEntity copyWith({
    String? id,
    String? chatId,
    String? senderId,
    String? clientMessageId,
    DateTime? createdAt,
    String? text,
    int? conversationSequence,
    int? serverSequence,
    String? mediaUrl,
    String? mediaType,
    String? localFilePath,
    String? blurHash,
    String? thumbnailUrl,
    MediaUploadState? mediaUploadState,
    double? uploadProgress,
    MessageDeliveryStatus? deliveryStatus,
  }) {
    return MessageEntity(
      id: id ?? this.id,
      chatId: chatId ?? this.chatId,
      senderId: senderId ?? this.senderId,
      clientMessageId: clientMessageId ?? this.clientMessageId,
      createdAt: createdAt ?? this.createdAt,
      text: text ?? this.text,
      conversationSequence: conversationSequence ?? this.conversationSequence,
      serverSequence: serverSequence ?? this.serverSequence,
      mediaUrl: mediaUrl ?? this.mediaUrl,
      mediaType: mediaType ?? this.mediaType,
      localFilePath: localFilePath ?? this.localFilePath,
      blurHash: blurHash ?? this.blurHash,
      thumbnailUrl: thumbnailUrl ?? this.thumbnailUrl,
      mediaUploadState: mediaUploadState ?? this.mediaUploadState,
      uploadProgress: uploadProgress ?? this.uploadProgress,
      deliveryStatus: deliveryStatus ?? this.deliveryStatus,
    );
  }

  /// Builds an optimistic (pending) message entity for immediate UI display.
  factory MessageEntity.optimistic({
    required String clientMessageId,
    required String chatId,
    required String senderId,
    String? text,
    String? mediaUrl,
    String? mediaType,
    String? localFilePath,
    String? blurHash,
    String? thumbnailUrl,
  }) {
    return MessageEntity(
      id: 'pending_$clientMessageId',
      chatId: chatId,
      senderId: senderId,
      clientMessageId: clientMessageId,
      createdAt: DateTime.now(),
      text: text,
      mediaUrl: mediaUrl,
      mediaType: mediaType,
      localFilePath: localFilePath,
      blurHash: blurHash,
      thumbnailUrl: thumbnailUrl,
      deliveryStatus: MessageDeliveryStatus.pending,
      mediaUploadState: mediaUrl == null && localFilePath != null
          ? MediaUploadState.uploading
          : MediaUploadState.idle,
    );
  }

  factory MessageEntity.fromSocket(
    Map<String, dynamic> data,
    String chatId, {
    String? currentUserId,
  }) {
    final senderId =
        data['senderId'] as String? ?? data['sender_id'] as String? ?? '';

    return MessageEntity(
      id:
          data['id'] as String? ??
          data['client_id'] as String? ??
          data['tempId'] as String? ??
          '',
      chatId: chatId,
      senderId: senderId,
      clientMessageId:
          data['tempId'] as String? ?? data['client_id'] as String?,
      createdAt: data['createdAt'] != null
          ? DateTime.tryParse(data['createdAt'] as String) ?? DateTime.now()
          : (data['created_at'] != null
                ? DateTime.tryParse(data['created_at'] as String) ??
                      DateTime.now()
                : DateTime.now()),
      text: data['text'] as String? ?? data['messageContent'] as String? ?? data['message_content'] as String?,
      conversationSequence:
          data['conversationSequence'] as int? ??
          data['conversation_sequence'] as int?,
      serverSequence:
          data['serverSequence'] as int? ?? data['server_sequence'] as int?,
      mediaUrl: data['mediaUrl'] as String? ?? data['media_url'] as String?,
      mediaType: data['mediaType'] as String? ?? data['media_type'] as String?,
      blurHash: data['blurHash'] as String? ?? data['blur_hash'] as String?,
      thumbnailUrl:
          data['thumbnailUrl'] as String? ?? data['thumbnail_url'] as String?,
      deliveryStatus: _deliveryStatusFromPayload(data, senderId, currentUserId),
    );
  }

  static MessageDeliveryStatus _deliveryStatusFromPayload(
    Map<String, dynamic> data,
    String senderId,
    String? currentUserId,
  ) {
    final cachedStatus = data['deliveryStatus'] as String?;
    if (cachedStatus == 'seen') {
      return MessageDeliveryStatus.seen;
    }

    if (currentUserId != null && senderId == currentUserId) {
      final readAt = data['readAt'] ?? data['read_at'];
      if (readAt != null && readAt.toString().isNotEmpty) {
        return MessageDeliveryStatus.seen;
      }
    }
    return MessageDeliveryStatus.delivered;
  }

  Map<String, dynamic> toSocket() {
    return {
      'id': id,
      'chatId': chatId,
      'senderId': senderId,
      'tempId': clientMessageId,
      'createdAt': createdAt.toIso8601String(),
      'text': text,
      'conversationSequence': conversationSequence,
      'serverSequence': serverSequence,
      'mediaUrl': mediaUrl,
      'mediaType': mediaType,
      'blurHash': blurHash,
      'thumbnailUrl': thumbnailUrl,
      'deliveryStatus': deliveryStatus.name,
    };
  }
}

