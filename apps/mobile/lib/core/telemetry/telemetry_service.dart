import 'dart:async';
import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';
import 'package:mobile/core/telemetry/telemetry_budget.dart';
import 'package:mobile/core/telemetry/telemetry_priority.dart';
import 'package:mobile/core/telemetry/telemetry_privacy_audit.dart';
import 'package:mobile/core/telemetry/telemetry_queue.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:sentry_flutter/sentry_flutter.dart';
import 'package:uuid/uuid.dart';

class TelemetryService {
  factory TelemetryService() => _instance;
  TelemetryService._internal();
  FirebaseAnalytics? _analytics;
  FirebaseCrashlytics? _crashlytics;
  final TelemetryQueue _queue = TelemetryQueue();

  final String _sessionId = const Uuid().v4();
  String? _currentTraceId;
  bool _isInternalUser = false;

  static final TelemetryService _instance = TelemetryService._internal();

  void setInternalUser(bool isInternal) {
    _isInternalUser = isInternal;
    AppLogger.i('📊 [Telemetry] Internal testing status configured: $isInternal');
  }

  Future<void> init() async {
    try {
      await _queue.init();

      if (Firebase.apps.isNotEmpty) {
        _analytics = FirebaseAnalytics.instance;
        _crashlytics = FirebaseCrashlytics.instance;

        if (kReleaseMode) {
          await _crashlytics?.setCrashlyticsCollectionEnabled(true);
        }

        await _analytics?.setDefaultEventParameters({
          'session_id': _sessionId,
          'device_profile': _getDeviceProfile(),
        });

        unawaited(_crashlytics?.setCustomKey('session_id', _sessionId) ?? Future.value());
      } else {
        AppLogger.w(
          '⚠️ [TelemetryService] Firebase not initialized (No apps found). Skipping Firebase.',
        );
      }
    } catch (e) {
      AppLogger.w('⚠️ [TelemetryService] Firebase init guard failed: $e');
    }

    Sentry.configureScope((scope) => scope.setTag('session_id', _sessionId));
  }

  Future<void> logEvent(
    String name, {
    Map<String, dynamic>? parameters,
    TelemetryPriority priority = TelemetryPriority.normal,
    String? journeyId,
  }) async {
    if (_isInternalUser) {
      debugPrint('📊 [Telemetry] Suppressed internal test user event: $name');
      return;
    }
    if (!SamplingPolicies.shouldSample(priority)) return;
    if (!TelemetryBudget.canProcessEvent(_queue.length, priority)) return;

    final enrichedParams = _enrichParameters(parameters, priority, journeyId);
    final safeParams = TelemetryPrivacyAudit.scrub(enrichedParams) as Map<String, dynamic>;

    if (kDebugMode) {
      TelemetryPrivacyAudit.isSafe(safeParams);
      debugPrint('📊 [Telemetry] Event: $name | Params: $safeParams');
    }

    // 1. Log to Firebase Analytics
    await _analytics?.logEvent(
      name: name,
      parameters: _mapToFirebase(safeParams),
    );

    // 2. Add breadcrumb to Sentry/Crashlytics if priority is high enough
    if (priority.index <= TelemetryPriority.normal.index) {
      _addBreadcrumb('EVENT: $name | $safeParams');
      unawaited(
        Sentry.addBreadcrumb(
          Breadcrumb(
            message: name,
            data: safeParams,
            category: 'ux_event',
            level: _mapToSentryLevel(priority),
          ),
        ),
      );
    }

    // 3. Enqueue for offline persistence if critical or high
    if (priority.index <= TelemetryPriority.high.index) {
      await _queue.enqueue({'name': name, 'params': safeParams}, priority);
    }
  }

  final List<String> _recentBreadcrumbs = [];

  void _addBreadcrumb(String message) {
    _recentBreadcrumbs.add('${DateTime.now().toIso8601String()}: $message');
    if (_recentBreadcrumbs.length > 20) {
      _recentBreadcrumbs.removeAt(0);
    }
    _crashlytics?.log(message);
  }

  /// 🚨 Reports a non-fatal error with rich context.
  Future<void> logError(
    dynamic error, {
    StackTrace? stackTrace,
    String? reason,
    TelemetryPriority priority = TelemetryPriority.high,
  }) async {
    final context = {
      'reason': reason ?? 'unknown',
      'session_id': _sessionId,
      'trace_id': _currentTraceId ?? 'none',
      'last_route': _lastRoute ?? 'unknown',
      'breadcrumbs': _recentBreadcrumbs.join('\n'),
    };

    if (kReleaseMode) {
      await Future.wait([
        if (_crashlytics != null)
          _crashlytics!.recordError(
            error,
            stackTrace,
            reason: reason,
            information: [context.toString()],
          ),
        Sentry.captureException(
          error,
          stackTrace: stackTrace,
          withScope: (scope) {
            scope.setContexts('runtime', context);
            scope.setTag('priority', priority.name);
            scope.setTag('trace_id', _currentTraceId ?? 'none');
          },
        ),
      ]);
    } else {
      debugPrint(
        '❌ [Telemetry] Error: $error | Reason: $reason | Context: $context',
      );
    }
  }

  void setUserId(String? id) {
    _analytics?.setUserId(id: id);
    _crashlytics?.setUserIdentifier(id ?? 'anonymous');
    Sentry.configureScope((scope) => scope.setUser(SentryUser(id: id)));
  }

  void startTrace(String traceId) {
    _currentTraceId = traceId;
  }

  String? get currentTraceId => _currentTraceId;
  String get sessionId => _sessionId;

  Map<String, dynamic> _enrichParameters(
    Map<String, dynamic>? params,
    TelemetryPriority priority,
    String? journeyId,
  ) => {
      if (params != null) ...params,
      'trace_id': _currentTraceId ?? 'none',
      'session_id': _sessionId,
      if (journeyId != null) 'journey_id': journeyId,
      'priority': priority.name,
      'timestamp': DateTime.now().toIso8601String(),
    };

  String _getDeviceProfile() {
    // Placeholder for actual device info detection
    return kIsWeb ? 'web' : 'mobile';
  }

  Map<String, Object> _mapToFirebase(Map<String, dynamic> params) => params.map((key, value) => MapEntry(key, value.toString()));

  SentryLevel _mapToSentryLevel(TelemetryPriority priority) {
    switch (priority) {
      case TelemetryPriority.critical:
        return SentryLevel.fatal;
      case TelemetryPriority.high:
        return SentryLevel.error;
      case TelemetryPriority.normal:
        return SentryLevel.info;
      default:
        return SentryLevel.debug;
    }
  }

  String? _lastRoute;
  void updateLastRoute(String route) {
    _lastRoute = route;
  }
}
