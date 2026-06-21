import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/network/api_endpoints.dart';

class CloudinaryService {

  CloudinaryService(this._apiClient) : _cloudinaryDio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 8),
      sendTimeout: const Duration(seconds: 45),
      receiveTimeout: const Duration(seconds: 45),
    ),
  );
  final ApiClient _apiClient;
  final Dio _cloudinaryDio;

  /// Gets a signed upload signature from the backend
  Future<Map<String, dynamic>> _getSignature(String folder, {CancelToken? cancelToken}) async {
    final response = await _apiClient.post<Map<String, dynamic>>(
      ApiEndpoints.cloudinarySign,
      data: {'folder': folder},
      parser: (data) => data as Map<String, dynamic>,
      cancelToken: cancelToken,
    );

    if (response.success && response.data != null) {
      return response.data!;
    }

    final reason = response.meta.reason;
    final message = response.error?.message;
    
    throw Exception(
      message ?? 'Signature Error: $reason',
    );
  }

  /// Uploads any file to Cloudinary as a raw resource (essential for E2EE binaries)
  Future<Map<String, dynamic>> uploadRaw(
    File file, {
    String folder = 'kovari-chat-media',
    void Function(int sent, int total)? onProgress,
    CancelToken? cancelToken,
  }) async {
    try {
      final signData = await _getSignature(folder, cancelToken: cancelToken);
      
      final String signature = signData['signature']?.toString() ?? '';
      final int timestamp = signData['timestamp'] is int
          ? signData['timestamp'] as int
          : int.tryParse(signData['timestamp']?.toString() ?? '') ?? 0;
      final String apiKey = signData['api_key']?.toString() ?? '';
      final String cloudName = signData['cloud_name']?.toString() ?? '';
      final String targetFolder = signData['folder']?.toString() ?? '';

      final fileName = file.path.split('/').last;
      final formData = FormData.fromMap({
        'file': await MultipartFile.fromFile(file.path, filename: fileName),
        'api_key': apiKey,
        'timestamp': timestamp.toString(),
        'signature': signature,
        'folder': targetFolder,
      });

      // For raw files (encrypted), we use /raw/upload
      final uploadUrl = 'https://api.cloudinary.com/v1_1/$cloudName/raw/upload';
      final response = await _cloudinaryDio.post(
        uploadUrl,
        data: formData,
        cancelToken: cancelToken,
        onSendProgress: onProgress,
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        return response.data as Map<String, dynamic>;
      }
      
      throw Exception('Cloudinary raw upload failed with status ${response.statusCode}');
    } catch (e) {
      if (e is DioException) {
        final errorMsg = e.response?.data?['error']?['message'] ?? e.message;
        throw Exception('Cloudinary Raw Upload Error: $errorMsg');
      }
      rethrow;
    }
  }

  /// Uploads an image file to Cloudinary using a signed request
  Future<Map<String, dynamic>> uploadImage(File file, {String folder = 'kovari-profiles', CancelToken? cancelToken}) async {
    try {
      // 1. Get signature from our backend
      final signData = await _getSignature(folder, cancelToken: cancelToken);
      
      final String signature = signData['signature']?.toString() ?? '';
      final int timestamp = signData['timestamp'] is int
          ? signData['timestamp'] as int
          : int.tryParse(signData['timestamp']?.toString() ?? '') ?? 0;
      final String apiKey = signData['api_key']?.toString() ?? '';
      final String cloudName = signData['cloud_name']?.toString() ?? '';
      final String targetFolder = signData['folder']?.toString() ?? '';

      // 2. Prepare multipart data for Cloudinary
      final fileName = file.path.split('/').last;
      final formData = FormData.fromMap({
        'file': await MultipartFile.fromFile(file.path, filename: fileName),
        'api_key': apiKey,
        'timestamp': timestamp.toString(),
        'signature': signature,
        'folder': targetFolder,
      });

      // 3. Post directly to Cloudinary
      final uploadUrl = 'https://api.cloudinary.com/v1_1/$cloudName/image/upload';
      final response = await _cloudinaryDio.post(
        uploadUrl,
        data: formData,
        cancelToken: cancelToken,
        onSendProgress: (sent, total) {
          // Optional: Add progress tracking if needed
        },
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        return response.data as Map<String, dynamic>;
      }
      
      throw Exception('Cloudinary upload failed with status ${response.statusCode}');
    } catch (e) {
      if (e is DioException) {
        final errorMsg = e.response?.data?['error']?['message'] ?? e.message;
        throw Exception('Cloudinary Upload Error: $errorMsg');
      }
      rethrow;
    }
  }
}

final cloudinaryServiceProvider = Provider<CloudinaryService>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return CloudinaryService(apiClient);
});
