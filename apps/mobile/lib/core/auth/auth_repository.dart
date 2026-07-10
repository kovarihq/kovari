import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:dio/dio.dart' as dio;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/auth/session_manager.dart';
import 'package:mobile/core/auth/token_storage.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/network/api_endpoints.dart';
import 'package:mobile/core/providers/cache_provider.dart';
import 'package:mobile/core/providers/connectivity_provider.dart';
import 'package:mobile/core/utils/app_logger.dart';

/// Decodes the `exp` Unix timestamp (seconds) from a JWT access token.
/// Falls back to [fallbackMs] if decoding fails (default: now + 15 minutes).
int _parseJwtExpiry(String accessToken, {int? fallbackMs}) {
  try {
    final parts = accessToken.split('.');
    if (parts.length != 3) throw FormatException('Not a JWT');
    // JWT base64url → standard base64
    var payload = parts[1].replaceAll('-', '+').replaceAll('_', '/');
    // Pad to a multiple of 4
    while (payload.length % 4 != 0) {
      payload += '=';
    }
    final decoded = utf8.decode(base64Decode(payload));
    final map = jsonDecode(decoded) as Map<String, dynamic>;
    final exp = map['exp'] as int?;
    if (exp == null) throw FormatException('No exp claim');
    // JWT exp is in seconds — convert to milliseconds
    return exp * 1000;
  } catch (e) {
    AppLogger.w('Failed to parse JWT exp claim: $e. Using fallback expiry.');
    return fallbackMs ??
        DateTime.now().millisecondsSinceEpoch + (15 * 60 * 1000);
  }
}

class AuthRepository {
  AuthRepository(this._storage, this._sessionManager, this._ref)
    : _refreshDio = Dio(
        BaseOptions(
          baseUrl: Env.apiBaseUrl,
          connectTimeout: const Duration(seconds: 10),
          receiveTimeout: const Duration(seconds: 10),
        ),
      );
  final TokenStorage _storage;
  final SessionManager _sessionManager;
  final Ref _ref;

  int _recoveryAttempts = 0;
  final Dio _refreshDio;

  /// Single-flight Refresh with deterministic recovery
  Future<void> refreshToken({String? requestId}) async {
    // 1. Global Single-Flight Guard
    if (_sessionManager.isRefreshing) {
      await _sessionManager.waitForRefresh();
      return;
    }

    // 2. Blacklist Guard
    if (_sessionManager.disableRefresh) {
      throw AuthFailure(AuthFailure.refreshDisabled);
    }

    // 3. Cooldown & Circuit Breaker Guard
    if (_sessionManager.isCircuitOpen) {
      AppLogger.w('[$requestId] Refresh blocked: Circuit Breaker is OPEN');
      throw AuthFailure('CIRCUIT_OPEN');
    }

    if (_sessionManager.shouldCooldown()) {
      AppLogger.w('[$requestId] Refresh blocked by cooldown window');
      return;
    }

    // Severe Expiry Override removed to allow standard refresh token lifetime (7 days)

    _sessionManager.startRefreshing();
    final startTime = DateTime.now();
    final waitersAtStart = _sessionManager.waitersCount;

    try {
      final refreshToken = await _storage.getRefreshToken();
      if (refreshToken == null) throw AuthFailure(AuthFailure.invalidToken);

      // 4.5 Connectivity Health Check (Fast Ping with Single-Flight Deduplication)
      // NOTE: We use a plain OfflineException here — NOT AuthFailure — so a
      // connectivity blip routes to degraded mode, never to logout().
      if (requestId != 'BOOTSTRAP-REFRESH') {
        try {
          await _sessionManager.performHealthCheck(() async {
            // GET api/health returns 200 when reachable. Redirects (3xx) are
            // also fine — they prove the network is up.
            await _refreshDio
                .get<dynamic>(
                  'health',
                  options: dio.Options(
                    followRedirects: true,
                    validateStatus: (s) => s != null && s < 500,
                  ),
                )
                .timeout(const Duration(seconds: 3));
          });
        } catch (e) {
          AppLogger.w(
            '[$requestId] Connectivity check failed. Entering degraded mode.',
          );
          _sessionManager.setDegraded(true);
          // Throw a plain exception so the catch block enters degraded mode
          // rather than triggering logout().
          throw _OfflineException();
        }
      }

      AppLogger.i(
        '🚀 [$requestId] Initiating token refresh (waiters: $waitersAtStart)',
      );

      final response = await _refreshDio
          .post<dynamic>(
            ApiEndpoints.refresh,
            data: {'refreshToken': refreshToken},
          )
          .timeout(
            const Duration(seconds: 10),
            onTimeout: () {
              throw RefreshTimeoutException();
            },
          );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = response.data['data'] ?? response.data;
        final newAccess = data['accessToken'] as String;
        final newRefresh = data['refreshToken'] as String;
        // Parse expiry directly from the JWT exp claim so we don't rely on
        // the backend sending an 'expiry' field (it doesn't).
        final expiry = _parseJwtExpiry(newAccess);
        AppLogger.d(
          '[$requestId] Token expiry parsed: ${DateTime.fromMillisecondsSinceEpoch(expiry)}',
        );

        // Atomic Token Write Guard
        if (_sessionManager.isLoggingOut ||
            (!_sessionManager.isAuthenticated &&
                requestId != 'BOOTSTRAP-REFRESH')) {
          AppLogger.w(
            '[$requestId] Discarding refresh result: session invalid/logout in progress',
          );
          _sessionManager.completeRefresh();
          return;
        }

        await _storage.saveTokens(
          accessToken: newAccess,
          refreshToken: newRefresh,
          expiryTimestamp: expiry,
        );

        _recoveryAttempts = 0; // Successful refresh resets budget
        _sessionManager.completeRefresh();
        _sessionManager.setDegraded(false);

        final duration = DateTime.now().difference(startTime).inMilliseconds;
        AppLogger.i(
          '✅ [$requestId] Refresh successful ($duration ms, waiters handled: $waitersAtStart)',
        );
      } else if (response.statusCode == 401 || response.statusCode == 403) {
        throw AuthFailure(AuthFailure.invalidToken);
      } else {
        throw DioException(
          requestOptions: response.requestOptions,
          response: response,
          type: DioExceptionType.badResponse,
        );
      }
    } catch (e) {
      final duration = DateTime.now().difference(startTime).inMilliseconds;
      AppLogger.e('❌ [$requestId] Refresh failed after $duration ms', error: e);

      // Only force logout on hard auth rejections from the server (401/403)
      // or if the refresh token itself is explicitly invalid/expired.
      // NEVER logout on:
      //   • Network/connectivity errors (_OfflineException)
      //   • Socket auth errors (SOCKET-CONN-REFRESH caller)
      //   • Transient DioExceptions (timeout, connection refused, etc.)
      final isHardAuthFailure =
          (e is AuthFailure &&
              e.reason != 'CIRCUIT_OPEN' &&
              e.reason != AuthFailure.severeExpiry) &&
          e is! _OfflineException;
      final isServerAuthRejection =
          e is DioException &&
          (e.response?.statusCode == 401 || e.response?.statusCode == 403);

      if ((isHardAuthFailure || isServerAuthRejection) &&
          requestId != 'SOCKET-CONN-REFRESH') {
        _sessionManager.failRefresh(e);
        await logout(reason: 'REFRESH_FAILURE');
      } else {
        // Transient / connectivity / socket errors → degraded mode, NOT logout.
        _sessionManager.failRefresh(e);
        _sessionManager.setDegraded(true);
      }
      rethrow;
    }
  }

  /// Reset recovery attempts on successful authenticated API response
  void resetRecoveryBudget() {
    if (_recoveryAttempts != 0) {
      AppLogger.d('Resetting recovery attempts budget');
      _recoveryAttempts = 0;
    }
  }

  Future<void> logout({String? reason}) async {
    if (_sessionManager.isLoggingOut) return;

    AppLogger.i('🚪 Initiating logout. Reason: ${reason ?? "User requested"}');
    _sessionManager.setLoggingOut(true);

    try {
      _sessionManager.cancelAllRequests('Logout initiated');
      _sessionManager.setAuthenticated(false);
      _sessionManager.setDegraded(false);
      _sessionManager.setDisableRefresh(true); // Permanent block until login

      // Best effort server logout
      final refreshToken = await _storage.getRefreshToken();
      if (refreshToken != null) {
        unawaited(
          _refreshDio
              .post<dynamic>(
                ApiEndpoints.logout,
                data: {'refreshToken': refreshToken},
              )
              .timeout(const Duration(seconds: 2))
              .catchError(
                (_) => Response<dynamic>(requestOptions: RequestOptions()),
              ),
        );
      }

      await _storage.clear();
      await _ref.read(localCacheProvider).clearAll();
    } finally {
      _sessionManager.setLoggingOut(false);
    }
  }

  /// Automated Offline Recovery
  void setupRecoveryListener() {
    _ref.listen(connectivityProvider, (previous, next) {
      if (next.isOnline && previous?.status != ConnectionStatus.online) {
        // Connectivity Restored or Backend Reachable again
        final wasDegraded = _sessionManager.isDegraded;
        _sessionManager.setDegraded(false);

        if (wasDegraded) {
          AppLogger.i(
            '🌐 Connectivity restored. Triggering auto-refresh recovery.',
          );
          // Add jitter to avoid thundering herd
          unawaited(
            Future<void>.delayed(
              Duration(milliseconds: 300 + (DateTime.now().millisecond % 300)),
              () {
                _recoveryAttempts++;
                unawaited(
                  refreshToken(requestId: 'RECOVERY-AUTO').catchError((_) {
                    // Keep error handling silent for auto-recovery pings
                  }),
                );
              },
            ),
          );
        }
      }
    });
  }

  /// Session Bootstrap Lock
  Future<void> ensureSessionReady() async {
    final startTime = DateTime.now();
    try {
      final accessToken = await _storage.getAccessToken();
      final hasTokens = accessToken != null;

      AppLogger.d('🔍 [Bootstrap] Checking tokens... Found: $hasTokens');

      if (!hasTokens) {
        _sessionManager.setAuthenticated(false);
        return;
      }

      // If expired or expiring soon, try a silent refresh using the refresh token
      if (await _storage.isExpired() || await _storage.isExpiringSoon()) {
        AppLogger.i(
          '🔍 [Bootstrap] Tokens expired or expiring soon. Attempting silent refresh...',
        );
        try {
          await refreshToken(
            requestId: 'BOOTSTRAP-REFRESH',
          ).timeout(const Duration(seconds: 5));
        } catch (e) {
          AppLogger.w(
            'Bootstrap refresh failed/timed out ($e). Checking if still authenticated...',
          );
          // If the bootstrap refresh failed due to a hard auth rejection (which triggers logout()),
          // the tokens are cleared and we are no longer authenticated. Exit immediately.
          final tokenCheck = await _storage.getAccessToken();
          if (tokenCheck == null) {
            AppLogger.w(
              '🔍 [Bootstrap] Tokens cleared during refresh failure. Bootstrapping as unauthenticated.',
            );
            _sessionManager.setAuthenticated(false);
            return;
          }
          _sessionManager.setDegraded(true);
        }
      }

      AppLogger.i('🔍 [Bootstrap] Session validated. Marking authenticated.');
      _sessionManager.setAuthenticated(true);
    } finally {
      final duration = DateTime.now().difference(startTime).inMilliseconds;
      AppLogger.i('⏱️ Session bootstrap complete ($duration ms)');
    }
  }
}

final authRepositoryProvider = Provider((ref) {
  final storage = TokenStorage();
  final session = ref.watch(sessionManagerProvider);
  final repo = AuthRepository(storage, session, ref);
  repo.setupRecoveryListener();
  return repo;
});

/// Private exception used to signal connectivity failure.
/// Using a dedicated type prevents it from being treated as an [AuthFailure]
/// in the catch block, which would trigger logout unnecessarily.
class _OfflineException implements Exception {
  const _OfflineException();
}
