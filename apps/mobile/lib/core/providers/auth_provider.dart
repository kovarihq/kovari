import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/auth/auth_repository.dart';
import 'package:mobile/core/auth/session_manager.dart';
import 'package:mobile/core/auth/token_storage.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/network/api_endpoints.dart';
import 'package:mobile/core/providers/connectivity_provider.dart';
import 'package:mobile/core/providers/profile_provider.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/shared/models/kovari_user.dart';
import 'package:mobile/core/providers/cache_provider.dart';
import 'package:mobile/core/realtime/socket_service.dart';
import 'package:mobile/features/chat/providers/cache_providers.dart';

class AuthState {
  AuthState({
    this.user,
    this.isAuthenticated = false,
    this.isDegraded = false,
    this.isRefreshing = false,
    this.isBootstrapping = true,
    this.isBanned = false,
    this.banExpiresAt,
    this.banReason,
  });
  final KovariUser? user;
  final bool isAuthenticated;
  final bool isDegraded;
  final bool isRefreshing;
  final bool isBootstrapping;

  /// True when the account is actively banned — used to show BannedScreen
  /// even when no KovariUser object is available (e.g. during a fresh banned login).
  final bool isBanned;

  /// ISO-8601 string of when the suspension expires. Null means permanent ban.
  final String? banExpiresAt;

  /// Human-readable ban reason from the backend.
  final String? banReason;

  AuthState copyWith({
    KovariUser? user,
    bool? isAuthenticated,
    bool? isDegraded,
    bool? isRefreshing,
    bool? isBootstrapping,
    bool? isBanned,
    String? banExpiresAt,
    String? banReason,
  }) => AuthState(
    user: user ?? this.user,
    isAuthenticated: isAuthenticated ?? this.isAuthenticated,
    isDegraded: isDegraded ?? this.isDegraded,
    isRefreshing: isRefreshing ?? this.isRefreshing,
    isBootstrapping: isBootstrapping ?? this.isBootstrapping,
    isBanned: isBanned ?? this.isBanned,
    banExpiresAt: banExpiresAt ?? this.banExpiresAt,
    banReason: banReason ?? this.banReason,
  );
}

class AuthNotifier extends Notifier<AuthState> {
  @override
  AuthState build() {
    // We don't initialize here because we need to await ensureSessionReady
    // The main app will call init()
    return AuthState();
  }

  Future<void> init() async {
    final repo = ref.read(authRepositoryProvider);
    final session = ref.read(sessionManagerProvider);
    final storage = TokenStorage();

    await repo.ensureSessionReady();

    // Set listener AFTER bootstrap completes to prevent premature session synchronization
    session.setOnStateChanged(syncSessionState);

    final userJson = await storage.getUserData();
    KovariUser? user;
    if (userJson != null) {
      try {
        user = KovariUser.fromJson(
          jsonDecode(userJson) as Map<String, dynamic>,
        );
      } catch (_) {}
    }

    state = state.copyWith(
      user: user,
      isAuthenticated: session.isAuthenticated,
      isDegraded: session.isDegraded,
      isRefreshing: session.isRefreshing,
      isBootstrapping: false,
    );

    // Eagerly sync profile on boot. syncBanStatus() is intentionally NOT called here
    // because auth/me validates the JWT's tokenHash against the refresh_tokens DB table.
    // After BOOTSTRAP-REFRESH rotates the tokens, a race can cause the old access token
    // (with deleted tokenHash) to be used → auth/me 401 → refresh 401 (reuse attack) → logout.
    // Ban enforcement is already handled by the /auth/refresh assertNotBanned check.
    if (session.isAuthenticated) {
      Future.microtask(() async {
        await syncProfile();
      });
    }

    // Auto-retry syncProfile when connectivity is restored
    ref.listen(connectivityProvider, (previous, next) {
      if (next.isOnline && previous?.status != ConnectionStatus.online) {
        final currentUser = state.user;
        if (session.isAuthenticated &&
            (currentUser == null || currentUser.resolvedUuid == null)) {
          AppLogger.i(
            '🛡️ [AuthNotifier] Connection restored. Retrying profile sync...',
          );
          syncProfile();
        }
      }
    });
  }

  Future<void> syncBanStatus() async {
    // If not authenticated, we still want to run if we have a cached user or if we explicitly catch a Banned exception during login.
    // So we remove the early return guard to let Banned exceptions trigger the flow.

    try {
      final apiClient = ref.read(apiClientProvider);
      final response = await apiClient.get<Map<String, dynamic>>(
        ApiEndpoints.authMe,
        ignoreCache: true,
        parser: (data) => data as Map<String, dynamic>,
      );

      if (response.success && response.data != null) {
        final raw = response.data!;
        final userMap =
            (raw['user'] as Map<String, dynamic>?) ??
            (raw['data']?['user'] as Map<String, dynamic>?);
        if (userMap == null) return;

        final user = KovariUser.fromAuthResponse(userMap);
        final storage = TokenStorage();
        await storage.saveUserData(jsonEncode(user.toJson()));

        if (user.isActivelyBanned) {
          await _handleBannedSession(user);
          return;
        }

        state = state.copyWith(user: user);
      }
    } catch (e) {
      if (e.toString().contains('BANNED_USER') ||
          (e is DioException &&
              (e.response?.statusCode == 403 || e.message == 'BANNED_USER'))) {
        KovariUser? bannedUser;
        if (e is DioException && e.response?.data is Map) {
          final data = e.response!.data as Map;
          final userMap = data['user'] ?? data['data']?['user'];
          if (userMap is Map<String, dynamic>) {
            bannedUser = KovariUser.fromAuthResponse(userMap);
          }
        }
        await _handleBannedSession(bannedUser ?? state.user);
      } else {
        AppLogger.e('🛡️ [AuthNotifier] Ban status sync failed', error: e);
      }
    }
  }

  Future<void> _handleBannedSession(
    KovariUser? user, {
    String? banExpiresAt,
    String? banReason,
  }) async {
    final bannedUser = user ?? state.user;
    // Prefer explicit expiry; fall back to what's already on the user object
    final resolvedExpiry = (banExpiresAt?.isNotEmpty == true)
        ? banExpiresAt
        : bannedUser?.banExpiresAt;

    try {
      await ref.read(localCacheProvider).clearAll();
    } catch (_) {}

    try {
      ref.read(socketServiceProvider.notifier).disconnect();
    } catch (_) {}

    // Save user data locally if we have it (for cold start BannedScreen to read ban status)
    if (bannedUser != null) {
      final storage = TokenStorage();
      await storage.saveUserData(jsonEncode(bannedUser.toJson()));
    }

    // Terminate the authenticated session state
    final session = ref.read(sessionManagerProvider);
    session.setAuthenticated(false);
    session.setDisableRefresh(true);

    // Set isBanned=true so the router redirects to /banned even when there is no user object
    // (e.g. during a fresh login attempt with a banned account)
    state = AuthState(
      user: bannedUser,
      isAuthenticated: false,
      isBootstrapping: false,
      isBanned: true,
      banExpiresAt: resolvedExpiry,
      banReason: (banReason?.isNotEmpty == true)
          ? banReason
          : bannedUser?.banReason,
    );
  }

  /// Explicitly triggers ban screen navigation state from a caught exception (e.g. during login).
  /// Parses the pipe-encoded payload from api_client: 'BANNED_USER||reason||banExpiresAt||banReason'
  Future<void> handleBannedException(dynamic error) async {
    KovariUser? bannedUser;
    String? banExpiresAt;
    String? banReason;

    if (error is DioException) {
      // Parse pipe-separated ban metadata encoded by api_client._safeRequest
      final rawError = error.error?.toString() ?? '';
      final parts = rawError.split('||');
      if (parts.length >= 3) {
        banExpiresAt = parts[2].isNotEmpty ? parts[2] : null;
      }
      if (parts.length >= 4) {
        banReason = parts[3].isNotEmpty ? parts[3] : null;
      }

      // Also try to find user object in the response body
      if (error.response?.data is Map) {
        final data = error.response!.data as Map;
        final userMap = data['user'] ?? data['data']?['user'];
        if (userMap is Map<String, dynamic>) {
          bannedUser = KovariUser.fromAuthResponse(userMap);
        }
      }
    }

    await _handleBannedSession(
      bannedUser ?? state.user,
      banExpiresAt: banExpiresAt,
      banReason: banReason,
    );
  }

  /// Eagerly fetch the latest profile to ensure we have the UUID for encryption.
  Future<void> syncProfile() async {
    try {
      final apiClient = ref.read(apiClientProvider);
      final response = await apiClient.get<KovariUser>(
        ApiEndpoints.currentProfile,
        ignoreCache: true, // 💎 Force network fetch to heal missing UUID
        parser: (data) {
          final map = data as Map<String, dynamic>;
          final envelope = (map['data'] ?? map) as Map<String, dynamic>;
          final actualData =
              (envelope['profile'] ?? envelope['user'] ?? envelope)
                  as Map<String, dynamic>;
          return KovariUser.fromJson(actualData);
        },
      );

      if (response.success && response.data != null) {
        final freshUser = response.data!;
        AppLogger.i(
          '🛡️ [AuthNotifier] Profile sync successful. User ID: ${freshUser.id}, UUID: ${freshUser.uuid}',
        );
        final storage = TokenStorage();
        await storage.saveUserData(jsonEncode(freshUser.toJson()));
        state = state.copyWith(user: freshUser);

        // Eagerly refresh the global profileProvider holding the active UserProfile object
        Future.microtask(() {
          try {
            ref.read(profileProvider.notifier).fetchProfile(ignoreCache: true);
          } catch (_) {}
        });
      }
    } catch (e) {
      AppLogger.e('🛡️ [AuthNotifier] Profile sync failed', error: e);
    }
  }

  void setUser(KovariUser? user) {
    state = state.copyWith(user: user, isAuthenticated: user != null);
    if (user != null) {
      // Eagerly sync the user profile metadata
      syncProfile();
    }
  }

  Future<void> logout() async {
    final currentUser = state.user;
    if (currentUser != null) {
      try {
        final cacheRepo = ref.read(
          conversationCacheRepositoryProvider(currentUser.id),
        );
        await cacheRepo.deleteCache();
        await cacheRepo.close();
        AppLogger.i(
          'Cleaned and closed cache boxes for logging out user: ${currentUser.id}',
        );
      } catch (e) {
        AppLogger.e('Failed to clean cache boxes during logout: $e');
      }
    }

    final repo = ref.read(authRepositoryProvider);
    await repo.logout(reason: 'USER_INITIATED');
    state = AuthState(isBootstrapping: false);
  }

  void syncSessionState() {
    final session = ref.read(sessionManagerProvider);
    if (state.isDegraded != session.isDegraded ||
        state.isRefreshing != session.isRefreshing ||
        state.isAuthenticated != session.isAuthenticated) {
      Future.microtask(() {
        state = state.copyWith(
          isDegraded: session.isDegraded,
          isRefreshing: session.isRefreshing,
          isAuthenticated: session.isAuthenticated,
        );
      });
    }
  }
}

final authProvider = NotifierProvider<AuthNotifier, AuthState>(
  AuthNotifier.new,
);

/// Legacy compatibility provider if needed
final authStateProvider = Provider<KovariUser?>(
  (ref) => ref.watch(authProvider).user,
);

final logoutProvider = Provider(
  (ref) =>
      () => ref.read(authProvider.notifier).logout(),
);
