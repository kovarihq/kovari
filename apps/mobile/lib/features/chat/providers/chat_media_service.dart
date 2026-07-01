import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile/core/network/cloudinary_service.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/features/chat/models/message_entity.dart';
import 'package:mobile/features/chat/models/pending_upload.dart';
import 'package:mobile/features/chat/providers/chat_mutation_service.dart';
import 'package:mobile/features/chat/providers/message_store.dart';
import 'package:mobile/features/chat/providers/conversation_runtime_store.dart';
import 'package:mobile/features/chat/providers/pending_upload_store.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

class UploadResult {
  final String secureUrl;
  final String publicId;
  final String resourceType;
  final int bytes;
  final String? encryptionIv;
  final String? encryptionSalt;

  UploadResult({
    required this.secureUrl,
    required this.publicId,
    required this.resourceType,
    required this.bytes,
    this.encryptionIv,
    this.encryptionSalt,
  });
}

class ChatMediaService {
  ChatMediaService(this._ref);
  final Ref _ref;
  final _uuid = const Uuid();

  /// Picks an image and uploads it
  Future<void> pickAndSendImage(String chatId, ImageSource source) async {
    final picker = ImagePicker();
    final XFile? file = await picker.pickImage(
      source: source,
      imageQuality: 70,
    );

    if (file != null) {
      final mimeType = file.mimeType ?? 'image/jpeg';
      await _processAndUpload(chatId, File(file.path), mimeType, 'image');
    }
  }

  /// Picks a video and uploads it
  Future<void> pickAndSendVideo(String chatId, ImageSource source) async {
    final picker = ImagePicker();
    final XFile? file = await picker.pickVideo(
      source: source,
      maxDuration: const Duration(minutes: 5),
    );

    if (file != null) {
      final mimeType = file.mimeType ?? 'video/mp4';
      await _processAndUpload(chatId, File(file.path), mimeType, 'video');
    }
  }

  /// Validates MIME type against expected formats
  bool _isValidMime(String mime, String expectedType) {
    final cleanMime = mime.toLowerCase();
    if (expectedType == 'image') {
      return cleanMime.startsWith('image/jpeg') ||
             cleanMime.startsWith('image/png') ||
             cleanMime.startsWith('image/gif');
    } else if (expectedType == 'video') {
      return cleanMime.startsWith('video/mp4') ||
             cleanMime.startsWith('video/quicktime');
    }
    return false;
  }

  /// Relocates file from OS temp to app documents directory so it survives restarts
  Future<File> _relocateToPersistent(File sourceFile, String filename) async {
    final docsDir = await getApplicationDocumentsDirectory();
    final uploadDir = Directory('${docsDir.path}/pending_uploads');
    if (!await uploadDir.exists()) {
      await uploadDir.create(recursive: true);
    }
    final targetPath = '${uploadDir.path}/$filename';
    return sourceFile.copy(targetPath);
  }

  Future<void> _processAndUpload(String chatId, File file, String mimeType, String type) async {
    // 1. Verify MIME type
    if (!_isValidMime(mimeType, type)) {
      AppLogger.w('⚠️ [ChatMediaService] Rejected unsupported MIME type: $mimeType for $type');
      return;
    }

    final clientMessageId = _uuid.v4();
    final authUser = _ref.read(authProvider).user;
    if (authUser == null) return;

    final myUserId = authUser.resolvedUuid;
    if (myUserId == null) return;

    // 2. Relocate to persistent store
    final persistentFile = await _relocateToPersistent(file, '${clientMessageId}_${file.path.split('/').last}');

    // 3. Persist the Upload Job
    final pendingUpload = PendingUpload(
      id: clientMessageId,
      conversationId: chatId,
      localFilePath: persistentFile.path,
      mimeType: mimeType,
      mediaType: type,
      createdAt: DateTime.now(),
    );
    await _ref.read(pendingUploadStoreProvider.notifier).save(pendingUpload);

    // 4. Generate local video thumbnail placeholder if type is video
    String? localThumbnailPath;
    if (type == 'video') {
      localThumbnailPath = persistentFile.path; // Stubbing path for instant preview
    }

    // 5. Trigger optimistic message bubble
    final partnerClerkId = _ref.read(messageStoreProvider(chatId).notifier).getPartnerClerkId();
    final optimistic = MessageEntity.optimistic(
      clientMessageId: clientMessageId,
      chatId: chatId,
      senderId: myUserId,
      localFilePath: persistentFile.path,
      mediaType: type,
      thumbnailUrl: localThumbnailPath,
    );
    _ref.read(messageStoreProvider(chatId).notifier).addOptimistic(optimistic);

    await _executeUploadJob(pendingUpload, persistentFile);
  }

  Future<void> resumeUpload(String chatId, String clientMessageId, String localFilePath, String mediaType) async {
    AppLogger.d('🔄 [ChatMediaService] Resuming upload for message $clientMessageId ($localFilePath)');
    
    _ref.read(messageStoreProvider(chatId).notifier).updateUploadState('pending_$clientMessageId', MediaUploadState.uploading);
    _ref.read(messageStoreProvider(chatId).notifier).updateDeliveryStatus('pending_$clientMessageId', MessageDeliveryStatus.pending);

    final pending = _ref.read(pendingUploadStoreProvider).get(clientMessageId) ?? PendingUpload(
      id: clientMessageId,
      conversationId: chatId,
      localFilePath: localFilePath,
      mimeType: mediaType == 'image' ? 'image/jpeg' : 'video/mp4',
      mediaType: mediaType,
      createdAt: DateTime.now(),
    );

    await _executeUploadJob(pending, File(localFilePath));
  }

  Future<void> recoverBackgroundUploads() async {
    final store = _ref.read(pendingUploadStoreProvider);
    if (!store.isInitialized) return;

    for (final upload in store.allPending) {
      resumeUpload(
        upload.conversationId,
        upload.id,
        upload.localFilePath,
        upload.mediaType,
      );
    }
  }

  Future<void> _executeUploadJob(PendingUpload job, File persistentFile) async {
    final chatId = job.conversationId;
    final clientMessageId = job.id;
    final type = job.mediaType;

    try {
      if (!await persistentFile.exists()) {
        throw Exception('Source media file no longer exists at ${persistentFile.path}');
      }

      UploadResult result;

      AppLogger.d('[ChatMediaService] Uploading raw media.');
      
      final cloudinary = _ref.read(cloudinaryServiceProvider);
      final Map<String, dynamic> uploadResult;
      
      if (type == 'video') {
        uploadResult = await cloudinary.uploadVideo(
          persistentFile,
          onProgress: (sent, total) {
            final progress = sent / total;
            _ref.read(messageStoreProvider(chatId).notifier)
                .updateUploadProgress('pending_$clientMessageId', progress);
          },
        );
      } else {
        uploadResult = await cloudinary.uploadImage(
          persistentFile,
          folder: 'kovari-chat-media',
          cancelToken: null,
        );
      }

      // Validate Cloudinary payload structure
      final secureUrl = uploadResult['secure_url'] as String?;
      final publicId = uploadResult['public_id'] as String?;
      final bytes = uploadResult['bytes'] as int?;
      final resourceType = uploadResult['resource_type'] as String?;

      if (secureUrl == null || publicId == null || bytes == null || bytes <= 0) {
        throw Exception('Cloudinary upload response validation failed: missing key parameters');
      }

      // Log debug fields — not part of UploadResult contract but useful for debugging
      AppLogger.d(
        '[ChatMediaService] Cloudinary upload OK '
        '| etag=${uploadResult["etag"]} '
        '| asset_id=${uploadResult["asset_id"]} '
        '| version=${uploadResult["version"]}',
      );

      result = UploadResult(
        secureUrl: secureUrl,
        publicId: publicId,
        resourceType: resourceType ?? type,
        bytes: bytes,
      );

      // 7. Dispatch to mutation service to build and send the message
      await _ref.read(chatMutationServiceProvider).sendMediaMessage(
        chatId: chatId,
        clientMessageId: clientMessageId,
        uploadResult: result,
        mediaType: type,
      );

      // Clean up job and relocated local file upon success
      await _ref.read(pendingUploadStoreProvider.notifier).delete(clientMessageId);
      if (await persistentFile.exists()) {
        await persistentFile.delete();
      }

      _ref.read(messageStoreProvider(chatId).notifier)
          .updateUploadProgress('pending_$clientMessageId', 1.0);
      _ref.read(messageStoreProvider(chatId).notifier)
          .updateUploadState('pending_$clientMessageId', MediaUploadState.idle);

    } catch (e, stack) {
      AppLogger.e('[ChatMediaService] Failed to upload/send media', error: e, stackTrace: stack);
      _ref.read(messageStoreProvider(chatId).notifier)
          .updateUploadState('pending_$clientMessageId', MediaUploadState.failed);
      _ref.read(messageStoreProvider(chatId).notifier)
          .updateDeliveryStatus('pending_$clientMessageId', MessageDeliveryStatus.failed);
    }
  }
}

final chatMediaServiceProvider = Provider<ChatMediaService>((ref) {
  return ChatMediaService(ref);
});
