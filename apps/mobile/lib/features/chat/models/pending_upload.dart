class PendingUpload {
  final String id; // clientMessageId / tempId
  final String conversationId; // chatId
  final String localFilePath;
  final String mimeType;
  final String? caption;
  final String mediaType; // 'image' | 'video'
  final DateTime createdAt;
  final int retryCount;

  PendingUpload({
    required this.id,
    required this.conversationId,
    required this.localFilePath,
    required this.mimeType,
    this.caption,
    required this.mediaType,
    required this.createdAt,
    this.retryCount = 0,
  });

  Map<String, dynamic> toJson() => {
    'id': id,
    'conversationId': conversationId,
    'localFilePath': localFilePath,
    'mimeType': mimeType,
    'caption': caption,
    'mediaType': mediaType,
    'createdAt': createdAt.toIso8601String(),
    'retryCount': retryCount,
  };

  factory PendingUpload.fromJson(Map<String, dynamic> json) => PendingUpload(
    id: json['id'] as String,
    conversationId: json['conversationId'] as String,
    localFilePath: json['localFilePath'] as String,
    mimeType: json['mimeType'] as String,
    caption: json['caption'] as String?,
    mediaType: json['mediaType'] as String,
    createdAt: DateTime.parse(json['createdAt'] as String),
    retryCount: json['retryCount'] as int? ?? 0,
  );
}
