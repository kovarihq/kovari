import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/auth/auth_repository.dart';
import 'package:mobile/core/auth/session_manager.dart';
import 'package:mobile/core/auth/token_storage.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/network/api_endpoints.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/shared/models/kovari_user.dart';

class AuthState {
  AuthState({
    this.user,
    this.isAuthenticated = false,
    this.isDegraded = false,
    this.isRefreshing = false,
    this.isBootstrapping = true,
  });
  final KovariUser? user;
  final bool isAuthenticated;
  final bool isDegraded;
  final bool isRefreshing;
  final bool isBootstrapping;

  AuthState copyWith({
    KovariUser? user,
    bool? isAuthenticated,
    bool? isDegraded,
    bool? isRefreshing,
    bool? isBootstrapping,
  }) => AuthState(
    user: user ?? this.user,
    isAuthenticated: isAuthenticated ?? this.isAuthenticated,
    isDegraded: isDegraded ?? this.isDegraded,
    isRefreshing: isRefreshing ?? this.isRefreshing,
    isBootstrapping: isBootstrapping ?? this.isBootstrapping,
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

    // Single source of truth sync
    session.setOnStateChanged(syncSessionState);

    await repo.ensureSessionReady();

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

    // 💎 Instagram-Pro: Eagerly heal the profile if UUID is missing from cache
    if (user != null && user.resolvedUuid == null) {
      AppLogger.w(
        '🛡️ [AuthNotifier] UUID missing for ClerkID: ${user.id}. Triggering profile sync...',
      );
      syncProfile();
    }
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
          final innerData = map['data'] ?? map;
          return KovariUser.fromJson(innerData as Map<String, dynamic>);
        },
      );

      if (response.success && response.data != null) {
        final freshUser = response.data!;
        if (freshUser.uuid != null) {
          AppLogger.i(
            '🛡️ [AuthNotifier] Profile sync successful. UUID resolved: ${freshUser.uuid}',
          );
          final storage = TokenStorage();
          await storage.saveUserData(jsonEncode(freshUser.toJson()));
          state = state.copyWith(user: freshUser);
        }
      }
    } catch (e) {
      AppLogger.e('🛡️ [AuthNotifier] Profile sync failed', error: e);
    }
  }

  void setUser(KovariUser? user) {
    state = state.copyWith(user: user, isAuthenticated: user != null);
  }

  Future<void> logout() async {
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
