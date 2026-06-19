import 'package:flutter/material.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/widgets/common/kovari_image.dart';
import 'package:mobile/core/widgets/common/user_avatar_fallback.dart';

class KovariAvatar extends StatelessWidget {

  const KovariAvatar({
    super.key,
    required this.imageUrl,
    this.size = 24.0,
    this.isSelected = false,
    this.fullName,
    this.isOnline = false,
    this.borderColor,
  });
  final String? imageUrl;
  final double size;
  final bool isSelected;
  final String? fullName;
  final bool isOnline;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    // If we definitely have no URL, just show fallback
    final Widget avatarWidget;
    if (imageUrl == null || imageUrl!.isEmpty) {
      avatarWidget = _buildFallback();
    } else {
      // Otherwise, stack the image on top of the fallback
      avatarWidget = SizedBox(
        width: size,
        height: size,
        child: Stack(
          alignment: Alignment.center,
          children: [
            _buildFallback(),
            KovariImage(
              imageUrl: imageUrl!,
              width: size,
              height: size,
              borderRadius: BorderRadius.circular(size),
              fadeInDuration: const Duration(milliseconds: 500),
              fadeOutDuration: const Duration(milliseconds: 500),
              placeholder:
                  const SizedBox.shrink(), // Fallback is already underneath
            ),
          ],
        ),
      );
    }

    if (!isOnline) {
      return avatarWidget;
    }

    final double dotSize = (size * 0.28).clamp(8.0, 14.0);
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        children: [
          avatarWidget,
          Positioned(
            bottom: 0,
            right: 0,
            child: Container(
              width: dotSize,
              height: dotSize,
              decoration: BoxDecoration(
                color: const Color(0xFF4CAF50), // Vibrant Green
                shape: BoxShape.circle,
                border: Border.all(
                  color: borderColor ?? AppColors.backgroundColor(context),
                  width: 2.0,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFallback() => UserAvatarFallback(size: size, name: fullName);
}
