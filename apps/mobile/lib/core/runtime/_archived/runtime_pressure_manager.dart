import 'package:mobile/core/runtime/runtime_scheduler.dart';
import 'package:mobile/core/utils/app_logger.dart';

enum PressureLevel { normal, elevated, critical }

class RuntimePressureManager {

  RuntimePressureManager(this._scheduler);
  final RuntimeScheduler _scheduler;
  
  // Thresholds
  static const int _elevatedThreshold = 3;
  static const int _criticalThreshold = 7;
  int _consecutiveFrameDrops = 0;
  PressureLevel _currentLevel = PressureLevel.normal;

  PressureLevel get currentLevel => _currentLevel;

  void reportFrameDrop() {
    _consecutiveFrameDrops++;
    _evaluatePressure();
  }

  void reportHealthyFrame() {
    if (_consecutiveFrameDrops > 0) {
      _consecutiveFrameDrops = 0;
      _evaluatePressure();
    }
  }

  void _evaluatePressure() {
    final oldLevel = _currentLevel;
    
    if (_consecutiveFrameDrops >= _criticalThreshold) {
      _currentLevel = PressureLevel.critical;
    } else if (_consecutiveFrameDrops >= _elevatedThreshold) {
      _currentLevel = PressureLevel.elevated;
    } else {
      _currentLevel = PressureLevel.normal;
    }

    if (oldLevel != _currentLevel) {
      _applyPolicies();
    }
  }

  void _applyPolicies() {
    AppLogger.w('📉 [RuntimePressureManager] Pressure shifted to: ${_currentLevel.name.toUpperCase()}');
    
    switch (_currentLevel) {
      case PressureLevel.normal:
        _scheduler.setScrollVelocity(0);
        break;
      case PressureLevel.elevated:
        _scheduler.setScrollVelocity(5000); // Start moderate throttling
        break;
      case PressureLevel.critical:
        _scheduler.setScrollVelocity(20000); // Aggressive throttling
        break;
    }
  }
}

// Global Provider
// final pressureManagerProvider = Provider((ref) => RuntimePressureManager(ref.watch(runtimeSchedulerProvider)));
