import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/auth/session_manager.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/core/providers/connectivity_provider.dart';
import 'package:mobile/core/providers/nav_provider.dart';
import 'package:mobile/core/providers/status_overlay_provider.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_text_styles.dart';

class DynamicStatusOverlay extends ConsumerStatefulWidget {
  const DynamicStatusOverlay({super.key});

  @override
  ConsumerState<DynamicStatusOverlay> createState() =>
      _DynamicStatusOverlayState();
}

class _DynamicStatusOverlayState extends ConsumerState<DynamicStatusOverlay> {
  Timer? _syncTimer;
  bool _showRetry = false;
  final List<StatusMessage> _displayList = [];

  @override
  void dispose() {
    _syncTimer?.cancel();
    super.dispose();
  }

  void _resetTimer() {
    _syncTimer?.cancel();
    _showRetry = false;
    final sessionManager = ref.read(sessionManagerProvider);
    _syncTimer = Timer(sessionManager.adaptiveTimeout, () {
      if (mounted) setState(() => _showRetry = true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final connectivity = ref.watch(connectivityProvider);
    final statusMessages = ref.watch(statusOverlayProvider);
    final isNavBarVisible = ref.watch(navBarVisibilityProvider);
    final auth = ref.watch(authProvider);

    // Manage timer based on refreshing state
    if (auth.isRefreshing) {
      if (_syncTimer == null) _resetTimer();
    } else {
      _syncTimer?.cancel();
      _syncTimer = null;
      _showRetry = false;
    }

    // Sync provider messages to local display list
    for (final msg in statusMessages) {
      if (!_displayList.any((m) => m.timestamp == msg.timestamp)) {
        _displayList.insert(0, msg);
      }
    }

    // Prepare system statuses
    final systemStatuses = <StatusMessage>[];
    if (!connectivity.isOnline) {
      systemStatuses.add(
        StatusMessage(
          message: 'No internet connection',
          type: StatusType.offline,
        ),
      );
    } else if (auth.isRefreshing) {
      systemStatuses.add(
        StatusMessage(
          message: _showRetry ? 'Tap to Retry' : 'Syncing Data',
          type: StatusType.syncing,
          onAction: _showRetry
              ? () => ref.read(authProvider.notifier).init()
              : null,
        ),
      );
    }

    final activeRoute = ref.watch(activeRouteProvider);
    final isChatScreen =
        activeRoute.contains('/chat/') ||
        activeRoute == 'chat_screen' ||
        activeRoute.contains('/groups/');

    if (isChatScreen) {
      return const SizedBox.shrink();
    }

    final safeTop = MediaQuery.of(context).padding.top;
    final safeBottom = MediaQuery.of(context).padding.bottom;

    // 💎 Social-Elite: Position below header on Chat screen
    final baseTop = isChatScreen ? (safeTop + 48.0) : null;
    final baseBottom = isChatScreen
        ? null
        : (isNavBarVisible ? (70.0 + safeBottom) : (6.0 + safeBottom));

    // Combine manual and system
    final allItems = [..._displayList, ...systemStatuses];

    return AnimatedPositioned(
      duration: const Duration(milliseconds: 400),
      curve: Curves.easeOutCubic,
      top: baseTop,
      bottom: baseBottom,
      left: 16,
      right: 16,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        verticalDirection: isChatScreen
            ? VerticalDirection.down
            : VerticalDirection.up,
        children: allItems.map((status) {
          final isManual = _displayList.contains(status);
          final isStillActive = isManual
              ? statusMessages.any((m) => m.timestamp == status.timestamp)
              : true;

          final accentColor = status.type.defaultAccentColor;

          return TweenAnimationBuilder<double>(
            duration: const Duration(milliseconds: 400),
            curve: isStillActive ? Curves.easeOutCubic : Curves.easeInQuint,
            tween: Tween(begin: 0.0, end: isStillActive ? 1.0 : 0.0),
            builder: (context, value, child) {
              return Align(
                alignment: isChatScreen
                    ? Alignment.topCenter
                    : Alignment.bottomCenter,
                heightFactor: value,
                child: Opacity(
                  opacity: value,
                  child: Transform.scale(
                    scale: 0.8 + (0.2 * value),
                    child: Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: child,
                    ),
                  ),
                ),
              );
            },
            child: SizedBox(
              width: MediaQuery.of(context).size.width - 32,
              child: _SwipeToDismiss(
                key: ValueKey('dismiss_${status.timestamp.toIso8601String()}'),
                onDismissed: () {
                  if (isManual) {
                    ref
                        .read(statusOverlayProvider.notifier)
                        .hide(status.timestamp);
                  }
                },
                child: AnimatedSize(
                  duration: const Duration(milliseconds: 400),
                  curve: Curves.easeOutExpo,
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(
                      24,
                    ), // More card-like for multi-line
                    child: BackdropFilter(
                      filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
                      child: Container(
                        constraints: const BoxConstraints(minHeight: 40),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 20,
                          vertical: 10,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.cardColor(context),
                          borderRadius: BorderRadius.circular(24),
                          border: Border.all(
                            color: AppColors.borderColor(context),
                          ),
                        ),
                        child: _StatusPillContent(
                          key: ValueKey(
                            'content_${status.timestamp.toIso8601String()}',
                          ),
                          icon: status.customIcon ?? status.type.defaultIcon,
                          label: status.message,
                          accentColor:
                              accentColor ??
                              (Theme.of(context).brightness == Brightness.dark
                                  ? Colors.white
                                  : Colors.black),
                          isSpinning: status.type == StatusType.syncing,
                          onAction: status.onAction,
                          actionLabel: status.actionLabel,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
            onEnd: () {
              if (!isStillActive && isManual) {
                setState(() {
                  _displayList.removeWhere(
                    (m) => m.timestamp == status.timestamp,
                  );
                });
              }
            },
          );
        }).toList(),
      ),
    );
  }
}

class _StatusPillContent extends StatelessWidget {
  const _StatusPillContent({
    super.key,
    required this.icon,
    required this.label,
    required this.accentColor,
    this.isSpinning = false,
    this.onAction,
    this.actionLabel,
  });
  final IconData icon;
  final String label;
  final Color accentColor;
  final bool isSpinning;
  final VoidCallback? onAction;
  final String? actionLabel;

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onAction,
    behavior: HitTestBehavior.opaque,
    child: Row(
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        _buildIcon(context),
        const SizedBox(width: 10),
        Flexible(
          child: Text(
            label,
            style: AppTextStyles.bodySmall.copyWith(
              color: AppColors.text(context, isMuted: true),
              fontSize: 14,
              fontWeight: FontWeight.w600,
              decoration: TextDecoration.none,
            ),
            maxLines: 4, // Allow up to 4 lines for details
          ),
        ),
        if (onAction != null) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: accentColor.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  actionLabel ?? 'Action',
                  style: AppTextStyles.bodySmall.copyWith(
                    color: accentColor,
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    decoration: TextDecoration.none,
                  ),
                ),
                const SizedBox(width: 2),
                Icon(LucideIcons.chevronRight, size: 14, color: accentColor),
              ],
            ),
          ),
        ],
      ],
    ),
  );

  Widget _buildIcon(BuildContext context) {
    if (isSpinning) {
      return SizedBox(
        width: 12,
        height: 12,
        child: CircularProgressIndicator(
          strokeWidth: 2,
          valueColor: AlwaysStoppedAnimation<Color>(
            AppColors.text(context, isMuted: true),
          ),
        ),
      );
    }

    return Icon(icon, size: 16, color: accentColor);
  }
}

class _SwipeToDismiss extends StatefulWidget {
  const _SwipeToDismiss({
    super.key,
    required this.child,
    required this.onDismissed,
  });
  final Widget child;
  final VoidCallback onDismissed;

  @override
  State<_SwipeToDismiss> createState() => _SwipeToDismissState();
}

class _SwipeToDismissState extends State<_SwipeToDismiss> {
  double _dragOffset = 0.0;
  bool _isDismissed = false;
  bool _isDragging = false;

  @override
  Widget build(BuildContext context) {
    if (_isDismissed) return const SizedBox.shrink();

    return GestureDetector(
      onHorizontalDragStart: (_) => setState(() => _isDragging = true),
      onHorizontalDragUpdate: (details) {
        setState(() {
          _dragOffset += details.primaryDelta!;
        });
      },
      onHorizontalDragEnd: (details) {
        _isDragging = false;
        if (_dragOffset.abs() > 100 || details.primaryVelocity!.abs() > 500) {
          setState(() {
            _isDismissed = true;
          });
          widget.onDismissed();
        } else {
          setState(() {
            _dragOffset = 0.0;
          });
        }
      },
      child: AnimatedContainer(
        duration: _isDragging
            ? Duration.zero
            : const Duration(milliseconds: 400),
        curve: Curves.easeOutCubic,
        transform: Matrix4.translationValues(_dragOffset, 0, 0),
        child: widget.child,
      ),
    );
  }
}
