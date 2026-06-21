import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/cache/local_cache.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/providers/cache_provider.dart';
import 'package:mobile/core/providers/connectivity_provider.dart';
import 'package:mobile/core/utils/app_logger.dart';

enum SyncStatus { idle, syncing, error }

class SyncEngine {

  SyncEngine(this._ref)
    : _cache = _ref.read(localCacheProvider),
      _apiClient = _ref.read(apiClientProvider);
  final Ref _ref;
  final LocalCache _cache;
  final ApiClient _apiClient;

  /// Performs a Stale-While-Revalidate fetch.
  /// 1. Immediately returns cached data if available.
  /// 2. Triggers a background fetch to update the cache.
  /// 3. If network fails, the caller already has the cached data.
  Future<T?> swrFetch<T>({
    required String path,
    required T Function(dynamic) parser,
    Map<String, dynamic>? queryParameters,
    Duration ttl = const Duration(hours: 1),
    Function(T data)? onUpdate,
    bool ignoreCache = false,
  }) async {
    // 1. Try Cache First
    if (!ignoreCache) {
      final cached = _cache.get(path, params: queryParameters);
      if (cached != null) {
        AppLogger.d('📦 [SWR] Cache hit for $path');
        final data = parser(
          cached.data is Map && (cached.data as Map).containsKey('data')
              ? (cached.data as Map)['data']
              : cached.data,
        );

        // Trigger background refresh if online and cache is older than 30s (throttling)
        final age = DateTime.now().difference(cached.timestamp);
        if (_ref.read(connectivityProvider).isOnline) {
          if (age > const Duration(seconds: 30)) {
            _backgroundFetch(path, parser, queryParameters, ttl, onUpdate);
          } else {
            AppLogger.d('⚡ [SWR] Skipping background refresh for $path (Cache age: ${age.inSeconds}s, fresh < 30s)');
          }
        }

        return data;
      }
    }

    // 2. If no cache, perform standard fetch
    AppLogger.d('🌐 [SWR] No cache for $path, performing initial fetch');
    final response = await _apiClient.get(
      path,
      queryParameters: queryParameters,
      parser: parser,
      ttl: ttl,
    );

    if (response.success && response.data != null) {
      return response.data;
    }

    return null;
  }

  void _backgroundFetch<T>(
    String path,
    T Function(dynamic) parser,
    Map<String, dynamic>? queryParameters,
    Duration ttl,
    Function(T data)? onUpdate,
  ) {
    // Silent background update
    unawaited(() async {
      try {
        final response = await _apiClient.get(
          path,
          queryParameters: queryParameters,
          parser: parser,
          ttl: ttl,
          ignoreCache: true, // Force network fetch
        );

        if (response.success) {
          final data = response.data;
          if (data != null) {
            AppLogger.d('🔄 [SWR] Background refresh successful for $path');
            onUpdate?.call(data);
          }
        }
      } catch (e) {
        AppLogger.w('⚠️ [SWR] Background refresh failed for $path: $e');
      }
    }());
  }

  /// Explicitly syncs a set of critical resources
  Future<void> syncCriticalData() async {
    AppLogger.i('🚀 SyncEngine: Starting critical data sync...');
    // Add logic to sync profile, matches, groups etc.
  }
}

final syncEngineProvider = Provider<SyncEngine>(SyncEngine.new);
