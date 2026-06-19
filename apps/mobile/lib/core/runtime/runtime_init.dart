import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/realtime/realtime_coordinator.dart';
import 'package:mobile/core/realtime/socket_service.dart';
import 'package:mobile/core/realtime/socket_status_watcher.dart';
import 'package:mobile/core/runtime/background_governor.dart';
import 'package:mobile/core/runtime/runtime_coordinator.dart';
import 'package:mobile/features/chat/providers/chat_runtime_providers.dart';

final runtimeInitProvider = FutureProvider<void>((ref) async {
  final scheduler = ref.read(runtimeSchedulerProvider);
  final governor = BackgroundGovernor(scheduler, ref);
  WidgetsBinding.instance.addObserver(governor);

  // Eagerly initialize realtime runtime.
  // SocketService auto-connects/disconnects based on AuthState.
  ref
    ..read(socketServiceProvider)
    ..read(realtimeCoordinatorProvider)
    ..read(socketStatusWatcherProvider)    // surfaces socket state via DynamicStatusOverlay
    ..read(selectiveHydrationProvider)     // manages hot MessageStore windows
    ..read(socketTokenRefreshWatcherProvider); // forces socket reconnect on token refresh

  ref.onDispose(() => WidgetsBinding.instance.removeObserver(governor));
});
