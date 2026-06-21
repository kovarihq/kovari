import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/auth/auth_repository.dart';
import 'package:mobile/core/auth/token_storage.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/core/providers/connectivity_provider.dart';
import 'package:mobile/core/realtime/socket_state.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:uuid/uuid.dart';

// Persistent event stream that survives provider re-builds
final _eventController = StreamController<SocketEvent>.broadcast();

class SocketService extends Notifier<SocketState> {
  final _uuid = const Uuid();
  final String _instanceId = DateTime.now().millisecondsSinceEpoch
      .toString()
      .substring(7);

  io.Socket? _socket;
  bool _isInitializing = false;
  String? _deviceId;

  // Event stream for other services to listen to
  Stream<SocketEvent> get events => _eventController.stream;

  @override
  SocketState build() {
    ref.keepAlive(); // 🔒 Lock this provider to prevent accidental disposal
    AppLogger.d('🏗️ [SocketService] [$_instanceId] Building provider');

    // Selectively watch only what triggers a connection lifecycle change.
    // This prevents re-builds (and socket churn) when the user profile
    // is refreshed in the background (e.g. bio, name, or stats change).
    final userId = ref.watch(authProvider.select((s) => s.user?.id));
    final isAuthenticated = ref.watch(
      authProvider.select((s) => s.isAuthenticated),
    );
    final isBootstrapping = ref.watch(
      authProvider.select((s) => s.isBootstrapping),
    );

    ref.listen(connectivityProvider, (previous, next) {
      if (next.isOnline && state.isDisconnected) {
        AppLogger.i('🌐 [SocketService] Connection restored. Reconnecting...');
        Future.microtask(() => reconnectWithToken());
      }
    });

    // Register dispose logic only once for this Notifier instance
    ref.onDispose(() {
      AppLogger.i('🔌 [SocketService] [$_instanceId] Provider disposing');
      _disposeSocket();
      // DO NOT close _eventController here as it is shared/persistent
    });

    if (isAuthenticated && !isBootstrapping && userId != null) {
      // If we're already connected, don't reset to 'connecting'
      if (_socket != null && _socket!.connected) {
        return SocketState.connected;
      }

      // Use microtask to avoid side-effects during build
      Future.microtask(() => _init());
      return SocketState.connecting;
    } else {
      _disposeSocket();
      return SocketState.disconnected;
    }
  }

  /// Refreshes the socket connection with a new token without disposing the Notifier instance.
  /// This prevents the event stream from closing and ensures no events are dropped.
  Future<void> reconnectWithToken() async {
    AppLogger.i(
      '🔄 [SocketService] [$_instanceId] Reconnecting with fresh token',
    );
    await _init();
  }

  /// Manually disconnects and cleans up the active socket connection.
  void disconnect() {
    AppLogger.i('🔌 [SocketService] [$_instanceId] Manual disconnect requested');
    _disposeSocket();
  }

  void _safeAddEvent(SocketEvent event) {
    if (!_eventController.isClosed) {
      _eventController.add(event);
    } else {
      AppLogger.w(
        '⚠️ [SocketService] [$_instanceId] CRITICAL: Persistent stream is closed! This should not happen.',
      );
    }
  }

  Future<void> _init() async {
    if (_isInitializing || (_socket != null && _socket!.connected)) return;

    _isInitializing = true;
    state = SocketState.connecting;
    AppLogger.i('🔌 Initiating Socket.io connection to ${Env.socketUrl}');

    final storage = TokenStorage();
    final user = ref.read(authProvider).user;

    if (user == null) {
      state = SocketState.error;
      _isInitializing = false;
      return;
    }

    try {
      // Ensure we have a stable device ID
      _deviceId ??= await _getOrCreateDeviceId(storage);

      // If token is expired or expiring soon, let's refresh it first!
      if (await storage.isExpiringSoon()) {
        AppLogger.i(
          '🔌 [SocketService] Token is expired or expiring soon, refreshing...',
        );
        try {
          await ref
              .read(authRepositoryProvider)
              .refreshToken(requestId: 'SOCKET-INIT-REFRESH');
        } catch (e) {
          AppLogger.e(
            '🔌 [SocketService] Silent refresh failed during socket init',
            error: e,
          );
        }
      }

      final accessToken = await storage.getAccessToken();

      // Clean up previous instance before creating new one
      _disposeSocket();

      _socket = io.io(
        Env.socketUrl,
        io.OptionBuilder()
            .setTransports([
              'websocket',
            ]) // Force websocket - more stable on mobile
            .enableAutoConnect()
            .enableForceNew() // 🔄 Force a new connection to apply refreshed token
            .setReconnectionAttempts(
              999,
            ) // Infinite-like reconnection attempts in production
            .setReconnectionDelay(2000)
            .setAuth({
              'userId': user.id,
              'token': accessToken,
              'deviceId': _deviceId,
              'sessionId': _uuid.v4(),
            })
            .build(),
      );

      _setupListeners();
    } catch (e) {
      AppLogger.e('⚠️ Socket init failed', error: e);
      state = SocketState.error;
    } finally {
      _isInitializing = false;
    }
  }

  void _setupListeners() {
    if (_socket == null) return;

    _socket!.onConnect((_) {
      AppLogger.i('✅ [Socket] Connected: ${_socket!.id}');
      Future.microtask(() => state = SocketState.connected);
    });

    _socket!.onDisconnect((reason) {
      AppLogger.w('🔌 [Socket] Disconnected: $reason');
      Future.microtask(() => state = SocketState.disconnected);
    });

    _socket!.onConnectError((err) async {
      AppLogger.e('⚠️ [Socket] Connection error', error: err);
      Future.microtask(() => state = SocketState.error);

      // Handle invalid token / authentication error from socket server.
      // IMPORTANT: We do NOT propagate auth failures up to logout() from here.
      // A socket auth error is a transient condition (token just rotated, server
      // restarted, etc.) — Instagram/WhatsApp never log you out for this.
      final errMsg = err.toString().toLowerCase();
      if (errMsg.contains('authentication error') ||
          errMsg.contains('invalid token')) {
        AppLogger.w(
          '🔑 [Socket] Auth error on connect. Attempting silent token refresh...',
        );
        try {
          // Attempt a single silent refresh. authRepositoryProvider will NOT
          // logout for SOCKET-CONN-REFRESH requests — it enters degraded mode
          // instead.
          await ref
              .read(authRepositoryProvider)
              .refreshToken(requestId: 'SOCKET-CONN-REFRESH');
          AppLogger.i(
            '🔑 [Socket] Token refreshed successfully. Reconnecting...',
          );
          await reconnectWithToken();
        } catch (e) {
          AppLogger.w(
            '🔑 [Socket] Silent refresh failed: $e. Retrying connection in 5 seconds...',
          );
          // If token refresh fails (e.g. offline transition), retry a full reconnect cycle
          // after a short delay to fetch a fresh token instead of using the socket's stale token auth options.
          Future.delayed(const Duration(seconds: 5), () {
            if (state == SocketState.error ||
                state == SocketState.disconnected) {
              reconnectWithToken();
            }
          });
        }
      }
    });

    _socket!.onError((err) {
      AppLogger.e('⚠️ [Socket] Error', error: err);
      Future.microtask(() => state = SocketState.error);
    });

    _socket!.on('reconnect_attempt', (attempt) {
      AppLogger.d('🔄 Socket reconnection attempt #$attempt');
      Future.microtask(() => state = SocketState.recovering);
    });

    // --- Core Messaging Events ---

    _socket!.on('receive_message', (data) {
      _safeAddEvent(SocketEvent(type: 'receive_message', data: data));
    });

    _socket!.on('message_persisted', (data) {
      _safeAddEvent(SocketEvent(type: 'message_persisted', data: data));
    });

    _socket!.on('messages_seen', (data) {
      _safeAddEvent(SocketEvent(type: 'messages_seen', data: data));
    });

    _socket!.on('message_delivered_ack', (data) {
      _safeAddEvent(SocketEvent(type: 'message_delivered_ack', data: data));
    });

    _socket!.on('user_online', (data) {
      _safeAddEvent(SocketEvent(type: 'user_online', data: data));
    });

    _socket!.on('user_offline', (data) {
      _safeAddEvent(SocketEvent(type: 'user_offline', data: data));
    });

    _socket!.on('user_typing', (data) {
      _safeAddEvent(SocketEvent(type: 'user_typing', data: data));
    });

    _socket!.on('user_stopped_typing', (data) {
      _safeAddEvent(SocketEvent(type: 'user_stopped_typing', data: data));
    });

    _socket!.on('gap_found', (data) {
      _safeAddEvent(SocketEvent(type: 'gap_found', data: data));
    });
  }

  void emit(String event, dynamic data, [Function? callback]) {
    if (_socket == null || !_socket!.connected) {
      AppLogger.w('⚠️ Attempted to emit $event while socket is disconnected');
      return;
    }

    if (callback != null) {
      _socket!.emitWithAck(event, data, ack: callback);
    } else {
      _socket!.emit(event, data);
    }
  }

  Future<String> _getOrCreateDeviceId(TokenStorage storage) async {
    final existing = await storage.getDeviceId();
    if (existing != null) return existing;

    final newId = _uuid.v4();
    await storage.saveDeviceId(newId);
    return newId;
  }

  void _disposeSocket() {
    if (_socket != null) {
      AppLogger.i('🔌 [SocketService] [$_instanceId] Disposing socket');
      _socket!.clearListeners();
      _socket!.off('receive_message');
      _socket!.off('message_delivered_ack');
      _socket!.off('message_persisted');
      _socket!.disconnect();
      _socket!.dispose();
      _socket = null;
      // Only set to disconnected if we aren't about to immediately reconnect/initialize
      if (!_isInitializing) {
        state = SocketState.disconnected;
      }
    }
  }
}

class SocketEvent {
  SocketEvent({required this.type, required this.data});
  final String type;
  final dynamic data;
}

final socketServiceProvider = NotifierProvider<SocketService, SocketState>(
  SocketService.new,
);
