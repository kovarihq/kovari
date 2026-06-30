abstract class CacheMetricsEvent {
  final DateTime timestamp;
  CacheMetricsEvent() : timestamp = DateTime.now();
}

class CacheHitEvent extends CacheMetricsEvent {
  final String chatId;
  CacheHitEvent(this.chatId);
}

class CacheMissEvent extends CacheMetricsEvent {
  final String chatId;
  CacheMissEvent(this.chatId);
}

class DeltaSyncStartedEvent extends CacheMetricsEvent {
  final String chatId;
  DeltaSyncStartedEvent(this.chatId);
}

class DeltaSyncFinishedEvent extends CacheMetricsEvent {
  final String chatId;
  final int syncedCount;
  final Duration duration;
  DeltaSyncFinishedEvent(this.chatId, this.syncedCount, this.duration);
}

class ColdLaunchCompletedEvent extends CacheMetricsEvent {
  final Duration duration;
  ColdLaunchCompletedEvent(this.duration);
}

class MetricsService {
  static final List<CacheMetricsEvent> _events = [];

  static void record(CacheMetricsEvent event) {
    _events.add(event);
    if (_events.length > 1000) {
      _events.removeAt(0); // Cap in-memory metrics logs
    }
  }

  static List<CacheMetricsEvent> getEvents() => List.unmodifiable(_events);
  static void clear() => _events.clear();
}
