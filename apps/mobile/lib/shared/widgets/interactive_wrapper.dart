import 'dart:async';
import 'package:flutter/material.dart';
import 'package:mobile/core/config/interaction_config.dart';
import 'package:mobile/core/services/haptic_service.dart';

enum InteractionState { idle, loading, success, error }

class InteractiveWrapper extends StatefulWidget {
  const InteractiveWrapper({
    super.key,
    required this.child,
    this.onPressed,
    this.enableScale = true,
    this.enableOpacity = false,
    this.hapticType = HapticType.light,
    this.isDisabled = false,
    this.isLoading = false,
    this.isSuccess = false,
    this.isError = false,
    this.borderRadius,
  });
  final Widget child;
  final FutureOr<void> Function()? onPressed;
  final bool enableScale;
  final bool enableOpacity;
  final HapticType hapticType;
  final bool isDisabled;
  final bool isLoading;
  final bool isSuccess;
  final bool isError;
  final BorderRadius? borderRadius;

  @override
  State<InteractiveWrapper> createState() => _InteractiveWrapperState();
}

class _InteractiveWrapperState extends State<InteractiveWrapper>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  bool _isTapped = false;
  bool _isDebouncing = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: InteractionConfig.pressDuration,
    );

    _scaleAnimation = Tween<double>(
      begin: 1.0,
      end: InteractionConfig.pressScale,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));
  }

  @override
  void didUpdateWidget(InteractiveWrapper oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isSuccess && !oldWidget.isSuccess) {
      HapticService.success();
    }
    if (widget.isError && !oldWidget.isError) {
      HapticService.error();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _handleTapDown(TapDownDetails details) {
    if (widget.isDisabled ||
        widget.isLoading ||
        widget.onPressed == null ||
        _isDebouncing) {
      return;
    }

    _controller.forward();
    setState(() => _isTapped = true);
    HapticService.trigger(widget.hapticType);
  }

  void _handleTapCancel() {
    if (widget.isDisabled || widget.isLoading || widget.onPressed == null) {
      return;
    }
    unawaited(_controller.reverse());
    setState(() => _isTapped = false);
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _controller,
    builder: (context, child) {
      var current = child!;

      if (widget.enableScale && !widget.isLoading) {
        current = ScaleTransition(scale: _scaleAnimation, child: current);
      }

      if (widget.enableOpacity) {
        current = AnimatedOpacity(
          duration: InteractionConfig.fast,
          opacity: (_isTapped || widget.isLoading) ? 0.8 : 1.0,
          child: current,
        );
      }

      return Opacity(
        opacity: widget.isDisabled ? 0.5 : 1.0,
        child: Stack(
          children: [
            current,
            Positioned.fill(
              child: IgnorePointer(
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  decoration: BoxDecoration(
                    color: _isTapped
                        ? Colors.white.withValues(alpha: 0.1)
                        : Colors.transparent,
                    borderRadius: widget.borderRadius,
                  ),
                ),
              ),
            ),
            Positioned.fill(
              child: GestureDetector(
                onTapDown: _handleTapDown,
                onTap: _handleInkWellTap,
                onTapCancel: _handleTapCancel,
                behavior: HitTestBehavior.opaque,
              ),
            ),
          ],
        ),
      );
    },
    child: RepaintBoundary(child: widget.child),
  );

  Future<void> _handleInkWellTap() async {
    if (widget.isDisabled ||
        widget.isLoading ||
        widget.onPressed == null ||
        _isDebouncing) {
      return;
    }

    // Call the click handler immediately for instantaneous action
    final action = widget.onPressed?.call();

    // Reset visual press states
    _controller.reverse();
    setState(() {
      _isTapped = false;
      _isDebouncing = true;
    });

    // Fixed short debounce (200ms) to prevent rapid double clicks
    Future<void>.delayed(const Duration(milliseconds: 200), () {
      if (mounted) setState(() => _isDebouncing = false);
    });

    try {
      if (action is Future) {
        await action;
      }
    } catch (_) {
      // Ignored here, handled by caller
    }
  }
}
