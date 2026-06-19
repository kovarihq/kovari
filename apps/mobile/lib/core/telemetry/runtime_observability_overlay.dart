import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/runtime/runtime_coordinator.dart';

class RuntimeObservabilityOverlay extends ConsumerStatefulWidget {
  const RuntimeObservabilityOverlay({super.key, required this.child});
  final Widget child;

  @override
  ConsumerState<RuntimeObservabilityOverlay> createState() =>
      _RuntimeObservabilityOverlayState();
}

class _RuntimeObservabilityOverlayState
    extends ConsumerState<RuntimeObservabilityOverlay> {
  bool _isVisible = false;
  int _tapCount = 0;
  DateTime? _lastTap;

  void _handleTripleTap() {
    final now = DateTime.now();
    if (_lastTap != null &&
        now.difference(_lastTap!) < const Duration(milliseconds: 500)) {
      _tapCount++;
    } else {
      _tapCount = 1;
    }
    _lastTap = now;

    if (_tapCount >= 5) {
      setState(() => _isVisible = !_isVisible);
      _tapCount = 0;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!kDebugMode) return widget.child;

    return Stack(
      children: [
        widget.child,
        // 🎯 Diagnostic Hotzone (Invisible 80x80 area in top-right)
        Positioned(
          top: 0,
          right: 0,
          child: GestureDetector(
            behavior: HitTestBehavior.translucent,
            onLongPress: () {
              setState(() {
                _tapCount++;
                if (_tapCount >= 5) {
                  _isVisible = !_isVisible;
                  _tapCount = 0;
                }
              });
            },
            child: Container(
              width: 80,
              height: 80,
              color: Colors.transparent,
            ),
          ),
        ),
        if (_isVisible)
          Positioned(top: 100, right: 16, child: _buildMetricPanel(context)),
      ],
    );
  }

  Widget _buildMetricPanel(BuildContext context) {
    final scheduler = ref.watch(runtimeSchedulerProvider);

    return Material(
      color: Colors.black.withValues(alpha: 0.8),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(12),
        width: 160,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _metricRow('QUEUE', scheduler.queueDepth.toString()),
            _metricRow('ACTIVE', scheduler.activeCount.toString()),
            _metricRow('FPS', '60'), // Placeholder for real FPS
            const Divider(color: Colors.white24),
            _metricRow('PII_AUDIT', 'ACTIVE', color: Colors.green),
          ],
        ),
      ),
    );
  }

  Widget _metricRow(String label, String value, {Color? color}) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: Colors.white54,
              fontSize: 10,
              fontWeight: FontWeight.bold,
            ),
          ),
          Text(
            value,
            style: TextStyle(
              color: color ?? Colors.white,
              fontSize: 10,
              fontFamily: 'monospace',
            ),
          ),
        ],
      ),
    );
}
