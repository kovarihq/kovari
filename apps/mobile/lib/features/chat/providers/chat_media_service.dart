import 'dart:io';
import 'dart:typed_data';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile/core/network/cloudinary_service.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/core/security/encryption_service.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/features/chat/models/message_entity.dart';
import 'package:mobile/features/chat/providers/chat_mutation_service.dart';
import 'package:mobile/features/chat/providers/message_store.dart';
import 'package:mobile/features/chat/providers/conversation_runtime_store.dart';
import 'package:mobile/features/chat/providers/conversation_store.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

class ChatMediaService {
  ChatMediaService(this._ref);
  final Ref _ref;
  final _uuid = const Uuid();

  /// Picks an image from gallery or camera and sends it with E2EE.
  Future<void> pickAndSendImage(String chatId, ImageSource source) async {
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: source,
      imageQuality: 70, // Bumble/Instagram style compression
    );

    if (file != null) {
      await _processAndSend(chatId, File(file.path), 'image');
    }
  }

  Future<void> _processAndSend(String chatId, File file, String type) async {
    final clientMessageId = _uuid.v4();
    final authUser = _ref.read(authProvider).user;
    if (authUser == null) return;

    final myUserId = authUser.resolvedUuid;
    if (myUserId == null) return; // Identity safety check

    final partnerClerkId = _ref
        .read(messageStoreProvider(chatId).notifier)
        .getPartnerClerkId();

    // 1. 💎 Instagram-Pro: Optimistic UI insertion
    _ref
        .read(messageStoreProvider(chatId).notifier)
        .addOptimistic(
          MessageEntity.optimistic(
            clientMessageId: clientMessageId,
            chatId: chatId,
            senderId: myUserId,
            localFilePath: file.path,
            mediaType: type,
            senderClerkId: authUser.id,
            receiverClerkId: partnerClerkId,
          ),
        );

    await _processAndSendWithId(chatId, file, type, clientMessageId);
  }

  Future<void> resumeUpload(String chatId, String clientMessageId, String localFilePath, String mediaType) async {
    AppLogger.d('🔄 [ChatMediaService] Resuming upload for message $clientMessageId ($localFilePath)');
    
    _ref.read(messageStoreProvider(chatId).notifier).updateUploadState('pending_$clientMessageId', MediaUploadState.uploading);
    _ref.read(messageStoreProvider(chatId).notifier).updateDeliveryStatus('pending_$clientMessageId', MessageDeliveryStatus.pending);

    await _processAndSendWithId(chatId, File(localFilePath), mediaType, clientMessageId);
  }

  Future<void> recoverBackgroundUploads() async {
    final conversations = _ref.read(conversationRuntimeStoreProvider);
    for (final chatId in conversations.keys) {
      final msgState = _ref.read(messageStoreProvider(chatId));
      for (final msg in msgState.messages.values) {
        if (msg.localFilePath != null &&
            (msg.mediaUploadState == MediaUploadState.uploading ||
             msg.mediaUploadState == MediaUploadState.failed)) {
          resumeUpload(
            chatId,
            msg.clientMessageId ?? msg.id.replaceFirst('pending_', ''),
            msg.localFilePath!,
            msg.mediaType ?? 'image',
          );
        }
      }
    }
  }

  Future<void> _processAndSendWithId(String chatId, File file, String type, String clientMessageId) async {
    final authUser = _ref.read(authProvider).user;
    if (authUser == null) return;

    final myUserId = authUser.resolvedUuid;
    if (myUserId == null) return;

    final partnerId = _getPartnerId(chatId, myUserId);
    final partnerClerkId = _ref
        .read(messageStoreProvider(chatId).notifier)
        .getPartnerClerkId();

    try {
      // 2. 🛡️ E2EE: Encrypt the file bytes
      final sharedSecret = chatId.replaceAll('_', ':');
      final bytes = await file.readAsBytes();
      final encrypted = await EncryptionService().encryptBytes(
        bytes,
        sharedSecret,
      );

      // Save encrypted bytes to a temp file for upload
      final tempDir = await getTemporaryDirectory();
      final encryptedFile = File('${tempDir.path}/enc_$clientMessageId');
      await encryptedFile.writeAsBytes(encrypted['cipherText'] as List<int>);

      // 3. ☁️ Upload: Send encrypted binary to Cloudinary
      final cloudinary = _ref.read(cloudinaryServiceProvider);
      final uploadResult = await cloudinary.uploadRaw(
        encryptedFile,
        onProgress: (sent, total) {
          final progress = sent / total;
          _ref
              .read(messageStoreProvider(chatId).notifier)
              .updateUploadProgress('pending_$clientMessageId', progress);
        },
      );

      final mediaUrl = uploadResult['secure_url'] as String;

      // 4. 🚀 Finalize: Send the socket payload with the encrypted URL/meta
      final payload = SendMessagePayload(
        chatId: chatId,
        clientMessageId: clientMessageId,
        senderId: myUserId,
        encryptedContent: '[Media Message]', // Placeholder for E2EE text
        mediaUrl: mediaUrl,
        mediaType: type,
        receiverId: partnerId,
        encryptionIv: EncryptionService().hexEncode(
          encrypted['iv'] as List<int>,
        ),
        encryptionSalt: EncryptionService().hexEncode(
          encrypted['salt'] as List<int>,
        ),
        senderClerkId: authUser.id,
        receiverClerkId: partnerClerkId,
      );

      await _ref
          .read(chatMutationServiceProvider)
          .sendProcessedMessage(
            chatId: chatId,
            clientMessageId: clientMessageId,
            payload: payload,
          );

      // 5. ✨ Clean State: Mark upload as complete
      _ref
          .read(messageStoreProvider(chatId).notifier)
          .updateUploadProgress('pending_$clientMessageId', 1.0);
      _ref
          .read(messageStoreProvider(chatId).notifier)
          .updateUploadState('pending_$clientMessageId', MediaUploadState.idle);

      // Cleanup
      if (await encryptedFile.exists()) await encryptedFile.delete();
    } catch (e, stack) {
      print('CRITICAL [ChatMediaService] Failed to send media: $e\n$stack');
      AppLogger.e(
        '[ChatMediaService] Failed to send media',
        error: e,
        stackTrace: stack,
      );
      _ref
          .read(messageStoreProvider(chatId).notifier)
          .updateUploadState(
            'pending_$clientMessageId',
            MediaUploadState.failed,
          );
      _ref
          .read(messageStoreProvider(chatId).notifier)
          .updateDeliveryStatus(
            'pending_$clientMessageId',
            MessageDeliveryStatus.failed,
          );
    }
  }

  String _getPartnerId(String chatId, String myId) {
    final ids = chatId.split('_');
    if (ids.length != 2) return '';
    return ids[0] == myId ? ids[1] : ids[0];
  }
}

final chatMediaServiceProvider = Provider<ChatMediaService>((ref) {
  return ChatMediaService(ref);
});
