import 'package:dio/dio.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/network/api_endpoints.dart';
import 'package:mobile/core/utils/api_error_handler.dart';

class ProfileService {
  ProfileService(this._apiClient);
  final ApiClient _apiClient;

  /// GET /api/profile/current
  /// Fetches the profile of the currently authenticated user.
  Future<Map<String, dynamic>?> getCurrentProfile({
    CancelToken? cancelToken,
    bool ignoreCache = false,
  }) async {
    try {
      final response = await _apiClient.get<Map<String, dynamic>?>(
        ApiEndpoints.currentProfile,
        parser: (data) {
          if (data is! Map<String, dynamic>) return null;
          // Robust unwrapping: handle both direct and nested 'profile' field
          return (data['profile'] as Map<String, dynamic>?) ?? data;
        },
        cancelToken: cancelToken,
        ignoreCache: ignoreCache,
      );

      // Allow degraded (cached) responses to proceed if we have data
      if (response.success && response.data != null) {
        return response.data;
      }
      return null;
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return null;
      rethrow;
    } catch (e) {
      rethrow;
    }
  }

  /// GET /api/profile/[userId]
  /// Fetches the profile of a specific user.
  Future<Map<String, dynamic>?> getProfileById(String userId) async {
    try {
      final response = await _apiClient.get<Map<String, dynamic>>(
        ApiEndpoints.profileDetail(userId),
        parser: (data) => data is Map<String, dynamic> ? data : {},
      );

      if (response.success && response.data != null) {
        return response.data;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /// POST /api/profile
  /// Creates or updates the user's profile.
  Future<void> updateProfile(
    Map<String, dynamic> profileData, {
    CancelToken? cancelToken,
  }) async {
    try {
      final response = await _apiClient.post<void>(
        ApiEndpoints.createProfile,
        data: profileData,
        parser: (_) {},
        cancelToken: cancelToken,
      );
      if (!response.success) {
        throw Exception('Failed to update profile');
      }
    } catch (e) {
      throw ApiErrorHandler.extractError(e);
    }
  }

  Future<void> acceptPolicies({
    required String termsVersion,
    required String privacyVersion,
    required String guidelinesVersion,
    CancelToken? cancelToken,
  }) async {
    try {
      final response = await _apiClient.post<void>(
        'settings/accept-policies',
        data: {
          'termsVersion': termsVersion,
          'privacyVersion': privacyVersion,
          'guidelinesVersion': guidelinesVersion,
        },
        parser: (_) {},
        cancelToken: cancelToken,
      );
      if (!response.success) {
        throw Exception('Failed to accept policies');
      }
    } catch (e) {
      throw ApiErrorHandler.extractError(e);
    }
  }

  /// POST /api/check-username
  /// Checks if a username is available.
  Future<bool> checkUsernameAvailable(
    String username, {
    CancelToken? cancelToken,
  }) async {
    if (username.trim().length < 3) return false;
    final response = await _apiClient.post<bool>(
      'check-username',
      data: {'username': username},
      cancelToken: cancelToken,
      parser: (data) {
        if (data is Map<String, dynamic>) {
          return data['available'] == true;
        }
        return false;
      },
    );
    return response.success && response.data == true;
  }
}
