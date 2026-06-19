import 'package:flutter/material.dart';
import 'package:mobile/core/theme/app_colors.dart';

/// Shared thresholds for active-status classification.
/// These must match the backend Redis presence TTL contracts.
class PresenceThresholds {
  /// Socket active + last interaction < [activeNowMinutes] → "Active now"
  static const int activeNowMinutes = 2;

  /// Last interaction < [recentlyActiveMinutes] → "Recently active"
  static const int recentlyActiveMinutes = 15;

  /// Last interaction < [lastSeenHoursThreshold] hours → "Active Xm ago" / "Active Xh ago"
  static const int lastSeenHoursThreshold = 24;
}

/// Authoritative presence state classification.
enum PresenceState {
  /// Socket connected and last interaction within [PresenceThresholds.activeNowMinutes].
  online,

  /// Last interaction within [PresenceThresholds.recentlyActiveMinutes].
  activeNow,

  /// Last interaction within [PresenceThresholds.lastSeenHoursThreshold] hours.
  recentlyActive,

  /// Last interaction known but > [PresenceThresholds.lastSeenHoursThreshold] hours.
  lastSeenKnown,

  /// No activity data available.
  unknown,
}

/// Classifies and formats presence state for UI display.
///
/// Usage:
/// ```dart
/// final label = PresenceFormatter.label(
///   isOnline: conv.isPartnerOnline,
///   lastActivityAt: conv.partnerLastActivityAt,
///   lastSeen: conv.partnerLastSeen,
/// );
/// ```
class PresenceFormatter {
  PresenceFormatter._();

  /// Returns the [PresenceState] for a given combination of signals.
  static PresenceState classify({
    required bool isOnline,
    DateTime? lastActivityAt,
    DateTime? lastSeen,
  }) {
    if (isOnline) return PresenceState.online;

    final activityTime = lastActivityAt ?? lastSeen;
    if (activityTime == null) return PresenceState.unknown;

    final now = DateTime.now();
    final diff = now.difference(activityTime);

    if (diff.inMinutes < PresenceThresholds.activeNowMinutes) {
      return PresenceState.activeNow;
    }
    if (diff.inMinutes < PresenceThresholds.recentlyActiveMinutes) {
      return PresenceState.recentlyActive;
    }
    if (diff.inHours < PresenceThresholds.lastSeenHoursThreshold) {
      return PresenceState.lastSeenKnown;
    }
    return PresenceState.lastSeenKnown;
  }

  /// Returns a human-readable presence label string.
  ///
  /// Examples:
  /// - "Online"
  /// - "Active now"
  /// - "Active 5m ago"
  /// - "Active 3h ago"
  /// - "Active yesterday"
  /// - "Active Jan 5"
  static String label({
    required bool isOnline,
    DateTime? lastActivityAt,
    DateTime? lastSeen,
  }) {
    if (isOnline) return 'Online';

    final activityTime = lastActivityAt ?? lastSeen;
    if (activityTime == null) return '';

    final now = DateTime.now();
    final diff = now.difference(activityTime);

    if (diff.inMinutes < PresenceThresholds.activeNowMinutes) {
      return 'Active now';
    }
    if (diff.inMinutes < 60) {
      return 'Active ${diff.inMinutes}m ago';
    }
    if (diff.inHours < PresenceThresholds.lastSeenHoursThreshold) {
      return 'Active ${diff.inHours}h ago';
    }
    if (diff.inDays == 1) {
      return 'Active yesterday';
    }
    if (diff.inDays < 7) {
      return 'Active ${diff.inDays}d ago';
    }
    return '';
  }

  /// Whether to show a green online dot for a given presence state.
  static bool showOnlineDot(PresenceState state) =>
      state == PresenceState.online || state == PresenceState.activeNow;

  /// Returns the color for the presence dot.
  static Color dotColor(BuildContext context, PresenceState state) {
    switch (state) {
      case PresenceState.online:
      case PresenceState.activeNow:
        return const Color(0xFF34D399); // emerald-400
      case PresenceState.recentlyActive:
        return const Color(0xFFFBBF24); // amber-400
      default:
        return AppColors.text(context, isMuted: true);
    }
  }
}
