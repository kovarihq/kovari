import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/config/env.dart';

enum ConnectionStatus { offline, online, degraded }

class ConnectivityState {
  const ConnectivityState({required this.status});
  final ConnectionStatus status;
  bool get isOffline => status == ConnectionStatus.offline;
  bool get isOnline => status == ConnectionStatus.online;
  bool get isDegraded => status == ConnectionStatus.degraded;
}

class ConnectivityNotifier extends Notifier<ConnectivityState>
    with WidgetsBindingObserver {
  final Connectivity _connectivity = Connectivity();
  StreamSubscription? _subscription;
  Timer? _heartbeatTimer;
  Timer? _debounceTimer;
  Timer? _backoffTimer;
  ConnectionStatus? _pendingStatus;

  int _successCount = 0;
  int _retryAttempt = 0;

  static const _backoffDelays = [
    Duration(milliseconds: 500),
    Duration(seconds: 1),
    Duration(seconds: 2),
    Duration(seconds: 5),
  ];

  final Dio _dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
    ),
  );

  @override
  ConnectivityState build() {
    WidgetsBinding.instance.addObserver(this);

    ref.onDispose(() {
      WidgetsBinding.instance.removeObserver(this);
      _subscription?.cancel();
      _heartbeatTimer?.cancel();
      _debounceTimer?.cancel();
      _backoffTimer?.cancel();
    });

    _init();
    return const ConnectivityState(status: ConnectionStatus.online);
  }

  void _init() {
    _subscription = _connectivity.onConnectivityChanged.listen((results) {
      if (results.any((r) => r == ConnectivityResult.none)) {
        _updateState(ConnectionStatus.offline);
      } else {
        triggerHealthCheck();
      }
    });

    // Passive foreground heartbeat (5 minutes)
    _heartbeatTimer = Timer.periodic(const Duration(minutes: 5), (_) {
      if (!state.isOffline &&
          WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
        triggerHealthCheck();
      }
    });

    triggerHealthCheck();
  }

  void _updateState(ConnectionStatus newStatus) {
    if (state.status == newStatus) {
      _debounceTimer?.cancel();
      _pendingStatus = null;
      return;
    }

    // 1. Immediate Offline (No debounce for hardware loss)
    if (newStatus == ConnectionStatus.offline) {
      _debounceTimer?.cancel();
      _pendingStatus = null;
      _transitionTo(newStatus);
      return;
    }

    // 2. Online Stability (Require 3 consecutive successes)
    if (newStatus == ConnectionStatus.online && _successCount < 3) {
      debugPrint(
        '🌐 Connectivity Stability check: Success $_successCount/3. Staying ${state.status.name}',
      );
      return;
    }

    if (_pendingStatus == newStatus) return;

    _pendingStatus = newStatus;
    _debounceTimer?.cancel();

    // 3. Asymmetric Debounce
    // degraded: 2s (hide transient server blips)
    // online: 500ms (recovery smoothing)
    final delay = newStatus == ConnectionStatus.degraded
        ? const Duration(seconds: 2)
        : const Duration(milliseconds: 500);

    _debounceTimer = Timer(delay, () {
      if (_pendingStatus == newStatus) {
        _transitionTo(newStatus);
        _pendingStatus = null;
      }
    });
  }

  Future<void> _transitionTo(ConnectionStatus newStatus) async {
    final oldStatus = state.status;
    final type = await _getConnectivityType();
    debugPrint(
      '🚀 [CONNECTIVITY] Transitioning: ${oldStatus.name.toUpperCase()} -> ${newStatus.name.toUpperCase()} (via $type)',
    );
    state = ConnectivityState(status: newStatus);
  }

  Future<String> _getConnectivityType() async {
    final results = await _connectivity.checkConnectivity();
    if (results.any((r) => r == ConnectivityResult.wifi)) return 'WIFI';
    if (results.any((r) => r == ConnectivityResult.mobile)) return 'MOBILE';
    if (results.any((r) => r == ConnectivityResult.ethernet)) return 'ETHERNET';
    return 'NONE';
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // 500ms delay to allow network hardware to wake up
      Future.delayed(const Duration(milliseconds: 500), triggerHealthCheck);
    }
  }

  /// Triggers an immediate health check
  Future<void> triggerHealthCheck() async {
    _backoffTimer?.cancel();
    final url = '${Env.apiBaseUrl}health';
    try {
      final response = await _dio.get(url);
      if (response.statusCode == 200) {
        // Strict Hardware Check: Even if ping succeeds (e.g. via local path),
        // we respect the hardware's report of NO connection.
        final hardwareResults = await _connectivity.checkConnectivity();
        if (hardwareResults.any((r) => r == ConnectivityResult.none)) {
          debugPrint(
            '⚠️ [CONNECTIVITY] Ping succeeded but hardware reports NONE. Staying OFFLINE.',
          );
          _successCount = 0;
          _updateState(ConnectionStatus.offline);
          return;
        }

        _successCount++;
        _retryAttempt = 0;
        _updateState(ConnectionStatus.online);

        // If we haven't reached stability yet, schedule another check soon
        if (_successCount < 3) {
          _backoffTimer = Timer(const Duration(seconds: 1), triggerHealthCheck);
        }
      } else {
        _successCount = 0;
        _handleFailure(
          url,
          'STATUS_${response.statusCode}',
          'Non-200 response',
        );
      }
    } catch (e) {
      _successCount = 0;
      var errorType = 'UNKNOWN';
      var message = e.toString();

      if (e is DioException) {
        errorType = e.type.toString();
        message = e.message ?? message;
      }

      _handleFailure(url, errorType, message);
    }
  }

  Future<void> _handleFailure(String url, String type, String msg) async {
    final results = await _connectivity.checkConnectivity();
    final isHardwareOffline = results.any((r) => r == ConnectivityResult.none);

    if (isHardwareOffline) {
      _updateState(ConnectionStatus.offline);
    } else {
      _updateState(ConnectionStatus.degraded);
    }

    // Exponential Backoff
    final delay =
        _backoffDelays[_retryAttempt.clamp(0, _backoffDelays.length - 1)];
    _retryAttempt++;
    _backoffTimer = Timer(delay, triggerHealthCheck);

    debugPrint(
      '⚠️ Connectivity Check Failed: $url | Type: $type | Next Retry: ${delay.inSeconds}s',
    );
  }
}

final connectivityProvider =
    NotifierProvider<ConnectivityNotifier, ConnectivityState>(
      ConnectivityNotifier.new,
    );
