import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/telemetry/telemetry_priority.dart';
import 'package:mobile/core/telemetry/telemetry_service.dart';
import 'package:mobile/core/utils/app_logger.dart';

// ---------------------------------------------------------------------------
// MessagingTelemetryService
// ---------------------------------------------------------------------------

/// Messaging-specific telemetry instrumentation.
///
/// All events are routed through the existing [TelemetryService] singleton.
/// This service owns the event schema for Workstream 11.
///
/// Events tracked:
/// - `socket_connect`          — socket connected, emits connect latency
/// - `message_send_latency`    — time from optimistic insert to Level-1 ACK
/// - `message_delivery_latency`— time from Level-1 ACK to delivery receipt
/// - `message_seen_latency`    — time from delivery to seen receipt
/// - `offline_queue_depth`     — snapshot of pending mutations in journal
/// - `gap_fill_requested`      — gap fill requested from server
/// - `gap_fill_resolved`       — gap fill response received
/// - `reconnect`               — socket reconnection attempt
/// - `sequence_drift_detected` — anomalous jump in CSN
class MessagingTelemetryService {
  MessagingTelemetryService._();

  static final MessagingTelemetryService _instance =
      MessagingTelemetryService._();
  factory MessagingTelemetryService() => _instance;

  final _telemetry = TelemetryService();

  // ---------------------------------------------------------------------------
  // Socket
  // ---------------------------------------------------------------------------

  /// Record a successful socket connection. [connectLatencyMs] is the time
  /// from the connection attempt to the `onConnect` callback.
  Future<void> recordSocketConnect({
    required int connectLatencyMs,
    required String socketInstanceId,
  }) async {
    AppLogger.d(
      '[MessagingTelemetry] socket_connect — latency: ${connectLatencyMs}ms',
    );
    await _telemetry.logEvent(
      'socket_connect',
      parameters: {
        'connect_latency_ms': connectLatencyMs,
        'socket_instance_id': socketInstanceId,
      },
      priority: TelemetryPriority.normal,
    );
  }

  /// Record a socket reconnection attempt.
  Future<void> recordReconnect({
    required int attempt,
    required String reason,
  }) async {
    AppLogger.d('[MessagingTelemetry] reconnect — attempt $attempt: $reason');
    await _telemetry.logEvent(
      'reconnect',
      parameters: {
        'attempt': attempt,
        'reason': reason,
      },
      priority: TelemetryPriority.normal,
    );
  }

  // ---------------------------------------------------------------------------
  // Message Latencies
  // ---------------------------------------------------------------------------

  /// Record how long it took from the user tapping Send to receiving the
  /// Level-1 socket ACK (status = 'sent').
  Future<void> recordSendLatency({
    required String chatId,
    required String clientMessageId,
    required int latencyMs,
  }) async {
    AppLogger.d(
      '[MessagingTelemetry] message_send_latency: ${latencyMs}ms',
    );
    await _telemetry.logEvent(
      'message_send_latency',
      parameters: {
        'chat_id': chatId,
        'client_message_id': clientMessageId,
        'latency_ms': latencyMs,
      },
      priority: TelemetryPriority.low,
    );
  }

  /// Record the time between Level-1 ACK and the `message_delivered_ack`
  /// socket event being received.
  Future<void> recordDeliveryLatency({
    required String chatId,
    required String messageId,
    required int latencyMs,
  }) async {
    AppLogger.d(
      '[MessagingTelemetry] message_delivery_latency: ${latencyMs}ms',
    );
    await _telemetry.logEvent(
      'message_delivery_latency',
      parameters: {
        'chat_id': chatId,
        'message_id': messageId,
        'latency_ms': latencyMs,
      },
      priority: TelemetryPriority.low,
    );
  }

  /// Record the time between delivery and the `messages_seen` socket event.
  Future<void> recordSeenLatency({
    required String chatId,
    required int latencyMs,
  }) async {
    await _telemetry.logEvent(
      'message_seen_latency',
      parameters: {
        'chat_id': chatId,
        'latency_ms': latencyMs,
      },
      priority: TelemetryPriority.low,
    );
  }

  // ---------------------------------------------------------------------------
  // Gap Recovery
  // ---------------------------------------------------------------------------

  /// Record that a sequence gap was detected and a recovery request was emitted.
  Future<void> recordGapFillRequested({
    required String chatId,
    required int fromSequence,
    required int toSequence,
  }) async {
    final gapSize = toSequence - fromSequence + 1;
    AppLogger.w(
      '[MessagingTelemetry] gap_fill_requested — $chatId [$fromSequence–$toSequence] size=$gapSize',
    );
    await _telemetry.logEvent(
      'gap_fill_requested',
      parameters: {
        'chat_id': chatId,
        'from_sequence': fromSequence,
        'to_sequence': toSequence,
        'gap_size': gapSize,
      },
      priority: TelemetryPriority.high,
    );
  }

  /// Record that a gap fill response was successfully applied.
  Future<void> recordGapFillResolved({
    required String chatId,
    required int recoveredCount,
    required bool fallbackToRest,
  }) async {
    AppLogger.d(
      '[MessagingTelemetry] gap_fill_resolved — $chatId recovered=$recoveredCount fallback=$fallbackToRest',
    );
    await _telemetry.logEvent(
      'gap_fill_resolved',
      parameters: {
        'chat_id': chatId,
        'recovered_count': recoveredCount,
        'fallback_to_rest': fallbackToRest,
      },
      priority: TelemetryPriority.normal,
    );
  }

  // ---------------------------------------------------------------------------
  // Sequence Drift Detection (Workstream 11)
  // ---------------------------------------------------------------------------

  /// Record an anomalous jump in sequence numbers that exceeds [_kDriftThreshold].
  ///
  /// This does not reject the message — it logs and surfaces the anomaly for
  /// investigation. The gap fill pipeline handles recovery.
  ///
  /// Drift is defined as: `receivedSequence > expectedSequence + [_kDriftThreshold]`
  static const int _kDriftThreshold = 50;

  Future<void> recordSequenceDrift({
    required String conversationId,
    required int expectedSequence,
    required int receivedSequence,
  }) async {
    final gapSize = receivedSequence - expectedSequence;
    if (gapSize <= _kDriftThreshold) return; // Not a significant drift

    AppLogger.w(
      '[MessagingTelemetry] 🚨 sequence_drift_detected — '
      'conv=$conversationId expected=$expectedSequence received=$receivedSequence gap=$gapSize',
    );

    await _telemetry.logEvent(
      'sequence_drift_detected',
      parameters: {
        'conversation_id': conversationId,
        'expected_sequence': expectedSequence,
        'received_sequence': receivedSequence,
        'gap_size': gapSize,
      },
      priority: TelemetryPriority.high,
    );
  }

  // ---------------------------------------------------------------------------
  // Offline Queue Depth
  // ---------------------------------------------------------------------------

  /// Snapshot the current offline queue depth for a given conversation.
  /// Call this on reconnect or after failed sends.
  Future<void> recordOfflineQueueDepth({
    required String chatId,
    required int pendingCount,
  }) async {
    if (pendingCount == 0) return;
    AppLogger.d(
      '[MessagingTelemetry] offline_queue_depth — $chatId pending=$pendingCount',
    );
    await _telemetry.logEvent(
      'offline_queue_depth',
      parameters: {
        'chat_id': chatId,
        'pending_count': pendingCount,
      },
      priority: TelemetryPriority.normal,
    );
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

final messagingTelemetryProvider = Provider<MessagingTelemetryService>(
  (_) => MessagingTelemetryService(),
);
