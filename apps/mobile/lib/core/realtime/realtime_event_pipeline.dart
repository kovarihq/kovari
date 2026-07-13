import 'dart:async';
import 'dart:io' show Platform;
import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/realtime/socket_service.dart';
import 'package:mobile/core/utils/app_logger.dart';

/// Priorities for realtime events.
enum EventPriority {
  critical, // Immediate execution
  high, // Next VSync frame
  medium, // Batched frame boundary (16-33ms)
  low, // Idle frames
}

/// Pipeline performance and monitoring metrics.
class SocketPipelineMetrics {
  int receivedEvents = 0;
  int queuedEvents = 0;
  int mergedEvents = 0;
  int droppedEvents = 0;
  int expiredEvents = 0;
  int criticalBypassCount = 0;
  int typingCollapsed = 0;
  int receiptCollapsed = 0;
  int retryAttempts = 0;

  Map<String, dynamic> toMap() {
    return {
      'receivedEvents': receivedEvents,
      'queuedEvents': queuedEvents,
      'mergedEvents': mergedEvents,
      'droppedEvents': droppedEvents,
      'expiredEvents': expiredEvents,
      'criticalBypassCount': criticalBypassCount,
      'typingCollapsed': typingCollapsed,
      'receiptCollapsed': receiptCollapsed,
      'retryAttempts': retryAttempts,
    };
  }
}

/// Realtime Event Scheduler & Reconciliation Engine
class RealtimeEventPipeline {
  RealtimeEventPipeline(this._ref) {
    _startListening();
  }

  final Ref _ref;
  final SocketPipelineMetrics metrics = SocketPipelineMetrics();

  // Partitioned queues: Map<chatId, List<PendingEvent>>
  final Map<String, List<_PendingEvent>> _queues = {};
  final List<_PendingBatch> _retryQueue = [];

  final _batchedEventController =
      StreamController<List<SocketEvent>>.broadcast();
  StreamSubscription<SocketEvent>? _rawSubscription;
  bool _frameCallbackScheduled = false;

  // Adaptive backpressure state
  double _lastFrameDurationMs = 16.0;
  int _currentBudget = 50;

  Stream<List<SocketEvent>> get batchedEvents => _batchedEventController.stream;

  void _startListening() {
    _rawSubscription?.cancel();
    _rawSubscription = _ref
        .read(socketServiceProvider.notifier)
        .events
        .listen(_onRawSocketEvent);
  }

  void dispose() {
    _rawSubscription?.cancel();
    _batchedEventController.close();
  }

  /// Categorize event priority.
  EventPriority _classifyPriority(String type) {
    switch (type) {
      case 'receive_message':
      case 'message_persisted':
      case 'gap_found':
      case 'user_typing':
      case 'user_stopped_typing':
        return EventPriority.critical;
      case 'message_delivered_ack':
      case 'messages_seen':
        return EventPriority.high;
      case 'user_online':
      case 'user_offline':
        return EventPriority.medium;
      default:
        return EventPriority.low;
    }
  }

  /// Logical order weight for sorting inside a batch.
  int _eventOrderWeight(String type) {
    switch (type) {
      case 'receive_message':
        return 1;
      case 'message_persisted':
        return 2;
      case 'message_delivered_ack':
        return 3;
      case 'messages_seen':
        return 4;
      case 'user_typing':
      case 'user_stopped_typing':
        return 5;
      default:
        return 6;
    }
  }

  void _onRawSocketEvent(SocketEvent event) {
    metrics.receivedEvents++;

    final data = event.data as Map<String, dynamic>?;
    final chatId = data != null
        ? (data['chatId'] as String? ?? data['groupId'] as String?)
        : null;

    final priority = _classifyPriority(event.type);

    // Critical events bypass buffering and flush immediately
    if (priority == EventPriority.critical || chatId == null) {
      metrics.criticalBypassCount++;
      _batchedEventController.add([event]);
      return;
    }

    // Queue in partitioned queue
    final pending = _PendingEvent(
      event: event,
      priority: priority,
      timestamp: DateTime.now(),
    );

    _queues.putIfAbsent(chatId, () => []).add(pending);
    metrics.queuedEvents++;

    _scheduleFrameFlush();
  }

  void _scheduleFrameFlush() {
    if (_frameCallbackScheduled) return;
    _frameCallbackScheduled = true;

    // In unit tests, there is no VSync pump, so we flush immediately via microtask
    final isTest = Platform.environment.containsKey('FLUTTER_TEST');
    if (isTest) {
      Future.microtask(() {
        _frameCallbackScheduled = false;
        _flushQueues();
      });
      return;
    }

    // Use SchedulerBinding to flush aligned with VSync drawing pipeline
    SchedulerBinding.instance.addPostFrameCallback((Duration timeStamp) {
      _frameCallbackScheduled = false;
      _flushQueues();
    });
  }

  /// Adjust the backpressure budget dynamically depending on frame rendering metrics.
  void updateFrameTiming(double durationMs) {
    _lastFrameDurationMs = durationMs;
    if (durationMs < 8.0) {
      _currentBudget = (_currentBudget + 5).clamp(10, 150);
    } else if (durationMs > 16.0) {
      _currentBudget = (_currentBudget - 5).clamp(10, 150);
    }
  }

  void _flushQueues() {
    final List<SocketEvent> eventsToDispatch = [];
    int processedCount = 0;

    // 1. Process Retries
    if (_retryQueue.isNotEmpty) {
      final now = DateTime.now();
      final retries = List<_PendingBatch>.from(_retryQueue);
      _retryQueue.clear();

      for (final batch in retries) {
        if (batch.retryAt.isBefore(now)) {
          metrics.retryAttempts++;
          _processEventBatch(batch.chatId, batch.events);
        } else {
          _retryQueue.add(batch);
        }
      }
    }

    // 2. Round-Robin flushes across partitioned conversation queues
    final chatIds = _queues.keys.toList();
    for (final chatId in chatIds) {
      final queue = _queues[chatId];
      if (queue == null || queue.isEmpty) {
        _queues.remove(chatId);
        continue;
      }

      // Expire stale typing/presence indicators
      final now = DateTime.now();
      queue.removeWhere((e) {
        if (e.priority == EventPriority.medium &&
            (e.event.type == 'user_typing' ||
                e.event.type == 'user_stopped_typing')) {
          final isExpired = now.difference(e.timestamp).inSeconds >= 3;
          if (isExpired) {
            metrics.expiredEvents++;
            metrics.droppedEvents++;
          }
          return isExpired;
        }
        return false;
      });

      if (queue.isEmpty) continue;

      // Extract batch matching current dynamic budget limit
      final batchSize = _currentBudget - processedCount;
      if (batchSize <= 0) break;

      final batch = queue.take(batchSize).toList();
      queue.removeRange(0, batch.length);

      // Reconcile and coalesce events locally
      final reconciled = _reconcileBatch(
        chatId,
        batch.map((e) => e.event).toList(),
      );
      eventsToDispatch.addAll(reconciled);

      processedCount += batch.length;
    }

    if (eventsToDispatch.isNotEmpty) {
      _batchedEventController.add(eventsToDispatch);
    }
  }

  /// Coalesces typing states, status ticks, and sorts events logically.
  List<SocketEvent> _reconcileBatch(String chatId, List<SocketEvent> events) {
    if (events.length <= 1) return events;

    final List<SocketEvent> reconciled = [];
    final Map<String, SocketEvent> lastTypingPerUser = {};
    final Map<String, SocketEvent> lastSeenEvent = {};
    final Map<String, SocketEvent> lastDeliveryAckPerMsg = {};

    for (final event in events) {
      final data = event.data as Map<String, dynamic>?;
      if (data == null) {
        reconciled.add(event);
        continue;
      }

      // Typing Collapsing
      if (event.type == 'user_typing' || event.type == 'user_stopped_typing') {
        final userId = data['userId'] as String?;
        if (userId != null) {
          lastTypingPerUser[userId] = event;
          metrics.typingCollapsed++;
        }
        continue;
      }

      // Seen Receipts Collapsing
      if (event.type == 'messages_seen') {
        lastSeenEvent[chatId] = event;
        metrics.receiptCollapsed++;
        continue;
      }

      // Delivery Ticks Collapsing
      if (event.type == 'message_delivered_ack') {
        final msgId = data['messageId'] as String?;
        if (msgId != null) {
          lastDeliveryAckPerMsg[msgId] = event;
          metrics.receiptCollapsed++;
        }
        continue;
      }

      reconciled.add(event);
    }

    // Add final states
    reconciled.addAll(lastTypingPerUser.values);
    reconciled.addAll(lastSeenEvent.values);
    reconciled.addAll(lastDeliveryAckPerMsg.values);

    // Apply logical ordering sort (receive_message -> ticks -> typing)
    reconciled.sort(
      (a, b) => _eventOrderWeight(a.type).compareTo(_eventOrderWeight(b.type)),
    );

    metrics.mergedEvents += (events.length - reconciled.length);
    return reconciled;
  }

  void _processEventBatch(String chatId, List<SocketEvent> events) {
    try {
      final reconciled = _reconcileBatch(chatId, events);
      if (reconciled.isNotEmpty) {
        _batchedEventController.add(reconciled);
      }
    } catch (e, stack) {
      AppLogger.e(
        '[RealtimeEventPipeline] Failed to process batch. Deferring to retry.',
        error: e,
        stackTrace: stack,
      );
      _retryQueue.add(
        _PendingBatch(
          chatId: chatId,
          events: events,
          retryAt: DateTime.now().add(const Duration(milliseconds: 500)),
        ),
      );
    }
  }
}

class _PendingEvent {
  _PendingEvent({
    required this.event,
    required this.priority,
    required this.timestamp,
  });

  final SocketEvent event;
  final EventPriority priority;
  final DateTime timestamp;
}

class _PendingBatch {
  _PendingBatch({
    required this.chatId,
    required this.events,
    required this.retryAt,
  });

  final String chatId;
  final List<SocketEvent> events;
  final DateTime retryAt;
}

final realtimeEventPipelineProvider = Provider<RealtimeEventPipeline>((ref) {
  final pipeline = RealtimeEventPipeline(ref);
  ref.onDispose(() => pipeline.dispose());
  return pipeline;
});
