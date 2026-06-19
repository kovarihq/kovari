import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/config/interaction_config.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/shared/widgets/interactive_wrapper.dart';

class PrimaryButton extends StatelessWidget {

  const PrimaryButton({
    super.key,
    this.text,
    this.onPressed,
    this.isLoading = false,
    this.isSuccess = false,
    this.isError = false,
    this.icon,
    this.height = 44.0, // Increased to 44pt elite standard
    this.width = double.infinity,
    this.backgroundColor,
    this.foregroundColor,
    this.isDestructive = false,
    this.borderRadius = 12,
  });
  final String? text;
  final FutureOr<void> Function()? onPressed;
  final bool isLoading;
  final bool isSuccess;
  final bool isError;
  final IconData? icon;
  final double? height;
  final double width;
  final Color? backgroundColor;
  final Color? foregroundColor;
  final bool isDestructive;
  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    final bg = backgroundColor ??
        (isDestructive ? AppColors.destructive : AppColors.primary);
    final fg = foregroundColor ?? AppColors.primaryForeground;

    return InteractiveWrapper(
      onPressed: onPressed,
      isDisabled: onPressed == null,
      isLoading: isLoading,
      isSuccess: isSuccess,
      isError: isError,
      borderRadius: BorderRadius.circular(borderRadius),
      hapticType: isDestructive ? HapticType.heavy : HapticType.medium,
      child: Container(
        height: height,
        width: width,
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(borderRadius),
          border: Border.all(color: Colors.transparent),
        ),
        child: Center(
          child: AnimatedSwitcher(
            duration: InteractionConfig.fast,
            child: _buildContent(context, fg),
          ),
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context, Color fg) {
    if (isLoading) {
      return SizedBox(
        key: const ValueKey('loading'),
        height: 16,
        width: 16,
        child: CircularProgressIndicator(
          strokeWidth: 2,
          valueColor: AlwaysStoppedAnimation<Color>(fg),
        ),
      );
    }

    if (isSuccess) {
      return Icon(Icons.check_rounded, key: const ValueKey('success'), color: fg, size: 20);
    }

    if (isError) {
      return Icon(Icons.close_rounded, key: const ValueKey('error'), color: fg, size: 20);
    }

    return Row(
      key: const ValueKey('idle'),
      mainAxisSize: MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (icon != null) ...[
          Icon(icon, size: 18, color: fg),
          if (text != null && text!.isNotEmpty) const SizedBox(width: 8),
        ],
        if (text != null && text!.isNotEmpty)
          Text(
            text!,
            style: AppTextStyles.button.copyWith(color: fg, fontWeight: FontWeight.bold),
          ),
      ],
    );
  }
}
