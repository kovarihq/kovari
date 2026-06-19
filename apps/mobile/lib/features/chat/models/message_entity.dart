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
    this.encryptedContent,
    this.encryptionIv,
    this.encryptionSalt,
    this.isEncrypted = false,
    this.conversationSequence,
    this.serverSequence,
    this.mediaUrl,
    this.mediaType,
    this.localFilePath,
    this.blurHash,
    this.thumbnailUrl,
    this.mediaUploadState = MediaUploadState.idle,
    this.uploadProgress = 0.0,
    this.senderClerkId,
    this.receiverClerkId,
  });

  /// Authoritative server-assigned ID. Null when optimistic.
  final String id;

  /// Chat room this message belongs to.
  final String chatId;

  /// Database UUID of sender.
  final String senderId;

  /// Clerk IDs for E2EE key derivation.
  final String? senderClerkId;
  final String? receiverClerkId;

  /// Local (ephemeral) ID used for optimistic reconciliation.
  final String? clientMessageId;

  final DateTime createdAt;

  /// Decrypted text content (after hydration).
  final String? text;

  /// Encrypted payload fields (from server).
  final String? encryptedContent;
  final String? encryptionIv;
  final String? encryptionSalt;
  final bool isEncrypted;

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
    String? encryptedContent,
    String? encryptionIv,
    String? encryptionSalt,
    bool? isEncrypted,
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
      encryptedContent: encryptedContent ?? this.encryptedContent,
      encryptionIv: encryptionIv ?? this.encryptionIv,
      encryptionSalt: encryptionSalt ?? this.encryptionSalt,
      isEncrypted: isEncrypted ?? this.isEncrypted,
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
      senderClerkId: senderClerkId ?? this.senderClerkId,
      receiverClerkId: receiverClerkId ?? this.receiverClerkId,
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
    String? senderClerkId,
    String? receiverClerkId,
  }) {
    return MessageEntity(
      id: 'pending_$clientMessageId',
      chatId: chatId,
      senderId: senderId,
      senderClerkId: senderClerkId,
      receiverClerkId: receiverClerkId,
      clientMessageId: clientMessageId,
      createdAt: DateTime.now(),
      text: text,
      mediaUrl: mediaUrl,
      mediaType: mediaType,
      localFilePath: localFilePath,
      blurHash: blurHash,
      deliveryStatus: MessageDeliveryStatus.pending,
      mediaUploadState: mediaUrl == null && localFilePath != null
          ? MediaUploadState.uploading
          : MediaUploadState.idle,
    );
  }

  factory MessageEntity.fromSocket(Map<String, dynamic> data, String chatId) {
    return MessageEntity(
      id:
          data['id'] as String? ??
          data['client_id'] as String? ??
          data['tempId'] as String? ??
          '',
      chatId: chatId,
      senderId:
          data['senderId'] as String? ?? data['sender_id'] as String? ?? '',
      senderClerkId: data['senderClerkId'] as String?,
      receiverClerkId: data['receiverClerkId'] as String?,
      clientMessageId:
          data['tempId'] as String? ?? data['client_id'] as String?,
      createdAt: data['createdAt'] != null
          ? DateTime.tryParse(data['createdAt'] as String) ?? DateTime.now()
          : (data['created_at'] != null
                ? DateTime.tryParse(data['created_at'] as String) ??
                      DateTime.now()
                : DateTime.now()),
      text: data['text'] as String?,
      encryptedContent:
          data['encryptedContent'] as String? ??
          data['encrypted_content'] as String?,
      encryptionIv:
          data['encryptionIv'] as String? ??
          data['encryption_iv'] as String? ??
          data['iv'] as String?,
      encryptionSalt:
          data['encryptionSalt'] as String? ??
          data['encryption_salt'] as String? ??
          data['salt'] as String?,
      isEncrypted:
          data['isEncrypted'] as bool? ??
          data['is_encrypted'] as bool? ??
          false,
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
      deliveryStatus: MessageDeliveryStatus.delivered,
    );
  }
}
