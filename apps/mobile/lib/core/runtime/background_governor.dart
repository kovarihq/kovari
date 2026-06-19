import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/runtime/runtime_scheduler.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/features/chat/providers/chat_media_service.dart';

class BackgroundGovernor extends WidgetsBindingObserver {

  BackgroundGovernor(this._scheduler, this._ref);
  final RuntimeScheduler _scheduler;
  final Ref _ref;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    switch (state) {
      case AppLifecycleState.paused:
      case AppLifecycleState.inactive:
        _handleBackground();
        break;
      case AppLifecycleState.resumed:
        _handleForeground();
        break;
      default:
        break;
    }
  }

  void _handleBackground() {
    AppLogger.d('🌙 [BackgroundGovernor] App backgrounded. Suspending tasks.');
    
    // 1. Force extreme throttling in scheduler
    _scheduler.setScrollVelocity(50000); 
    
    // 2. Clear image cache to free memory for system
    PaintingBinding.instance.imageCache.clear();
    PaintingBinding.instance.imageCache.clearLiveImages();
  }

  void _handleForeground() {
    AppLogger.d('☀️ [BackgroundGovernor] App foregrounded. Resuming runtime.');
    
    // 1. Reset scheduler throttling gradually
    Future.delayed(const Duration(milliseconds: 500), () {
      _scheduler.setScrollVelocity(0);
    });

    // 2. Recover background uploads
    try {
      _ref.read(chatMediaServiceProvider).recoverBackgroundUploads();
    } catch (e) {
      AppLogger.e('⚠️ [BackgroundGovernor] Background upload recovery failed', error: e);
    }
  }
}
