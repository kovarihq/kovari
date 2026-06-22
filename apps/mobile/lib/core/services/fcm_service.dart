import 'dart:async';
import 'dart:convert';

import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/core/auth/token_storage.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/utils/app_logger.dart';

// ---------------------------------------------------------------------------
// Background message handler
// Must be a top-level function — Firebase requirement.
// ---------------------------------------------------------------------------
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  // Firebase is already initialised by the time this runs.
  // FCM automatically shows the system tray notification for
  // data+notification messages — no extra work needed here.
  AppLogger.i('🔔 [FCM] Background message: ${message.messageId}');
}

// ---------------------------------------------------------------------------
// Android notification channels
// ---------------------------------------------------------------------------
const _channelMessages = AndroidNotificationChannel(
  'kovari_messages',
  'Messages',
  description: 'Direct messages and group chat notifications',
  importance: Importance.high,
);

const _channelMatches = AndroidNotificationChannel(
  'kovari_matches',
  'Matches & Requests',
  description: 'Match notifications and connection requests',
);

const _channelGroups = AndroidNotificationChannel(
  'kovari_groups',
  'Groups',
  description: 'Group invitations and activity',
);

// ---------------------------------------------------------------------------
// FCMService — singleton
// ---------------------------------------------------------------------------
class FCMService {
  FCMService._();
  static final FCMService instance = FCMService._();

  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final TokenStorage _tokenStorage = TokenStorage();
  final FlutterLocalNotificationsPlugin _localNotifications =
      FlutterLocalNotificationsPlugin();

  static const _storage = FlutterSecureStorage();
  static const _lastFcmTokenKey = 'kovari_last_fcm_token';

  // The stream that the router/shell listens to for notification taps and
  // foreground toasts. Emits FCM data payload on each event.
  static final _tapBroadcast = _SimpleBroadcast<Map<String, dynamic>>();
  static Stream<Map<String, dynamic>> get onNotificationEvent =>
      _tapBroadcast.stream;

  // -------------------------------------------------------------------------
  // init — call once after Firebase.initializeApp()
  // -------------------------------------------------------------------------
  Future<void> init({required String deviceId}) async {
    // 1. Register background handler (must be first Firebase Messaging call)
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

    // 2. Create Android notification channels
    await _createNotificationChannels();

    // 3. Initialise flutter_local_notifications for foreground display
    await _initLocalNotifications();

    // 4. Request permission (Android 13+ / iOS require explicit grant)
    final settings = await _messaging.requestPermission();
    AppLogger.i(
      '🔔 [FCM] Permission: ${settings.authorizationStatus.name}',
    );
    if (settings.authorizationStatus == AuthorizationStatus.denied) {
      AppLogger.w('🔔 [FCM] User denied notification permission.');
      return;
    }

    // 5. Register token with backend (debounced — skips if token unchanged)
    await _registerToken(deviceId: deviceId);

    // 6. Listen for token refreshes
    _messaging.onTokenRefresh.listen((newToken) async {
      AppLogger.i('🔔 [FCM] Token refreshed — re-registering.');
      await _registerToken(deviceId: deviceId, token: newToken, force: true);
    });

    // 7. Foreground message — show local notification + emit to stream
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

    // 8. Background → foreground tap
    FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationTap);

    // 9. Cold start tap (app was terminated)
    final initialMessage = await _messaging.getInitialMessage();
    if (initialMessage != null) {
      AppLogger.i('🔔 [FCM] Cold start via notification tap.');
      // Small delay so the router finishes mounting before we push a route.
      Future.delayed(const Duration(milliseconds: 500), () {
        _handleNotificationTap(initialMessage);
      });
    }
  }

  // -------------------------------------------------------------------------
  // dispose — call on logout to unregister device from backend
  // -------------------------------------------------------------------------
  Future<void> dispose({required String deviceId}) async {
    try {
      final token = await _tokenStorage.getAccessToken();
      if (token == null) return;

      await http.post(
        Uri.parse('${Env.apiBaseUrl}/api/devices/unregister'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
        body: jsonEncode({'device_id': deviceId}),
      );

      // Clear cached token so next login re-registers fresh
      await _storage.delete(key: _lastFcmTokenKey);
      AppLogger.i('🔔 [FCM] Device unregistered and token cache cleared.');
    } catch (e) {
      AppLogger.w('🔔 [FCM] Unregister failed (non-fatal): $e');
    }
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  Future<void> _createNotificationChannels() async {
    final androidPlugin = _localNotifications
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
    if (androidPlugin == null) return;

    await androidPlugin.createNotificationChannel(_channelMessages);
    await androidPlugin.createNotificationChannel(_channelMatches);
    await androidPlugin.createNotificationChannel(_channelGroups);
    AppLogger.i('🔔 [FCM] Android notification channels created.');
  }

  Future<void> _initLocalNotifications() async {
    const initSettings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
    );
    await _localNotifications.initialize(
      initSettings,
      onDidReceiveNotificationResponse: (response) {
        // Local notification tap — parse payload and route
        if (response.payload != null) {
          try {
            final data = jsonDecode(response.payload!) as Map<String, dynamic>;
            _tapBroadcast.emit({...data, '__foreground': false});
          } catch (_) {}
        }
      },
    );
  }

  Future<void> _registerToken({
    required String deviceId,
    String? token,
    bool force = false,
  }) async {
    try {
      final fcmToken = token ?? await _messaging.getToken();
      if (fcmToken == null) {
        AppLogger.w('🔔 [FCM] Could not obtain FCM token.');
        return;
      }

      // Debounce: skip API call if token is unchanged since last registration
      if (!force) {
        final lastToken = await _storage.read(key: _lastFcmTokenKey);
        if (lastToken == fcmToken) {
          AppLogger.d('🔔 [FCM] Token unchanged — skipping registration.');
          return;
        }
      }

      final authToken = await _tokenStorage.getAccessToken();
      if (authToken == null) {
        AppLogger.w('🔔 [FCM] No auth token — skipping device registration.');
        return;
      }

      final response = await http.post(
        Uri.parse('${Env.apiBaseUrl}/api/devices/register'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $authToken',
        },
        body: jsonEncode({
          'device_id': deviceId,
          'fcm_token': fcmToken,
          'platform': 'android',
          'app_version': Env.appVersion,
          'device_name': 'Android Device',
        }),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        // Cache token to enable debouncing on next cold start
        await _storage.write(key: _lastFcmTokenKey, value: fcmToken);
        AppLogger.i(
          '🔔 [FCM] Token registered. Token: ${fcmToken.substring(0, 20)}...',
        );
      } else {
        AppLogger.w('🔔 [FCM] Registration returned ${response.statusCode}.');
      }
    } catch (e) {
      // Non-fatal: push registration failure must never crash the app.
      AppLogger.w('🔔 [FCM] Token registration failed (non-fatal): $e');
    }
  }

  void _handleForegroundMessage(RemoteMessage message) {
    AppLogger.i(
      '🔔 [FCM] Foreground message: ${message.notification?.title}',
    );

    final entityType = message.data['entity_type'] as String?;
    final channelId = _channelIdForEntityType(entityType);

    // Show as a real system notification even when app is in foreground
    _localNotifications.show(
      message.hashCode,
      message.notification?.title ?? 'Kovari',
      message.notification?.body ?? '',
      NotificationDetails(
        android: AndroidNotificationDetails(
          channelId,
          _channelNameForEntityType(entityType),
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
        ),
      ),
      payload: jsonEncode(message.data),
    );

    // Also emit to stream so the shell can react (e.g. in-app badge update)
    _tapBroadcast.emit({
      ...message.data,
      '__foreground': true,
      '__title': message.notification?.title ?? '',
      '__body': message.notification?.body ?? '',
    });
  }

  void _handleNotificationTap(RemoteMessage message) {
    final entityType = message.data['entity_type'];
    final entityId = message.data['entity_id'];
    AppLogger.i(
      '🔔 [FCM] Tap: entityType=$entityType entityId=$entityId',
    );
    _tapBroadcast.emit({...message.data, '__foreground': false});
  }

  String _channelIdForEntityType(String? entityType) {
    switch (entityType) {
      case 'chat':
        return 'kovari_messages';
      case 'group':
        return 'kovari_groups';
      case 'match':
      case 'request':
        return 'kovari_matches';
      default:
        return 'kovari_messages';
    }
  }

  String _channelNameForEntityType(String? entityType) {
    switch (entityType) {
      case 'chat':
        return 'Messages';
      case 'group':
        return 'Groups';
      case 'match':
      case 'request':
        return 'Matches & Requests';
      default:
        return 'Messages';
    }
  }
}

// ---------------------------------------------------------------------------
// Minimal broadcast stream helper (avoids RxDart dependency)
// ---------------------------------------------------------------------------
class _SimpleBroadcast<T> {
  final List<_BroadcastSink<T>> _sinks = [];

  Stream<T> get stream => Stream<T>.multi((controller) {
        final sink = _BroadcastSink<T>(controller);
        _sinks.add(sink);
        controller.onCancel = () => _sinks.remove(sink);
      });

  void emit(T event) {
    for (final sink in List<_BroadcastSink<T>>.of(_sinks)) {
      sink.add(event);
    }
  }
}

class _BroadcastSink<T> {
  _BroadcastSink(this._controller);

  final MultiStreamController<T> _controller;
  void add(T event) => _controller.add(event);
}
