import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/config/interaction_config.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/shared/widgets/interactive_wrapper.dart';

class SecondaryButton extends StatelessWidget {
  const SecondaryButton({
    super.key,
    this.text = '',
    this.onPressed,
    this.isLoading = false,
    this.isSuccess = false,
    this.isError = false,
    this.icon,
    this.height = 44.0, // Elite standard
    this.width = double.infinity,
    this.isDate = false,
    this.backgroundColor,
    this.borderRadius = 12,
  });
  final String text;
  final FutureOr<void> Function()? onPressed;
  final bool isLoading;
  final bool isSuccess;
  final bool isError;
  final IconData? icon;
  final double height;
  final double? width;
  final bool isDate;
  final Color? backgroundColor;
  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    final fg = isDate
        ? AppColors.text(context, isMuted: true)
        : AppColors.text(context);

    return InteractiveWrapper(
      onPressed: onPressed,
      isDisabled: onPressed == null,
      isLoading: isLoading,
      isSuccess: isSuccess,
      isError: isError,
      borderRadius: BorderRadius.circular(borderRadius),
      hapticType: HapticType.medium,
      child: Container(
        height: height,
        width: width,
        decoration: BoxDecoration(
          color: backgroundColor ?? AppColors.secondaryColor(context),
          borderRadius: BorderRadius.circular(borderRadius),
          border: Border.all(color: AppColors.borderColor(context)),
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
      return Icon(
        Icons.check_rounded,
        key: const ValueKey('success'),
        color: fg,
        size: 20,
      );
    }

    if (isError) {
      return const Icon(
        Icons.close_rounded,
        key: ValueKey('error'),
        color: Colors.red,
        size: 20,
      );
    }

    return Row(
      key: const ValueKey('idle'),
      mainAxisAlignment: MainAxisAlignment.center,
      mainAxisSize: MainAxisSize.min,
      children: [
        if (icon != null) ...[
          Icon(icon, size: 18, color: fg),
          if (text.isNotEmpty) const SizedBox(width: 8),
        ],
        if (text.isNotEmpty)
          Text(
            text,
            style: AppTextStyles.button.copyWith(
              color: fg,
              fontWeight: isDate ? FontWeight.w500 : FontWeight.bold,
            ),
          ),
      ],
    );
  }
}
