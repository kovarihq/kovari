import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_radius.dart';
import 'package:mobile/core/theme/app_text_styles.dart';

class AppTheme {
  static ThemeData get lightTheme => _buildTheme(Brightness.light);
  static ThemeData get darkTheme => _buildTheme(Brightness.dark);

  static ThemeData _buildTheme(Brightness brightness) {
    final isDark = brightness == Brightness.dark;

    final colorScheme = isDark
        ? ColorScheme.dark(
            primary: AppColors.primary,
            secondary: AppColors.secondary,
            surface: AppColors.backgroundDark,
            onSurface: AppColors.foregroundDark,
            surfaceContainer: AppColors.cardDark,
            surfaceContainerHigh: AppColors.elevatedDark,
            error: AppColors.destructive,
            onPrimary: AppColors.primaryForeground,
            onSecondary: AppColors.secondaryForeground,
            outline: AppColors.borderDark,
            outlineVariant: AppColors.borderDark.withValues(alpha: 0.5),
            onSurfaceVariant: AppColors.foregroundDark,
          )
        : ColorScheme.light(
            primary: AppColors.primary,
            secondary: AppColors.secondary,
            surface: AppColors.background,
            onSurface: AppColors.foreground,
            surfaceContainer: AppColors.card,
            surfaceContainerHigh: AppColors.elevated,
            error: AppColors.destructive,
            onSecondary: AppColors.secondaryForeground,
            outline: AppColors.border,
            outlineVariant: AppColors.border.withValues(alpha: 0.5),
            onSurfaceVariant: AppColors.foreground,
          );

    final textTheme =
        GoogleFonts.manropeTextTheme(
          isDark ? ThemeData.dark().textTheme : ThemeData.light().textTheme,
        ).copyWith(
          displayLarge: AppTextStyles.h1.copyWith(
            color: colorScheme.onSurface,
            height: 1.2,
          ),
          headlineLarge: AppTextStyles.h1.copyWith(
            color: colorScheme.onSurface,
            height: 1.2,
          ),
          headlineMedium: AppTextStyles.h2.copyWith(
            color: colorScheme.onSurface,
            height: 1.2,
          ),
          titleLarge: AppTextStyles.h3.copyWith(
            color: colorScheme.onSurface,
            height: 1.3,
          ),
          bodyLarge: AppTextStyles.bodyLarge.copyWith(
            color: colorScheme.onSurface,
            height: 1.5,
          ),
          bodyMedium: AppTextStyles.bodyMedium.copyWith(
            color: colorScheme.onSurface,
            height: 1.5,
          ),
          labelLarge: AppTextStyles.label.copyWith(
            color: colorScheme.onSurface,
            letterSpacing: 0.5,
          ),
        );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: colorScheme.surface,
      canvasColor: colorScheme.surface,
      cardColor: colorScheme.surfaceContainer,
      visualDensity: VisualDensity.standard,
      materialTapTargetSize: MaterialTapTargetSize.padded,
      splashFactory: InkSparkle.splashFactory,
      highlightColor: colorScheme.primary.withValues(alpha: 0.05),
      splashColor: colorScheme.primary.withValues(alpha: 0.1),
      hoverColor: colorScheme.primary.withValues(alpha: 0.04),

      iconTheme: IconThemeData(color: colorScheme.onSurface),
      primaryIconTheme: IconThemeData(color: colorScheme.onPrimary),
      textTheme: textTheme.copyWith(
        titleMedium: AppTextStyles.bodyLarge.copyWith(
          color: colorScheme.onSurface,
        ),
        titleSmall: AppTextStyles.bodySmall.copyWith(
          color: colorScheme.onSurface,
          fontWeight: FontWeight.w600,
        ),
        bodyMedium: AppTextStyles.bodyMedium.copyWith(
          color: colorScheme.onSurface,
        ),
        labelMedium: AppTextStyles.label.copyWith(color: colorScheme.onSurface),
      ),
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: CupertinoPageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        },
      ),

      appBarTheme: AppBarThemeData(
        backgroundColor: colorScheme.surface,
        elevation: 0,
        centerTitle: true,
        scrolledUnderElevation: 0,
        systemOverlayStyle: isDark
            ? SystemUiOverlayStyle.light
            : SystemUiOverlayStyle.dark,
        titleTextStyle: AppTextStyles.h3.copyWith(color: colorScheme.onSurface),
        iconTheme: IconThemeData(color: colorScheme.onSurface),
      ),

      cardTheme: CardThemeData(
        color: colorScheme.surfaceContainer,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: AppRadius.defaultRadius,
          side: BorderSide(color: colorScheme.outline),
        ),
        clipBehavior: Clip.antiAlias,
      ),

      dividerTheme: DividerThemeData(
        color: colorScheme.outline,
        space: 1,
        thickness: 1,
      ),

      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: isDark ? AppColors.inputDark : AppColors.input,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 12,
        ),
        border: OutlineInputBorder(
          borderRadius: AppRadius.defaultRadius,
          borderSide: BorderSide(color: colorScheme.outline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: AppRadius.defaultRadius,
          borderSide: BorderSide(color: colorScheme.outline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: AppRadius.defaultRadius,
          borderSide: BorderSide(color: colorScheme.primary, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: AppRadius.defaultRadius,
          borderSide: BorderSide(color: colorScheme.error),
        ),
        hintStyle: AppTextStyles.bodyMedium.copyWith(
          color: isDark
              ? AppColors.mutedForegroundDark
              : AppColors.mutedForeground,
        ),
      ),

      dialogTheme: DialogThemeData(
        backgroundColor: colorScheme.surfaceContainer,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        titleTextStyle: AppTextStyles.h3.copyWith(color: colorScheme.onSurface),
        contentTextStyle: AppTextStyles.bodyMedium.copyWith(
          color: colorScheme.onSurface,
        ),
      ),

      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: colorScheme.primary,
          foregroundColor: colorScheme.onPrimary,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          shape: const RoundedRectangleBorder(borderRadius: AppRadius.defaultRadius),
          textStyle: AppTextStyles.bodyMedium.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: colorScheme.onSurface,
          side: BorderSide(color: colorScheme.outline),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
          shape: const RoundedRectangleBorder(borderRadius: AppRadius.defaultRadius),
          textStyle: AppTextStyles.bodyMedium.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: colorScheme.primary,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          shape: const RoundedRectangleBorder(borderRadius: AppRadius.defaultRadius),
          textStyle: AppTextStyles.bodyMedium.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: colorScheme.surface,
        selectedItemColor: colorScheme.primary,
        unselectedItemColor: isDark
            ? AppColors.mutedForegroundDark
            : AppColors.mutedForeground,
        type: BottomNavigationBarType.fixed,
        elevation: 8,
        selectedLabelStyle: const TextStyle(
          fontWeight: FontWeight.w600,
          fontSize: 12,
        ),
        unselectedLabelStyle: const TextStyle(
          fontWeight: FontWeight.w500,
          fontSize: 12,
        ),
      ),

      listTileTheme: ListTileThemeData(
        iconColor: colorScheme.onSurface,
        textColor: colorScheme.onSurface,
        titleTextStyle: AppTextStyles.bodyMedium.copyWith(
          fontWeight: FontWeight.w500,
        ),
        subtitleTextStyle: AppTextStyles.bodySmall.copyWith(
          color: isDark
              ? AppColors.mutedForegroundDark
              : AppColors.mutedForeground,
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16),
      ),

      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return colorScheme.onPrimary;
          }
          return null;
        }),
        trackColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) return colorScheme.primary;
          return isDark ? AppColors.mutedDark : AppColors.muted;
        }),
      ),

      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: colorScheme.primary,
        linearTrackColor: colorScheme.primary.withValues(alpha: 0.1),
      ),
      datePickerTheme: DatePickerThemeData(
        backgroundColor: colorScheme.surfaceContainerHigh,
        headerBackgroundColor: colorScheme.surfaceContainerHigh,
        headerForegroundColor: colorScheme.onSurface,
        surfaceTintColor: Colors.transparent,
        todayForegroundColor: WidgetStateProperty.all(colorScheme.primary),
        dayForegroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return colorScheme.onPrimary;
          }
          return colorScheme.onSurface;
        }),
        dayBackgroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return colorScheme.primary;
          }
          return null;
        }),
        yearForegroundColor: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return colorScheme.onPrimary;
          }
          return colorScheme.onSurface;
        }),
        yearStyle: textTheme.bodyLarge?.copyWith(color: colorScheme.onSurface),
        dayStyle: textTheme.bodyMedium?.copyWith(color: colorScheme.onSurface),
        weekdayStyle: textTheme.bodySmall?.copyWith(
          color: colorScheme.onSurface,
        ),
        headerHeadlineStyle: textTheme.headlineMedium?.copyWith(
          color: colorScheme.onSurface,
        ),
        headerHelpStyle: textTheme.labelLarge?.copyWith(
          color: colorScheme.onSurface,
        ),
      ),
      timePickerTheme: TimePickerThemeData(
        backgroundColor: colorScheme.surfaceContainerHigh,
        dayPeriodColor: colorScheme.primary.withValues(alpha: 0.1),
        dayPeriodTextColor: colorScheme.primary,
        dialBackgroundColor: colorScheme.surfaceContainer,
        dialHandColor: colorScheme.primary,
        dialTextColor: colorScheme.onSurface,
        entryModeIconColor: colorScheme.primary,
        helpTextStyle: textTheme.labelLarge,
      ),
      bottomSheetTheme: const BottomSheetThemeData(
        backgroundColor: Colors.transparent,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
      ),
    );
  }
}
