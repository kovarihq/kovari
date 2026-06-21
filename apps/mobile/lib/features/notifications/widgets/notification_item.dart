import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_spacing.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/core/widgets/common/user_avatar_fallback.dart';
import 'package:mobile/features/notifications/models/notification_model.dart';

class NotificationItem extends StatelessWidget {

  const NotificationItem({super.key, required this.notification, this.onTap});
  final NotificationModel notification;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.md,
          vertical: AppSpacing.md,
        ),
        decoration: BoxDecoration(
          color: notification.isRead
              ? AppColors.surface(context, level: 1)
              : AppColors.primary.withValues(alpha: 0.2),
          border: Border(
            bottom: BorderSide(color: AppColors.borderColor(context)),
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildAvatar(context),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    notification.title,
                    style: AppTextStyles.bodyMedium.copyWith(
                      fontWeight: FontWeight.w600,
                      color: AppColors.text(context),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: notification.message,
                          style: AppTextStyles.bodySmall.copyWith(
                            color: AppColors.text(context, isMuted: true),
                          ),
                        ),
                        TextSpan(
                          text: ' · ',
                          style: AppTextStyles.label.copyWith(
                            color: AppColors.text(context, isMuted: true),
                          ),
                        ),
                        TextSpan(
                          text: _formatTime(notification.createdAt),
                          style: AppTextStyles.label.copyWith(
                            fontSize: 11,
                            color: AppColors.text(context, isMuted: true),
                          ),
                        ),
                      ],
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Icon(
              LucideIcons.chevronRight,
              size: 16,
              color: AppColors.text(context, isMuted: true),
            ),
          ],
        ),
      ),
    );

  Widget _buildAvatar(BuildContext context) {
    if (notification.type == NotificationType.reportSubmitted) {
      return Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: AppColors.surface(context, level: 2),
          shape: BoxShape.circle,
          border: Border.all(color: AppColors.borderColor(context)),
        ),
        child: Icon(
          LucideIcons.check,
          size: 18,
          color: AppColors.text(context),
        ),
      );
    }

    if (notification.imageUrl != null) {
      return CircleAvatar(
        radius: 20,
        backgroundColor: AppColors.surface(context, level: 2),
        backgroundImage: CachedNetworkImageProvider(notification.imageUrl!),
      );
    }

    return const UserAvatarFallback(size: 40);
  }

  String _formatTime(DateTime date) {
    final now = DateTime.now();
    final difference = now.difference(date);

    if (difference.inMinutes < 60) {
      return '${difference.inMinutes}m';
    } else if (difference.inHours < 24) {
      return '${difference.inHours}h';
    } else {
      return '${difference.inDays}d';
    }
  }
}
