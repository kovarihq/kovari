import 'package:flutter_dotenv/flutter_dotenv.dart';

class Env {
  // Version: 1.0.2

  /// Internal helper to get a required variable or throw
  static String _getRequired(String key) {
    // 1. Try dart-define
    final dartDefine = String.fromEnvironment(key);
    if (dartDefine.isNotEmpty) {
      return dartDefine;
    }

    // 2. Fallback to dotenv
    final dotenvValue = dotenv.maybeGet(key);
    if (dotenvValue != null && dotenvValue.isNotEmpty) {
      return dotenvValue;
    }

    throw Exception(
      'Environment variable $key is missing. Please check your dart-define config or .env file.',
    );
  }

  /// Internal helper for optional values
  static String? _getOptional(String key) {
    // 1. Try dart-define
    final dartDefine = String.fromEnvironment(key);
    if (dartDefine.isNotEmpty) {
      return dartDefine;
    }

    // 2. Fallback to dotenv
    final dotenvValue = dotenv.maybeGet(key);
    if (dotenvValue != null && dotenvValue.isNotEmpty) {
      return dotenvValue;
    }

    return null;
  }

  // API & Backend
  static String get apiBaseUrl => _getRequired('API_BASE_URL');
  static String get socketUrl => _getRequired('SOCKET_URL');
  static String get webBaseUrl => _getOptional('WEB_BASE_URL') ?? 'https://kovari.in';

  // Third Party
  static String? get geoapifyKey => _getOptional('GEOAPIFY_KEY');
  static String? get sentryDsn => _getOptional('SENTRY_DSN');

  // App Metadata
  static String get appVersion => _getOptional('APP_VERSION') ?? '1.0.0';

  // Google OAuth - REQUIRED for Mobile Auth
  static String? get googleClientId => _getOptional('GOOGLE_CLIENT_ID');

  // Toggle for mock data
  static bool get useMockApi {
    final val = _getOptional('USE_MOCK_API');
    return (val ?? 'false').toLowerCase() == 'true';
  }

  /// Validates that all critical environment variables are present.
  static void validate() {
    // These will throw if missing during access, but we can pre-check them here.
    _getRequired('API_BASE_URL');
    _getRequired('SOCKET_URL');
  }

  /// Returns the current loaded environment file name for debugging
  static String get currentEnv => const String.fromEnvironment(
    'ENV_FILE',
    defaultValue: 'env/development.json',
  );
}
