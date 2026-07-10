import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:mobile/core/auth/session_manager.dart';
import 'package:mobile/core/auth/token_storage.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/network/api_endpoints.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/shared/models/kovari_user.dart';

/// Decodes the `exp` Unix timestamp (seconds) from a JWT access token.
/// Falls back to now + 15 minutes if decoding fails.
int _parseJwtExpiry(String accessToken) {
  try {
    final parts = accessToken.split('.');
    if (parts.length != 3) throw FormatException('Not a JWT');
    var payload = parts[1].replaceAll('-', '+').replaceAll('_', '/');
    while (payload.length % 4 != 0) {
      payload += '=';
    }
    final decoded = utf8.decode(base64Decode(payload));
    final map = jsonDecode(decoded) as Map<String, dynamic>;
    final exp = map['exp'] as int?;
    if (exp == null) throw FormatException('No exp claim');
    return exp * 1000; // JWT exp is seconds; convert to ms
  } catch (e) {
    AppLogger.w(
      '[AuthService] Failed to parse JWT exp: $e. Using 15-min fallback.',
    );
    return DateTime.now().millisecondsSinceEpoch + (15 * 60 * 1000);
  }
}

class AuthService {
  AuthService(this._apiClient, this._sessionManager);
  final ApiClient _apiClient;
  final TokenStorage _storage = TokenStorage();
  final SessionManager _sessionManager;
  final GoogleSignIn _googleSignIn = GoogleSignIn.instance;

  Future<KovariUser?> loginWithGoogle({CancelToken? cancelToken}) async {
    AppLogger.d('Starting Google Authentication flow...');
    final account = await _googleSignIn.authenticate();
    AppLogger.d(
      'Google Account retrieved: ${account.email}. Fetching tokens...',
    );
    final auth = account.authentication;
    final idToken = auth.idToken;

    if (idToken == null) {
      AppLogger.e(
        'Failed to retrieve Google ID Token from authentication result.',
      );
      throw Exception('Failed to retrieve Google ID Token');
    }

    AppLogger.i(
      'Google ID Token retrieved successfully (length: ${idToken.length}). Authenticating with backend...',
    );

    final response = await _apiClient.post<KovariUser>(
      ApiEndpoints.googleAuth,
      data: {'idToken': idToken},
      parser: parseAuthResponse,
      cancelToken: cancelToken,
    );

    if (response.success && response.data != null) {
      await _finalizeAuthentication(response.data!, response.raw);
      return response.data;
    }
    throw Exception(response.error?.message ?? 'Google Login failed');
  }

  Future<KovariUser?> loginWithEmail(
    String email,
    String password, {
    CancelToken? cancelToken,
  }) async {
    final response = await _apiClient.post<KovariUser>(
      ApiEndpoints.emailLogin,
      data: {'email': email, 'password': password},
      parser: parseAuthResponse,
      cancelToken: cancelToken,
    );

    if (response.success && response.data != null) {
      await _finalizeAuthentication(response.data!, response.raw);
      return response.data;
    }
    throw Exception(response.error?.message ?? 'Email Login failed');
  }

  Future<Map<String, dynamic>> registerWithEmail(
    String email,
    String password, {
    String? name,
    CancelToken? cancelToken,
  }) async {
    final response = await _apiClient.post<Map<String, dynamic>>(
      ApiEndpoints.emailRegister,
      data: {'email': email, 'password': password, 'name': name},
      parser: (data) => data as Map<String, dynamic>,
      cancelToken: cancelToken,
    );

    if (response.success && response.data != null) {
      final data = response.data!;
      if (data['verificationRequired'] == true) return data;

      final user = parseAuthResponse(data);
      await _finalizeAuthentication(user, data);
      return data;
    }
    throw Exception(response.error?.message ?? 'Registration failed');
  }

  Future<void> resendOtp(String email, {CancelToken? cancelToken}) async {
    final response = await _apiClient.post<void>(
      ApiEndpoints.resendOtp,
      data: {'email': email},
      parser: (_) {},
      cancelToken: cancelToken,
    );
    if (!response.success) {
      throw Exception(response.error?.message ?? 'OTP Resend failed');
    }
  }

  Future<void> requestPasswordReset(
    String email, {
    CancelToken? cancelToken,
  }) async {
    final response = await _apiClient.post<void>(
      ApiEndpoints.forgotPassword,
      data: {'email': email, 'platform': 'mobile'},
      parser: (_) {},
      cancelToken: cancelToken,
    );
    if (!response.success) {
      throw Exception(
        response.error?.message ?? 'Forgot Password request failed',
      );
    }
  }

  Future<void> resetPassword(
    String token,
    String newPassword, {
    CancelToken? cancelToken,
  }) async {
    final response = await _apiClient.post<void>(
      ApiEndpoints.resetPassword,
      data: {'token': token, 'newPassword': newPassword},
      parser: (_) {},
      cancelToken: cancelToken,
    );
    if (!response.success) {
      throw Exception(response.error?.message ?? 'Reset Password failed');
    }
  }

  Future<KovariUser> verifyOtp(
    String email,
    String code, {
    CancelToken? cancelToken,
  }) async {
    final response = await _apiClient.post<KovariUser>(
      ApiEndpoints.verifyOtp,
      data: {'email': email, 'code': code},
      parser: parseAuthResponse,
      cancelToken: cancelToken,
    );

    if (response.success && response.data != null) {
      await _finalizeAuthentication(response.data!, response.raw);
      return response.data!;
    }
    throw Exception(response.error?.message ?? 'OTP Verification failed');
  }

  Future<void> _finalizeAuthentication(KovariUser user, dynamic rawData) async {
    final responseData = rawData as Map<String, dynamic>;
    final data = responseData['data'] ?? responseData;

    final accessToken = data['accessToken'] as String;
    final refreshToken = data['refreshToken'] as String;
    // Parse the real expiry from the JWT exp claim.
    // The backend does NOT send an 'expiry' field, so data['expiry'] is always null.
    final expiry = _parseJwtExpiry(accessToken);
    AppLogger.i(
      '[AuthService] Token expiry parsed: ${DateTime.fromMillisecondsSinceEpoch(expiry)}',
    );

    await _storage.saveTokens(
      accessToken: accessToken,
      refreshToken: refreshToken,
      expiryTimestamp: expiry,
    );

    await _storage.saveUserData(jsonEncode(user.toJson()));
    _sessionManager.setAuthenticated(true);
    _sessionManager.setDisableRefresh(false);
  }

  KovariUser parseAuthResponse(dynamic data) {
    final responseData = data as Map<String, dynamic>;
    final innerData = responseData['data'] ?? responseData;
    final userMap = innerData['user'] as Map<String, dynamic>;
    return KovariUser.fromAuthResponse(userMap);
  }
}

final authServiceProvider = Provider((ref) {
  final apiClient = ref.watch(apiClientProvider);
  final session = ref.watch(sessionManagerProvider);
  return AuthService(apiClient, session);
});
