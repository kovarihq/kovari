import 'package:flutter/material.dart';

class AppColors {
  // --- Standard Tokens (Primitive) ---
  static const Color primary = Color(0xFF1C4DFF);
  static const Color primaryHover = Color(0xFF0033EC);
  static const Color primaryLight = Color(0xFFE4EAFF);
  static const Color primaryForeground = Colors.white;

  static const Color secondary = Color(0xFFf2f2f7);
  static const Color secondaryForeground = Color(0xFF0F172A);

  static const Color accent = Color(0xFF34C759);
  static const Color destructive = Color(0xFFF31260);

  // --- Theme Specific (Light) ---
  static const Color background = Color(0xFFF9FAFB);
  static const Color card = Color(0xFFFFFFFF);
  static const Color elevated = Color(0xFFFFFFFF);
  static const Color foreground = Color(0xFF1C1C1E);
  static const Color muted = Color(0xFFD1D5DB);
  static const Color mutedForeground = Color(0xFF4B5563);
  static const Color border = Color(0xFFE5E7EB);
  static const Color input = Color(0xFFD1D5DB);

  // --- Theme Specific (Dark) ---
  static const Color backgroundDark = Color(0xFF000000);
  static const Color secondaryDark = Color(0xFF11151C);
  static const Color cardDark = Color(0xFF0A0A0D);
  static const Color elevatedDark = Color(0xFF0A0A0D);
  static const Color foregroundDark = Color(0xFFF8FAFC);
  static const Color mutedDark = Color(0xFF11151C);
  static const Color mutedForegroundDark = Color(0xFF9EAABC);
  static const Color borderDark = Color(0xFF11151C);
  static const Color inputDark = Color(0xFF0F172A);

  // --- Dynamic Resolution (Context-Aware) ---

  static bool isDark(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark;

  /// Returns the appropriate background color based on the context theme.
  static Color backgroundColor(BuildContext context) =>
      isDark(context) ? backgroundDark : background;

  /// Returns the appropriate surface color based on the context theme.
  static Color surface(BuildContext context, {int level = 0}) {
    final scheme = Theme.of(context).colorScheme;
    if (level == 0) return scheme.surface;
    if (level == 1) return scheme.surfaceContainer;
    return scheme.surfaceContainerHigh;
  }

  /// Returns the appropriate text color based on the context theme.
  static Color text(BuildContext context, {bool isMuted = false}) {
    final scheme = Theme.of(context).colorScheme;
    if (isMuted) {
      return isDark(context) ? mutedForegroundDark : mutedForeground;
    }
    return scheme.onSurface;
  }

  /// Returns the standard border color for the current theme.
  static Color borderColor(BuildContext context) =>
      Theme.of(context).colorScheme.outline;

  /// Returns the muted background color for the current theme.
  static Color mutedColor(BuildContext context) =>
      isDark(context) ? mutedDark : AppColors.muted;

  /// Returns the muted foreground color for the current theme.
  static Color mutedForegroundColor(BuildContext context) =>
      isDark(context) ? mutedForegroundDark : AppColors.mutedForeground;

  /// Returns the secondary color for the current theme.
  static Color secondaryColor(BuildContext context) =>
      isDark(context) ? secondaryDark : AppColors.secondary;

  /// Returns the input background color for the current theme.
  static Color inputColor(BuildContext context) {
    final dark = isDark(context);
    return dark ? inputDark : AppColors.input;
  }

  static Color cardColor(BuildContext context) =>
      isDark(context) ? cardDark : card;

  static Color elevatedColor(BuildContext context) =>
      isDark(context) ? elevatedDark : elevated;
}
