import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/features/profile/models/user_connection.dart';
import 'package:mobile/shared/widgets/kovari_avatar.dart';

class UserListItem extends StatelessWidget {
  const UserListItem({
    super.key,
    required this.user,
    required this.type,
    this.isOwnProfile = false,
    this.onActionPressed,
    this.onRemovePressed,
    this.onTap,
    this.isLoading = false,
  });
  final UserConnection user;
  final String type; // 'followers' or 'following'
  final bool isOwnProfile;
  final VoidCallback? onActionPressed;
  final VoidCallback? onRemovePressed;
  final VoidCallback? onTap;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    // Logic for button label matching the web card
    var buttonLabel = '';
    if (isOwnProfile) {
      if (type == 'followers') {
        buttonLabel = user.isFollowing ? 'Message' : 'Follow Back';
      } else {
        buttonLabel = 'Message';
      }
    } else {
      buttonLabel = user.isFollowing ? 'Message' : 'Follow';
    }

    final isPrimaryAction = !isOwnProfile
        ? !user.isFollowing
        : (type == 'followers'
              ? !user.isFollowing
              : false); // Message is secondary in following

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.only(
          left: 12,
          right: 12,
          top: 12,
          bottom: 12,
        ),
        decoration: BoxDecoration(
          color: AppColors.surface(context),
          border: Border(
            bottom: BorderSide(color: AppColors.borderColor(context)),
          ),
        ),
        child: Row(
          children: [
            // Web-Sized Avatar (h-10 w-10 = 40px on mobile)
            KovariAvatar(imageUrl: user.avatar, size: 40),
            const SizedBox(width: 12),

            // User Info (Exact text-xs parity with tighter spacing)
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    user.name,
                    style: AppTextStyles.bodySmall.copyWith(
                      fontWeight: FontWeight.w600,
                      color: AppColors.text(context),
                      height: 1.2,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 3), // Tight gap matching web
                  Text(
                    user.username,
                    style: AppTextStyles.bodySmall.copyWith(
                      color: AppColors.text(context, isMuted: true),
                      height: 1.2,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),

            // Action Buttons
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _buildButton(
                  context: context,
                  label: buttonLabel,
                  onPressed: onActionPressed,
                  isPrimary: isPrimaryAction,
                ),
                if (isOwnProfile && onRemovePressed != null) ...[
                  const SizedBox(width: 6),
                  _buildRemoveButton(context, onRemovePressed!),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildButton({
    required BuildContext context,
    required String label,
    VoidCallback? onPressed,
    bool isPrimary = false,
  }) => SizedBox(
    height: 32,
    child: TextButton(
      onPressed: isLoading ? null : onPressed,
      style: TextButton.styleFrom(
        backgroundColor: isPrimary
            ? AppColors.primary
            : AppColors.secondaryColor(context),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
      child: isLoading
          ? const SizedBox(
              width: 14,
              height: 14,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation<Color>(
                  AppColors.primaryForeground,
                ),
              ),
            )
          : Text(
              label,
              style: AppTextStyles.button.copyWith(
                color: isPrimary
                    ? AppColors.primaryForeground
                    : AppColors.text(context),
                fontSize: 12,
                fontWeight: FontWeight.w500,
              ),
            ),
    ),
  );

  Widget _buildRemoveButton(BuildContext context, VoidCallback onPressed) =>
      SizedBox(
        width: 32,
        height: 32,
        child: IconButton(
          onPressed: isLoading ? null : onPressed,
          icon: const Icon(LucideIcons.x, size: 16),
          style: IconButton.styleFrom(
            backgroundColor: AppColors.secondaryColor(context),
            foregroundColor: AppColors.text(context, isMuted: true),
            padding: EdgeInsets.zero,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
      );
}
