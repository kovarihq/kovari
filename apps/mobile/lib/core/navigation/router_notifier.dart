import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/core/providers/profile_provider.dart';
import 'package:mobile/core/utils/app_logger.dart';

/// 🧭 [RouterNotifier] - The central guard for Kovari Navigation.
/// It listens to authentication and profile states to trigger precise redirections.
class RouterNotifier extends ChangeNotifier {
  RouterNotifier(this._ref) {
    // 🎧 Listen to Auth State
    _ref.listen(authProvider, (_, __) => notifyListeners());

    // 🎧 Listen to Profile State (for Onboarding Guard)
    _ref.listen(profileProvider, (_, __) {
      if (_isFirstSync) {
        _isFirstSync = false;
        return;
      }
      notifyListeners();
    });
  }
  final Ref _ref;
  bool _isFirstSync = true;

  String? _targetRedirectUrl;

  /// 🛡️ The master redirection logic for the entire app.
  String? redirect(BuildContext context, GoRouterState state) {
    var matchedLocation = state.matchedLocation;

    // 1. Sanitize full URLs passed from the platform channel (deep links)
    if (matchedLocation.startsWith('http://') ||
        matchedLocation.startsWith('https://')) {
      try {
        final uri = Uri.parse(matchedLocation);
        var path = uri.path;
        if (path.startsWith('/invite/')) {
          path = path.replaceFirst('/invite/', '/groups/invite/');
        }
        final sanitized = uri.queryParameters.isEmpty
            ? path
            : Uri(path: path, queryParameters: uri.queryParameters).toString();
        AppLogger.i(
          '🔗 [RouterNotifier] Sanitized full URL: $matchedLocation -> $sanitized',
        );
        return sanitized;
      } catch (e) {
        AppLogger.e('Error sanitizing full URL: $matchedLocation', error: e);
      }
    }

    // 2. Map invite paths to groups/invite route if passed as relative path
    if (matchedLocation.startsWith('/invite/')) {
      final token = matchedLocation.substring('/invite/'.length);
      return '/groups/invite/$token';
    }

    final auth = _ref.read(authProvider);
    final profile = _ref.read(profileProvider);

    // 1. Wait for bootstrapping (Splash screen handled by main.dart/NativeSplash)
    if (auth.isBootstrapping) return null;

    final loggingIn = state.matchedLocation == '/login';

    // 2. Auth Guard
    if (!auth.isAuthenticated) {
      if (auth.isBanned ||
          auth.user?.banned == true ||
          auth.user?.isActivelyBanned == true) {
        return state.matchedLocation == '/banned' ? null : '/banned';
      }

      final isPublicAuthPage =
          state.matchedLocation == '/login' ||
          state.matchedLocation == '/sign-up' ||
          state.matchedLocation == '/forgot-password' ||
          state.matchedLocation == '/reset-password' ||
          state.matchedLocation.startsWith('/verify-email');

      if (!isPublicAuthPage) {
        _targetRedirectUrl = state.matchedLocation;
        AppLogger.d(
          '🔒 [RouterNotifier] Saved target redirect URL: $_targetRedirectUrl',
        );
        return '/login';
      }
      return null;
    }

    // 3. Ban Guard
    if (auth.isBanned ||
        auth.user?.banned == true ||
        auth.user?.isActivelyBanned == true) {
      return state.matchedLocation == '/banned' ? null : '/banned';
    }

    // 4. Onboarding Guard
    // Check the explicit onboardingCompleted flag from the server
    final isProfileComplete = profile?.onboardingCompleted ?? false;

    if (!isProfileComplete && profile != null) {
      // Don't loop if already on onboarding
      if (state.matchedLocation == '/onboarding') return null;

      AppLogger.w('🚩 [Router] Guard: Redirecting to Onboarding');
      return '/onboarding';
    }

    // 5. Redirection from Login if already authenticated
    if (loggingIn) {
      final target = _targetRedirectUrl;
      _targetRedirectUrl = null;
      if (target != null && target != '/') {
        AppLogger.i(
          '🔓 [RouterNotifier] Restoring target redirect URL: $target',
        );
        return target;
      }
      return '/';
    }

    // 6. No redirection needed
    return null;
  }
}

final routerNotifierProvider = Provider<RouterNotifier>(RouterNotifier.new);
