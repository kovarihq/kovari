import 'dart:async';
import 'dart:ui';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart' show kIsWeb, kReleaseMode;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:mobile/core/auth/token_storage.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/navigation/router.dart';
import 'package:mobile/core/network/mutation_queue.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/core/providers/cache_provider.dart';
import 'package:mobile/core/providers/theme_provider.dart';
import 'package:mobile/core/runtime/runtime_init.dart';
import 'package:mobile/core/security/runtime_trust_service.dart';
import 'package:mobile/core/security/secure_key_manager.dart';
import 'package:mobile/core/security/trust_state_machine.dart';
import 'package:mobile/core/services/fcm_service.dart';
import 'package:mobile/core/telemetry/freeze_monitor.dart';
import 'package:mobile/core/telemetry/release_health_service.dart';
import 'package:mobile/core/telemetry/runtime_metrics_service.dart';
import 'package:mobile/core/telemetry/telemetry_service.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/shared/widgets/dynamic_status_overlay.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

late final ProviderContainer globalProviderContainer;

void main() {
  runZonedGuarded(
    () async {
      final widgetsBinding = WidgetsFlutterBinding.ensureInitialized();
      FlutterNativeSplash.preserve(widgetsBinding: widgetsBinding);

      // 🛰️ [Production Observability] Phase 1: Foundation
      RuntimeMetricsService().markAppStart();

      // 🧊 [Aesthetic] Set status bar to transparent for blurred effect
      SystemChrome.setSystemUIOverlayStyle(
        const SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          statusBarIconBrightness: Brightness.light,
          statusBarBrightness: Brightness.dark,
        ),
      );

      // Initialize Hive
      try {
        await Hive.initFlutter();
        await Hive.openBox<dynamic>('settings');
        AppLogger.i('Hive initialized successfully');
      } catch (e) {
        AppLogger.e('Hive initialization failed: $e');
      }

      // Global Error Handlers
      FlutterError.onError = (FlutterErrorDetails details) {
        if (kReleaseMode) {
          Sentry.captureException(details.exception, stackTrace: details.stack);
        } else {
          FlutterError.presentError(details);
        }
        AppLogger.e(
          'FlutterError: ${details.exception}',
          stackTrace: details.stack,
          reportToSentry: false,
        );
      };

      PlatformDispatcher.instance.onError = (error, stack) {
        if (kReleaseMode) {
          Sentry.captureException(error, stackTrace: stack);
        }
        AppLogger.e(
          'PlatformDispatcherError: $error',
          stackTrace: stack,
          reportToSentry: false,
        );
        return true;
      };

      // Custom Error Widget
      ErrorWidget.builder = (FlutterErrorDetails details) {
        if (kReleaseMode) {
          return Scaffold(
            backgroundColor: AppColors.background,
            body: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    Icons.warning_rounded,
                    color: AppColors.primary,
                    size: 64,
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Oops! Something went wrong.',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: AppColors.foreground,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'We are working to fix it.',
                    style: TextStyle(color: AppColors.mutedForeground),
                  ),
                  const SizedBox(height: 24),
                  ElevatedButton(
                    onPressed: () {},
                    child: const Text('Return Home'),
                  ),
                ],
              ),
            ),
          );
        }
        return ErrorWidget(details.exception);
      };

      // Load environment variables
      const envFile = String.fromEnvironment(
        'ENV_FILE',
        defaultValue: '.env.development',
      );
      try {
        await dotenv.load(fileName: envFile);
        AppLogger.i('Loaded environment from $envFile');
      } catch (e) {
        AppLogger.w(
          'Dotenv failed to load $envFile: $e. Falling back to dart-define.',
        );
      }

      try {
        Env.validate();
      } catch (e) {
        AppLogger.e('Environment validation failed: $e');
        // We continue to runApp so the user can see an error widget instead of a hang
      }

      final container = ProviderContainer();
      globalProviderContainer = container;
      try {
        await container.read(cacheInitProvider.future);
        await container.read(mutationQueueInitProvider.future);

        // 🚀 [Critical Runtime Path] Initialize Persistent Runtime
        await container.read(runtimeInitProvider.future);

        // Initialize Authentication State
        await container.read(authProvider.notifier).init();

        // Start background cache maintenance
        Timer.periodic(const Duration(minutes: 15), (_) {
          container.read(localCacheProvider).cleanupExpired();
        });

        // 🔑 [Critical] Initialize Google Sign-In BEFORE splash dismiss
        // Must be awaited and isolated from Firebase to guarantee readiness.
        try {
          final gId = Env.googleClientId;
          AppLogger.d(
            'Initializing Google Sign-In (isWeb: $kIsWeb, clientId: $gId)...',
          );
          await GoogleSignIn.instance.initialize(
            clientId: kIsWeb ? gId : null,
            serverClientId: kIsWeb ? null : gId,
          );
          AppLogger.i('✅ Google Sign-In initialized successfully.');
        } catch (e) {
          AppLogger.w('⚠️ Google Sign-In initialization failed: $e');
        }

        // 🧊 [Premium] Dismiss splash screen after full boot
        FlutterNativeSplash.remove();

        // 🛰️ [Production Observability] Phase 2: Background Services
        unawaited(() async {
          AppLogger.i('🛡️ [Sovereign] Starting background security boot...');

          // 1. Core Security Identity (Mandatory)
          try {
            await SecureKeyManager().init();
            AppLogger.i('🛡️ [Sovereign] Identity active.');
          } catch (e) {
            AppLogger.e('🛡️ [SecureKeyManager] Critical Identity failure: $e');
          }

          // 2. Runtime Trust Evaluation (Mandatory)
          try {
            AppLogger.i('🧠 [Sovereign] Evaluating runtime trust...');
            final stateMachine = TrustStateMachine();
            await stateMachine.init();
            final initialScore = await RuntimeTrustService().evaluate();
            await stateMachine.update(initialScore);
            AppLogger.i(
              '🧠 [Sovereign] Trust established: ${initialScore.level.name}',
            );
          } catch (e) {
            AppLogger.e(
              '🛡️ [TrustEngine] Critical Trust evaluation failure: $e',
            );
          }

          // 3. External Observability (Optional/Graceful — Firebase only)
          try {
            AppLogger.i('📊 [Sovereign] Connecting external observability...');
            await Firebase.initializeApp();
            await TelemetryService().init();
            RuntimeMetricsService().init();
            FreezeMonitor().start();
            ReleaseHealthService().reportSessionStart();
            AppLogger.i('✅ Firebase observability connected.');

            // 🔔 [FCM] Initialize push notifications after Firebase is ready
            try {
              final tokenStorage = TokenStorage();
              final deviceId =
                  await tokenStorage.getDeviceId() ?? await _ensureDeviceId(tokenStorage);
              await FCMService.instance.init(deviceId: deviceId);
              AppLogger.i('✅ FCM push notifications initialized.');
            } catch (e) {
              AppLogger.w('⚠️ FCM initialization failed (non-fatal): $e');
            }
          } catch (e) {
            AppLogger.w(
              '⚠️ Firebase/Observability services failed to start: $e',
            );
          }
        }());
      } catch (e) {
        AppLogger.e('Initialization failed: $e');
      }

      final sentryDsn = Env.sentryDsn;
      if (sentryDsn != null && sentryDsn.isNotEmpty) {
        await SentryFlutter.init(
          (options) {
            options.dsn = sentryDsn;
            options.tracesSampleRate = 0.25; // Adaptive sampling start
            options.enableAppHangTracking = true;
          },
          appRunner: () => runApp(
            UncontrolledProviderScope(
              container: container,
              child: const KovariApp(),
            ),
          ),
        );
      } else {
        AppLogger.w('Sentry DSN not found. Running without Sentry.');
        runApp(
          UncontrolledProviderScope(
            container: container,
            child: const KovariApp(),
          ),
        );
      }
    },
    (error, stackTrace) {
      AppLogger.e(
        'Uncaught Zone Error: $error',
        stackTrace: stackTrace,
      );

      if (kReleaseMode) {
        Sentry.captureException(error, stackTrace: stackTrace);
      }
    },
  );
}

class KovariApp extends ConsumerWidget {
  const KovariApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final auth = ref.watch(authProvider);
    final themeMode = auth.isAuthenticated ? ref.watch(themeProvider) : ThemeMode.light;

    return MaterialApp.router(
      title: 'Kovari',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme,
      darkTheme: AppTheme.darkTheme,
      themeMode: themeMode,
      routerConfig: router,
      builder: (context, child) {
        final Widget content = GestureDetector(
          onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
          child: NotificationListener<ScrollNotification>(
            onNotification: (notification) {
              if (notification is ScrollUpdateNotification &&
                  notification.dragDetails != null) {
                FocusManager.instance.primaryFocus?.unfocus();
              }
              return false;
            },
            child: ScrollConfiguration(
              behavior: const BouncingScrollBehavior(),
              child: Stack(
                children: [
                  child!,
                  // 🧊 [Premium] iOS-style blurred status bar
                  Positioned(
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 50,
                    child: IgnorePointer(
                      child: ClipRect(
                        child: Container(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              stops: const [0.0, 0.2, 0.5, 0.8, 1.0],
                              colors: [
                                (Theme.of(context).brightness == Brightness.dark
                                        ? AppColors.backgroundDark
                                        : AppColors.background)
                                    .withValues(alpha: 1.0),
                                (Theme.of(context).brightness == Brightness.dark
                                        ? AppColors.backgroundDark
                                        : AppColors.background)
                                    .withValues(alpha: 0.8),
                                (Theme.of(context).brightness == Brightness.dark
                                        ? AppColors.backgroundDark
                                        : AppColors.background)
                                    .withValues(alpha: 0.4),
                                (Theme.of(context).brightness == Brightness.dark
                                        ? AppColors.backgroundDark
                                        : AppColors.background)
                                    .withValues(alpha: 0.2),
                                (Theme.of(context).brightness == Brightness.dark
                                        ? AppColors.backgroundDark
                                        : AppColors.background)
                                    .withValues(alpha: 0.0),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const DynamicStatusOverlay(),
                ],
              ),
            ),
          ),
        );

        return content;
      },
    );
  }
}

class BouncingScrollBehavior extends ScrollBehavior {
  const BouncingScrollBehavior();

  @override
  ScrollPhysics getScrollPhysics(BuildContext context) => const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics());
}

/// Ensures a stable device ID exists in TokenStorage.
/// Falls back to creating one if not yet set (e.g. on first launch before
/// SocketService has had a chance to run).
Future<String> _ensureDeviceId(TokenStorage storage) async {
  // We generate a simple time-based ID here to avoid importing the uuid package
  // into main. SocketService will also call saveDeviceId on first connect —
  // both calls write the same key so the second write is a safe no-op.
  final id = '${DateTime.now().millisecondsSinceEpoch.toRadixString(16)}-fcm-bootstrap';
  await storage.saveDeviceId(id);
  return id;
}
