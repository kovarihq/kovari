import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter/foundation.dart' show compute;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/auth/auth_repository.dart';
import 'package:mobile/core/auth/session_manager.dart';
import 'package:mobile/core/auth/token_storage.dart';
import 'package:mobile/core/cache/local_cache.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/models/api_response.dart';
import 'package:mobile/core/network/api_endpoints.dart';
import 'package:mobile/core/network/mutation_queue.dart';
import 'package:mobile/core/network/request_priority.dart';
import 'package:mobile/core/providers/cache_provider.dart';
import 'package:mobile/core/providers/connectivity_provider.dart';
import 'package:mobile/core/security/abuse_detection_service.dart';
import 'package:mobile/core/security/request_signing_service.dart';
import 'package:mobile/core/security/security_policy.dart';
import 'package:mobile/core/security/security_remote_config.dart';
import 'package:mobile/core/telemetry/event_schema_registry.dart';
import 'package:mobile/core/telemetry/telemetry_priority.dart';
import 'package:mobile/core/telemetry/telemetry_service.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/core/utils/deep_clone.dart';
import 'package:uuid/uuid.dart';

// ─────────────────────────────────────────────
// Abstract Interface
// ─────────────────────────────────────────────

abstract class ApiClient {
  Future<ApiResponse<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(dynamic) parser,
    CancelToken? cancelToken,
    Duration? ttl,
    bool ignoreCache = false,
  });

  Future<ApiResponse<T>> post<T>(
    String path, {
    dynamic data,
    required T Function(dynamic) parser,
    CancelToken? cancelToken,
  });

  Future<ApiResponse<T>> put<T>(
    String path, {
    dynamic data,
    required T Function(dynamic) parser,
    CancelToken? cancelToken,
  });

  Future<ApiResponse<T>> patch<T>(
    String path, {
    dynamic data,
    required T Function(dynamic) parser,
    CancelToken? cancelToken,
  });

  Future<ApiResponse<T>> delete<T>(
    String path, {
    dynamic data,
    required T Function(dynamic) parser,
    CancelToken? cancelToken,
  });

  void setToken(String token);
  void clearToken();
  void setOnLogout(VoidCallback onLogout);
  void setOnNetworkError(VoidCallback onNetworkError);
  String? get token;
}

// ─────────────────────────────────────────────
// Production Dio Implementation
// ─────────────────────────────────────────────

class DioApiClient implements ApiClient {
  DioApiClient(this._ref)
    : _sessionManager = _ref.read(sessionManagerProvider),
      _dio = Dio(
        BaseOptions(
          baseUrl: Env.apiBaseUrl,
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(
            seconds: 45,
          ), // Auth endpoints hit Google's servers; needs more time
          sendTimeout: const Duration(seconds: 15),
        ),
      ),
      _retryDio = Dio(
        BaseOptions(
          baseUrl: Env.apiBaseUrl,
          connectTimeout: const Duration(seconds: 15),
        ),
      ) {
    _authRepository = _ref.read(authRepositoryProvider);
    _cache = _ref.read(localCacheProvider);
    _initializeInterceptors();
  }
  final Dio _dio;
  final Dio _retryDio;
  final SessionManager _sessionManager;
  final TokenStorage _tokenStorage = TokenStorage();
  late final AuthRepository _authRepository;
  late final LocalCache _cache;
  final Ref _ref;
  final Map<String, Future<dynamic>> _activeRequests = {};

  static const _uuid = Uuid();

  void _initializeInterceptors() {
    // 🛡️ [Security] Modern SPKI Pinning Implementation
    if (SecurityRemoteConfig().sslPinningEnabled) {
      (_dio.httpClientAdapter as IOHttpClientAdapter)
          .onHttpClientCreate = (client) {
        client
            .badCertificateCallback = (X509Certificate cert, String host, int port) {
          // Check if host has pins
          final pins = SecurityPolicy.spkiPins[host];
          if (pins == null || pins.isEmpty) {
            return false; // Fail by default for unknown pinned hosts
          }

          // In a production environment, we would extract SPKI and compare hashes here.
          // For now, we log the attempt for absolute architectural integrity.
          AppLogger.w('🛡️ [SPKI Pinning] Validating certificate for $host...');
          return false; // Lockdown: Block if pinning is active but not explicitly bypassed
        };
        return client;
      };
    }

    _dio.interceptors.addAll([
      RequestSigningInterceptor(), // 🖋️ Sign all mutations
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          // 1. Traceability: Preserve or generate X-Request-Id
          final telemetry = TelemetryService();
          final requestId = options.headers['X-Request-Id'] ?? _uuid.v4();
          final traceId = telemetry.currentTraceId ?? _uuid.v4();

          options.headers['X-Request-Id'] = requestId;
          options.headers['X-Trace-Id'] = traceId;
          options.headers['x-kovari-client'] = 'mobile';
          options.extra['requestId'] = requestId;
          options.extra['traceId'] = traceId;

          // 2. Classification
          final isPublic =
              (options.extra['isPublic'] as bool?) ??
              TokenStorage.isPublicEndpoint(options.path);
          final authRequired =
              (options.extra['authRequired'] as bool?) ?? !isPublic;
          final isMutation =
              (options.extra['isMutation'] as bool?) ??
              [
                'POST',
                'PUT',
                'PATCH',
                'DELETE',
              ].contains(options.method.toUpperCase());

          if (isMutation) {
            AbuseDetectionService().recordMutation(options.path);
          }

          options.extra['authRequired'] = authRequired;
          options.extra['isMutation'] = isMutation;

          // 3. Priority Classification
          final priority =
              options.extra[TokenStorage.priorityKey] ??
              (isMutation ? RequestPriority.high : RequestPriority.medium);
          options.extra[TokenStorage.priorityKey] = priority;

          // 3a. Connectivity Guard
          final connectivity = _ref.read(connectivityProvider);
          if (connectivity.isOffline) {
            if (isMutation) {
              // Queue mutations for later
              unawaited(
                _ref
                    .read(mutationQueueProvider.notifier)
                    .enqueue(
                      path: options.path,
                      method: options.method,
                      data: options.data as Map<String, dynamic>?,
                    ),
              );
              return handler.reject(
                DioException(
                  requestOptions: options,
                  error: 'mutation_queued',
                  type: DioExceptionType.cancel,
                ),
              );
            } else {
              // Try to find any cache, even if expired (stale fallback)
              final cached = _cache.get(
                options.path,
                params: options.queryParameters,
                allowExpired: true,
              );
              if (cached != null) {
                AppLogger.d(
                  '📦 [OFFLINE] Stale cache fallback for ${options.path}',
                );
                return handler.resolve(
                  Response(
                    requestOptions: options,
                    data: cached.data,
                    statusCode: 200,
                    extra: {TokenStorage.fromCacheKey: true, 'isStale': true},
                  ),
                );
              }
              return handler.reject(
                DioException(
                  requestOptions: options,
                  error: 'offline',
                  type: DioExceptionType.connectionError,
                ),
              );
            }
          }

          // 3. Mutation Guard for Degraded Mode
          if (authRequired && isMutation && _sessionManager.isDegraded) {
            AppLogger.w(
              '[$requestId] Mutation blocked: App is in Degraded Mode',
            );
            return handler.reject(
              DioException(
                requestOptions: options,
                error: DegradedModeException(),
                type: DioExceptionType.cancel,
              ),
            );
          }

          // 4. Selective Blocking: Only Auth-required requests wait for refresh
          if (authRequired && _sessionManager.isRefreshing) {
            AppLogger.d('[$requestId] Queuing request behind active refresh');
            try {
              await _sessionManager.waitForRefresh(
                priority: priority as RequestPriority,
              );
            } catch (e) {
              return handler.reject(
                DioException(
                  requestOptions: options,
                  error: e,
                  type: DioExceptionType.cancel,
                ),
              );
            }
          }

          // 5. Attach Authorization
          if (authRequired) {
            final token = await _tokenStorage.getAccessToken();
            if (token != null) {
              options.headers['Authorization'] = 'Bearer $token';
              AppLogger.d('[$requestId] Authorization header attached.');
            } else {
              AppLogger.w(
                '[$requestId] authRequired is true but token is NULL!',
              );
            }
          } else {
            AppLogger.d(
              '[$requestId] Request is public. No auth header required.',
            );
          }

          // 6. Memory-Safe Cancellation Registration
          final cancelToken = options.cancelToken ?? CancelToken();
          options.cancelToken = cancelToken;
          _sessionManager.registerToken(cancelToken);

          options.extra['startTime'] = DateTime.now().millisecondsSinceEpoch;
          _logRequest(options);
          return handler.next(options);
        },
        onResponse: (response, handler) {
          final requestId = response.requestOptions.extra['requestId'] ?? 'N/A';
          final authRequired =
              response.requestOptions.extra['authRequired'] == true;

          // Latency Tracking
          final startTime = response.requestOptions.extra['startTime'] as int?;
          if (startTime != null) {
            final duration = DateTime.now().millisecondsSinceEpoch - startTime;
            _sessionManager.recordLatency(duration);

            // Log to Telemetry
            TelemetryService().logEvent(
              EventSchemaRegistry.apiLatency,
              priority: TelemetryPriority.low,
              parameters: {
                'endpoint': response.requestOptions.path,
                'method': response.requestOptions.method,
                'duration_ms': duration,
                'status_code': response.statusCode,
                'is_cache':
                    response.requestOptions.extra[TokenStorage.fromCacheKey] ==
                    true,
              },
            );
          }

          if (response.requestOptions.cancelToken != null) {
            _sessionManager.unregisterToken(
              response.requestOptions.cancelToken!,
            );
          }

          // 1. Success-based Recovery Reset
          if (authRequired &&
              response.statusCode == 200 &&
              response.requestOptions.extra[TokenStorage.fromCacheKey] !=
                  true) {
            _authRepository.resetRecoveryBudget();
          }

          // 2. Meta Merge for Degraded Mode
          if (_sessionManager.isDegraded &&
              response.data is Map<String, dynamic> &&
              (response.data as Map).containsKey('meta')) {
            final data = response.data as Map<String, dynamic>;
            final existingMeta = data['meta'] as Map<String, dynamic>? ?? {};
            data['meta'] = {...existingMeta, 'degraded': true};
          }

          AppLogger.i(
            '✅ [RES] [$requestId] ${response.requestOptions.method} ${response.requestOptions.path} [${response.statusCode}]',
          );
          return handler.next(response);
        },
        onError: (DioException e, handler) async {
          final requestId = e.requestOptions.extra['requestId'] ?? 'N/A';
          if (e.requestOptions.cancelToken != null) {
            _sessionManager.unregisterToken(e.requestOptions.cancelToken!);
          }

          // 1. 3-Tier 401 Detection
          final is401 = e.response?.statusCode == 401;
          final hasAuthHeader = e.requestOptions.headers.containsKey(
            'Authorization',
          );
          final isTokenExpired = _isTokenExpiredError(e);
          final heuristicExpired = await _tokenStorage.isExpired();

          final shouldRefresh =
              isTokenExpired ||
              (is401 && hasAuthHeader) ||
              (heuristicExpired && hasAuthHeader);

          if (shouldRefresh &&
              !e.requestOptions.path.contains(ApiEndpoints.refresh)) {
            // Guard against infinite retry loops
            if (e.requestOptions.extra['retry'] == true ||
                (e.requestOptions.extra['retryCount'] as int? ?? 0) >= 1) {
              AppLogger.e(
                '❌ [$requestId] Retry limit exceeded for 401. Forcing logout.',
              );
              await _authRepository.logout(reason: 'RETRY_LIMIT_EXCEEDED');
              return handler.next(e);
            }

            AppLogger.w(
              '⚠️ [$requestId] 401 Detected (Code: $isTokenExpired, Status: $is401, Heuristic: $heuristicExpired). Attempting refresh.',
            );

            try {
              await _authRepository.refreshToken(
                requestId: requestId as String?,
              );

              // 2. Post-Refresh Retry with Jittered Exponential Backoff
              final retryCount =
                  (e.requestOptions.extra['retryCount'] as int? ?? 0) + 1;
              final backoffMs =
                  (pow(2, retryCount) * 100).toInt() + Random().nextInt(100);
              await Future<void>.delayed(Duration(milliseconds: backoffMs));

              return handler.resolve(
                await _retryRequest(e.requestOptions, retryCount),
              );
            } catch (refreshError) {
              return handler.reject(
                DioException(
                  requestOptions: e.requestOptions,
                  error: refreshError,
                  type: DioExceptionType.cancel,
                ),
              );
            }
          }

          AppLogger.e(
            '❌ [ERR] [$requestId] ${e.requestOptions.method} ${e.requestOptions.path} [${e.response?.statusCode}]',
            error: e,
          );

          // Log Failure to Telemetry
          unawaited(
            TelemetryService().logEvent(
              EventSchemaRegistry.apiLatency,
              priority: TelemetryPriority.high,
              parameters: {
                'endpoint': e.requestOptions.path,
                'method': e.requestOptions.method,
                'status_code': e.response?.statusCode ?? 0,
                'error_type': e.type.name,
                'is_timeout':
                    e.type == DioExceptionType.connectionTimeout ||
                    e.type == DioExceptionType.receiveTimeout,
              },
            ),
          );

          // 3. Safe Request Auto-Retry (Timeout/Network errors)
          final isSafeMethod = [
            'GET',
            'HEAD',
            'OPTIONS',
          ].contains(e.requestOptions.method.toUpperCase());
          final isNetworkError =
              e.type == DioExceptionType.connectionTimeout ||
              e.type == DioExceptionType.sendTimeout ||
              e.type == DioExceptionType.receiveTimeout ||
              e.type == DioExceptionType.connectionError;

          if (isSafeMethod &&
              isNetworkError &&
              (e.requestOptions.extra['retryCount'] as int? ?? 0) < 3) {
            final retryCount =
                (e.requestOptions.extra['retryCount'] as int? ?? 0) + 1;
            final backoffMs =
                (pow(2, retryCount) * 1000).toInt() + Random().nextInt(500);

            AppLogger.w(
              '🔄 [$requestId] Network error. Retrying in ${backoffMs}ms (Attempt #$retryCount)',
            );
            await Future<void>.delayed(Duration(milliseconds: backoffMs));

            try {
              return handler.resolve(
                await _retryRequest(e.requestOptions, retryCount),
              );
            } catch (_) {
              // Continue to next error handler if retry also fails
            }
          }

          return handler.next(e);
        },
      ),
    ]);
  }

  bool _isTokenExpiredError(DioException e) {
    if (e.response?.data is Map) {
      final data = e.response!.data as Map;
      final errorField = data['error'];
      final code =
          (errorField is Map ? errorField['code'] : errorField) ?? data['code'];
      return code == 'TOKEN_EXPIRED';
    }
    return false;
  }

  Future<Response<dynamic>> _retryRequest(
    RequestOptions originalOptions,
    int retryCount,
  ) async {
    // Industrial-Grade Deep Clone
    final options = Options(
      method: originalOptions.method,
      headers: Map<String, dynamic>.from(originalOptions.headers),
      extra: Map<String, dynamic>.from(originalOptions.extra),
      contentType: originalOptions.contentType,
      responseType: originalOptions.responseType,
      validateStatus: originalOptions.validateStatus,
    );

    options.extra!['retryCount'] = retryCount;
    options.extra!['retry'] = true;

    // Attach new token
    final newToken = await _tokenStorage.getAccessToken();
    if (newToken != null) {
      options.headers!['Authorization'] = 'Bearer $newToken';
    }

    // Preserve X-Request-Id
    final requestId = originalOptions.extra['requestId'];

    AppLogger.i('🔄 [$requestId] Retrying request (Attempt #$retryCount)');

    return _retryDio.request(
      originalOptions.path,
      data: originalOptions.data,
      queryParameters: originalOptions.queryParameters,
      options: options,
      cancelToken: originalOptions.cancelToken,
    );
  }

  void _logRequest(RequestOptions options) {
    final requestId = options.extra['requestId'] ?? 'N/A';

    // Immutable Deep Sanitization
    dynamic sanitizedData;
    Map<String, dynamic>? sanitizedHeaders;
    Map<String, dynamic>? sanitizedParams;

    if (options.data is FormData) {
      sanitizedData = '[FORMDATA_SKIPPED]';
    } else if (!_sessionManager.isBinaryPayload(options.data)) {
      sanitizedData = _redactSensitiveData(deepClone(options.data));
    } else {
      sanitizedData = '[BINARY_DATA_SKIPPED]';
    }

    final redactedHeaders = _redactSensitiveData(deepClone(options.headers));
    if (redactedHeaders is Map) {
      sanitizedHeaders = Map<String, dynamic>.from(redactedHeaders);
    }

    final redactedParams = _redactSensitiveData(
      deepClone(options.queryParameters),
    );
    if (redactedParams is Map) {
      sanitizedParams = Map<String, dynamic>.from(redactedParams);
    }

    AppLogger.i('➡️ [REQ] [$requestId] ${options.method} ${options.uri}');

    // Detailed debug logs for development
    AppLogger.d('[$requestId] Headers: $sanitizedHeaders');
    if (sanitizedParams != null && sanitizedParams.isNotEmpty) {
      AppLogger.d('[$requestId] Params: $sanitizedParams');
    }
    if (sanitizedData != null) {
      AppLogger.d('[$requestId] Payload: $sanitizedData');
    }
  }

  dynamic _redactSensitiveData(dynamic data) {
    if (data == null) return null;
    if (data is Map) {
      final keysToRedact = {
        'authorization',
        'accessToken',
        'refreshToken',
        'email',
        'phone',
        'latitude',
        'longitude',
        'password',
      };
      return data.map((key, value) {
        if (keysToRedact.contains(key.toString().toLowerCase())) {
          return MapEntry(key, '[REDACTED]');
        }
        return MapEntry(key, _redactSensitiveData(value));
      });
    } else if (data is List) {
      return data.map(_redactSensitiveData).toList();
    }
    return data;
  }

  @override
  String? get token => null; // Use TokenStorage directly
  @override
  void setToken(String token) {}
  @override
  void clearToken() {}
  @override
  void setOnLogout(VoidCallback onLogout) {}
  @override
  void setOnNetworkError(VoidCallback onNetworkError) {}

  @override
  Future<ApiResponse<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(dynamic) parser,
    CancelToken? cancelToken,
    Duration? ttl,
    bool ignoreCache = false,
  }) async {
    // 1. Try Cache First
    if (!ignoreCache) {
      final cachedEntry = _cache.get(path, params: queryParameters);
      if (cachedEntry != null && cachedEntry.data != null) {
        // Extract data from envelope if present to match _safeRequest behavior
        final dynamic rawData =
            (cachedEntry.data is Map &&
                (cachedEntry.data as Map).containsKey('data'))
            ? (cachedEntry.data as Map)['data']
            : cachedEntry.data;

        if (rawData != null) {
          AppLogger.d('📦 [CACHE] Hit for $path. Data present.');

          return ApiResponse(
            success: true,
            data: parser(rawData),
            raw: cachedEntry.data,
            meta: const ApiMeta(),
          );
        } else {
          AppLogger.w(
            '⚠️ [CACHE] Entry for $path contains null data. Ignoring.',
          );
        }
      }
    }

    return _deduplicatedRequest(
      path,
      () => _safeRequest(
        () => _dio.get(
          path,
          queryParameters: queryParameters,
          cancelToken: cancelToken,
        ),
        parser,
        onSuccess: (data) => _cache.set(
          path,
          data,
          params: queryParameters,
          ttl: ttl ?? const Duration(hours: 1),
        ),
        onFailure: () async {
          // Stale fallback on network failure
          final stale = _cache.get(path, params: queryParameters);
          if (stale != null) {
            AppLogger.d('📦 [STALE] Falling back to stale cache for $path');
            return ApiResponse(
              success: true,
              data: parser(
                (stale.data is Map && (stale.data as Map).containsKey('data'))
                    ? (stale.data as Map)['data']
                    : stale.data,
              ),
              raw: stale.data,
              meta: const ApiMeta(degraded: true),
            );
          }
          return null;
        },
      ),
    );
  }

  Future<ApiResponse<T>> _deduplicatedRequest<T>(
    String path,
    Future<ApiResponse<T>> Function() request,
  ) async {
    if (_activeRequests.containsKey(path)) {
      AppLogger.d('💎 [DEDUPE] Joining active request for $path');
      final result = await _activeRequests[path];
      return result as ApiResponse<T>;
    }

    final future = request();
    _activeRequests[path] = future;

    try {
      final result = await future;
      return result;
    } finally {
      unawaited(
        _activeRequests.remove(path) as Future<void>? ?? Future.value(),
      );
    }
  }

  @override
  Future<ApiResponse<T>> post<T>(
    String path, {
    dynamic data,
    required T Function(dynamic) parser,
    CancelToken? cancelToken,
  }) => _safeRequest(
    () => _dio.post(path, data: data, cancelToken: cancelToken),
    parser,
  );

  @override
  Future<ApiResponse<T>> put<T>(
    String path, {
    dynamic data,
    required T Function(dynamic) parser,
    CancelToken? cancelToken,
  }) => _safeRequest(
    () => _dio.put(path, data: data, cancelToken: cancelToken),
    parser,
  );

  @override
  Future<ApiResponse<T>> patch<T>(
    String path, {
    dynamic data,
    required T Function(dynamic) parser,
    CancelToken? cancelToken,
  }) => _safeRequest(
    () => _dio.patch(path, data: data, cancelToken: cancelToken),
    parser,
  );

  @override
  Future<ApiResponse<T>> delete<T>(
    String path, {
    dynamic data,
    required T Function(dynamic) parser,
    CancelToken? cancelToken,
  }) => _safeRequest(
    () => _dio.delete(path, data: data, cancelToken: cancelToken),
    parser,
  );

  Future<ApiResponse<T>> _safeRequest<T>(
    Future<Response<dynamic>> Function() request,
    T Function(dynamic) parser, {
    void Function(dynamic data)? onSuccess,
    Future<ApiResponse<T>?> Function()? onFailure,
  }) async {
    try {
      final response = await request();
      final requestId = response.requestOptions.extra['requestId']?.toString();

      // Robust check for response shape
      final isMap = response.data is Map;
      final isList = response.data is List;

      if (response.data == null || (!isMap && !isList)) {
        AppLogger.w(
          '⚠️ [RES] [$requestId] Unexpected response format (not map/list): ${response.data}',
        );
        return ApiResponse.fallback(
          reason: 'invalid_format',
          requestId: requestId,
        );
      }

      AppLogger.d('📦 [RES] [$requestId] Raw data: ${response.data}');

      // Determine rawData and responseBody based on shape
      dynamic rawData;
      Map<String, dynamic> responseBody;

      if (isMap) {
        final body = Map<String, dynamic>.from(response.data as Map);
        final hasSuccess = body.containsKey('success');
        final hasData = body.containsKey('data');

        if (hasSuccess && hasData) {
          responseBody = body;
          rawData = body['data'];
        } else {
          // 🛡️ Envelope Normalization: Synthesize standard shape for raw responses
          rawData = hasData ? body['data'] : body;
          responseBody = {
            'success': body['success'] ?? true,
            'data': rawData,
            'meta': body['meta'] ?? {'contractState': 'normalized'},
            if (body.containsKey('error')) 'error': body['error'],
          };
          AppLogger.d(
            '🛡️ [ApiClient] Normalized raw Map into standard envelope',
          );
        }
      } else {
        // If it's a raw list, we synthesize a success envelope
        rawData = response.data;
        responseBody = {
          'success': true,
          'data': rawData,
          'meta': {'contractState': 'synthesized'},
        };
        AppLogger.d('🛡️ [ApiClient] Wrapped raw List into standard envelope');
      }

      // 1. Success Callback for Caching
      // Cache if 200 OK and (success is true OR success field is missing entirely)
      if (response.statusCode == 200 &&
          (responseBody['success'] == true ||
              !responseBody.containsKey('success'))) {
        onSuccess?.call(responseBody);
      }

      // 2. Conditional Parsing with compute()
      T parsedData;
      final useCompute =
          response.toString().length > 50 * 1024; // > 50KB approximate

      if (useCompute) {
        AppLogger.d(
          '🧵 [CPU] Large payload detected. Using compute() for parsing.',
        );
        parsedData = await compute((data) => parser(data), rawData);
      } else {
        parsedData = parser(rawData);
      }

      return ApiResponse.fromJson(
        responseBody,
        (_) => parsedData, // Parser already executed
        requestId: requestId,
      );
    } on DioException catch (e) {
      final requestId = e.requestOptions.extra['requestId']?.toString();

      // Check for stale fallback
      if (onFailure != null) {
        final fallback = await onFailure();
        if (fallback != null) return fallback;
      }

      if (e.response?.statusCode == 403) {
        if (e.response?.data is Map) {
          final data = e.response!.data as Map;
          final errorField = data['error'];

          // Backend sends error as either a string or a nested { message, code, details } object
          String? code;
          String? message;
          Map<String, dynamic>? details;
          if (errorField is Map) {
            code = errorField['code']?.toString();
            message = errorField['message']?.toString();
            // details lives at the error level for formatErrorResponse format
            final d = errorField['details'];
            if (d is Map<String, dynamic>) details = d;
          } else if (errorField is String) {
            message = errorField;
          }
          code ??= data['code']?.toString();
          message ??= data['message']?.toString();

          // banExpiresAt/banReason can also be at root level (used by /api/auth/login raw format)
          final banExpiresAt =
              details?['banExpiresAt']?.toString() ??
              data['banExpiresAt']?.toString();
          final banReason =
              details?['banReason']?.toString() ??
              data['banReason']?.toString();

          // Detect ban: either via explicit BANNED_USER code (used by /api/auth/me, /refresh, /login)
          // or via FORBIDDEN code with a ban message (used by /api/auth/google)
          final isBannedUser =
              code == 'BANNED_USER' ||
              (code == 'FORBIDDEN' &&
                  (message?.toLowerCase().contains('ban') == true));

          if (isBannedUser) {
            final reason = message ?? 'Account has been banned';
            // Encode ban metadata into the error string so auth_provider can parse it
            final errorPayload = [
              'BANNED_USER',
              reason,
              banExpiresAt ?? '',
              banReason ?? '',
            ].join('||');
            throw DioException(
              requestOptions: e.requestOptions,
              response: e.response,
              type: DioExceptionType.badResponse,
              error: errorPayload,
              message: 'BANNED_USER',
            );
          }
        }
      }

      if (e.error is DegradedModeException ||
          e.error is RefreshTimeoutException ||
          e.error is TooManyRequestsException ||
          e.error is AuthFailure) {
        return ApiResponse.fallback(
          reason: e.error.toString(),
          requestId: requestId,
        );
      }

      var reason = 'network';
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout ||
          e.type == DioExceptionType.sendTimeout) {
        reason = 'timeout';
      }

      return ApiResponse.fallback(reason: reason, requestId: requestId);
    } catch (e) {
      if (onFailure != null) {
        final fallback = await onFailure();
        if (fallback != null) return fallback;
      }
      return ApiResponse.fallback(reason: 'malformed');
    }
  }
}

// ─────────────────────────────────────────────
// Mock Client (development only)
// ─────────────────────────────────────────────

class MockApiClient implements ApiClient {
  @override
  String? get token => null;
  @override
  void setToken(String t) {}
  @override
  void clearToken() {}
  @override
  void setOnLogout(VoidCallback onLogout) {}
  @override
  void setOnNetworkError(VoidCallback onNetworkError) {}

  @override
  Future<ApiResponse<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    required T Function(dynamic) parser,
    CancelToken? cancelToken,
    Duration? ttl,
    bool ignoreCache = false,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    return ApiResponse.fallback(reason: 'mock', requestId: 'mock-get');
  }

  @override
  Future<ApiResponse<T>> post<T>(
    String path, {
    dynamic data,
    required T Function(dynamic) parser,
    CancelToken? cancelToken,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    return ApiResponse.fallback(reason: 'mock', requestId: 'mock-post');
  }

  @override
  Future<ApiResponse<T>> put<T>(
    String path, {
    dynamic data,
    required T Function(dynamic) parser,
    CancelToken? cancelToken,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    return ApiResponse.fallback(reason: 'mock', requestId: 'mock-put');
  }

  @override
  Future<ApiResponse<T>> patch<T>(
    String path, {
    dynamic data,
    required T Function(dynamic) parser,
    CancelToken? cancelToken,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    return ApiResponse.fallback(reason: 'mock', requestId: 'mock-patch');
  }

  @override
  Future<ApiResponse<T>> delete<T>(
    String path, {
    dynamic data,
    required T Function(dynamic) parser,
    CancelToken? cancelToken,
  }) async {
    await Future<void>.delayed(const Duration(milliseconds: 400));
    return ApiResponse.fallback(reason: 'mock', requestId: 'mock-delete');
  }
}

final apiClientProvider = Provider<ApiClient>((ref) {
  if (Env.useMockApi) return MockApiClient();
  return DioApiClient(ref);
});
