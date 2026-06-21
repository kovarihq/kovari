import 'dart:async';
import 'package:mobile/core/telemetry/runtime_metrics_service.dart';

class FreezeMonitor {
  static const int _freezeThresholdMs = 700;
  static const Duration _checkInterval = Duration(milliseconds: 500);
  
  Timer? _timer;

  void start() {
    var expectedTime = DateTime.now().millisecondsSinceEpoch + _checkInterval.inMilliseconds;
    
    _timer = Timer.periodic(_checkInterval, (timer) {
      final now = DateTime.now().millisecondsSinceEpoch;
      final delay = now - expectedTime;

      if (delay > _freezeThresholdMs) {
        RuntimeMetricsService().reportFreeze(delay);
      }
      
      expectedTime = now + _checkInterval.inMilliseconds;
    });
  }

  void stop() {
    _timer?.cancel();
  }
}
