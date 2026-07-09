import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/network/api_endpoints.dart';
import 'package:mobile/core/network/sync_engine.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/core/providers/cache_provider.dart';
import 'package:mobile/core/providers/connectivity_provider.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/features/profile/models/user_profile.dart';

import 'package:mobile/core/telemetry/telemetry_service.dart';

class ProfileNotifier extends Notifier<UserProfile?> {
  @override
  UserProfile? build() {
    final user = ref.watch(authStateProvider);

    if (user == null) {
      TelemetryService().setInternalUser(false);
      return null;
    }

    // 1. Instant Boot: Try to return cached profile immediately as the initial state.
    // NOTE: Do NOT read `state` inside build() — build() IS the initialization.
    final cache = ref.read(localCacheProvider);
    final cachedData = cache.getProfile();
    UserProfile? initialProfile;

    if (cachedData != null) {
      final cachedProfile = UserProfile.fromJson(cachedData);
      if (cachedProfile.userId == user.id) {
        initialProfile = cachedProfile;
        TelemetryService().setInternalUser(cachedProfile.isInternal);
        AppLogger.d('🚀 [BOOT] Profile seeded from cache instantly');
      }
    }

    // 2. Auto-refresh when connectivity is restored
    ref.listen(connectivityProvider, (previous, next) {
      if (next.isOnline && previous?.status != ConnectionStatus.online) {
        fetchProfile();
      }
    });

    // 3. Always schedule a background network refresh to keep data fresh.
    //    This runs after build() completes so state is already initialized.
    Future.microtask(fetchProfile);

    return initialProfile;
  }

  // Allow setting the profile externally (e.g., during login or onboarding)
  void setProfile(UserProfile? profile) => state = profile;

  Future<void> fetchProfile({bool ignoreCache = false}) async {
    try {
      final syncEngine = ref.read(syncEngineProvider);
      final cache = ref.read(localCacheProvider);

      final profile = await syncEngine.swrFetch<UserProfile?>(
        path: ApiEndpoints.currentProfile,
        ignoreCache: ignoreCache,
        parser: (data) {
          if (data is! Map<String, dynamic>) return null;
          final envelope = (data['data'] ?? data) as Map<String, dynamic>;
          final actualData = (envelope['profile'] ?? envelope['user'] ?? envelope) as Map<String, dynamic>;
          return UserProfile.fromJson(actualData);
        },
        onUpdate: (updatedProfile) {
          if (updatedProfile != null) {
            state = updatedProfile;
            TelemetryService().setInternalUser(updatedProfile.isInternal);
            cache.setProfile(updatedProfile.toJson());
          }
        },
      );

      if (profile != null) {
        state = profile;
        TelemetryService().setInternalUser(profile.isInternal);
        cache.setProfile(profile.toJson());
      }
    } catch (e) {
      AppLogger.e('Failed to fetch profile: $e');
    }
  }
}

/// Provider to hold the current user's profile metadata globally.
/// This is populated after onboarding or during app initialization.
final profileProvider = NotifierProvider<ProfileNotifier, UserProfile?>(
  ProfileNotifier.new,
);
