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
    // Watch ONLY the userId so this provider does NOT rebuild when the user's
    // metadata (name, uuid, bio etc.) is refreshed by syncProfile().
    // Watching the full KovariUser caused an infinite rebuild loop:
    //   setUser → syncProfile updates state.user → authStateProvider emits →
    //   profileProvider rebuilds → state resets to null → skeleton forever.
    final userId = ref.watch(
      authProvider.select((s) => s.user?.id),
    );

    if (userId == null) {
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
      if (cachedProfile.userId == userId) {
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

  Future<void> fetchProfile({bool ignoreCache = false, int retries = 3}) async {
    int attempt = 0;
    while (attempt < retries) {
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
          return; // Success, exit retry loop
        }
      } catch (e) {
        AppLogger.e('Failed to fetch profile (attempt ${attempt + 1}): $e');
      }
      
      attempt++;
      if (attempt < retries) {
        await Future.delayed(Duration(seconds: 1 * attempt)); // Linear backoff
      }
    }
  }
}

/// Provider to hold the current user's profile metadata globally.
/// This is populated after onboarding or during app initialization.
final profileProvider = NotifierProvider<ProfileNotifier, UserProfile?>(
  ProfileNotifier.new,
);
