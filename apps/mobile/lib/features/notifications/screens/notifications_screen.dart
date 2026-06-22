import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/core/widgets/skeletons/kovari_skeletons.dart';
import 'package:mobile/features/notifications/providers/notification_provider.dart';
import 'package:mobile/features/notifications/widgets/notification_item.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() =>
      _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      ref.read(notificationProvider.notifier).fetchNextPage();
    }
  }

  @override
  Widget build(BuildContext context) {
    final notificationsAsync = ref.watch(notificationProvider);

    return Scaffold(
      backgroundColor: AppColors.backgroundColor(context),
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(context, ref),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () => ref
                    .read(notificationProvider.notifier)
                    .refresh(ignoreCache: true),
                color: AppColors.primary,
                child: CustomScrollView(
                  controller: _scrollController,
                  physics: const AlwaysScrollableScrollPhysics(),
                  slivers: [
                    // Main Content
                    if (notificationsAsync.isLoading &&
                        notificationsAsync.notifications.isEmpty)
                      _buildSliverSkeleton(context)
                    else if (notificationsAsync.error != null &&
                        notificationsAsync.notifications.isEmpty)
                      SliverFillRemaining(
                        hasScrollBody: false,
                        child: _buildErrorState(context, ref),
                      )
                    else if (notificationsAsync.notifications.isEmpty)
                      SliverFillRemaining(
                        hasScrollBody: false,
                        child: _buildEmptyState(context),
                      )
                    else
                      SliverList(
                        delegate: SliverChildBuilderDelegate((context, index) {
                          final notification =
                              notificationsAsync.notifications[index];
                          return RepaintBoundary(
                            child: NotificationItem(
                              notification: notification,
                              onTap: () {
                                if (!notification.isRead) {
                                  ref
                                      .read(notificationProvider.notifier)
                                      .markAsRead(notification.id);
                                }
                              },
                            ),
                          );
                        }, childCount: notificationsAsync.notifications.length),
                      ),

                    // Pagination Loading Indicator
                    if (!notificationsAsync.isLoading &&
                        notificationsAsync.notifications.isNotEmpty &&
                        notificationsAsync.isFetchingNextPage)
                      const SliverToBoxAdapter(
                        child: Padding(
                          padding: EdgeInsets.symmetric(vertical: 20),
                          child: Center(
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        ),
                      ),

                    const SliverToBoxAdapter(child: SizedBox(height: 40)),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context, WidgetRef ref) {
    final unreadCountAsync = ref.watch(unreadCountProvider);
    final canMarkAllRead =
        unreadCountAsync.value != null && unreadCountAsync.value! > 0;

    return Container(
      padding: const EdgeInsets.only(left: 4, right: 16, top: 16, bottom: 16),
      decoration: BoxDecoration(
        border: Border(
          bottom: BorderSide(color: AppColors.borderColor(context)),
        ),
        color: Theme.of(context).colorScheme.surfaceContainer,
      ),
      child: Row(
        children: [
          _buildBackButton(context),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              'Notifications',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.text(context),
              ),
            ),
          ),
          TextButton(
            onPressed: canMarkAllRead
                ? () => ref.read(notificationProvider.notifier).markAllAsRead()
                : null,
            style: TextButton.styleFrom(
              padding: EdgeInsets.zero,
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              foregroundColor: AppColors.primary,
              disabledForegroundColor: AppColors.primary.withValues(alpha: 0.5),
            ),
            child: const Text(
              'Mark all as read',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBackButton(BuildContext context) => GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => context.pop(),
      child: Container(
        padding: const EdgeInsets.all(8),
        child: Icon(
          LucideIcons.arrowLeft,
          size: 20,
          color: AppColors.text(context),
        ),
      ),
    );

  Widget _buildEmptyState(BuildContext context) => Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            LucideIcons.bell,
            size: 24,
            color: AppColors.text(context, isMuted: true),
          ),
          const SizedBox(height: 12),
          Text(
            'No notifications',
            style: AppTextStyles.label.copyWith(
              color: AppColors.text(context, isMuted: true),
            ),
          ),
        ],
      ),
    );

  Widget _buildErrorState(BuildContext context, WidgetRef ref) => Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(
            LucideIcons.circleAlert,
            size: 24,
            color: AppColors.destructive,
          ),
          const SizedBox(height: 12),
          Text(
            'Failed to load notifications',
            style: AppTextStyles.label.copyWith(
              color: AppColors.text(context, isMuted: true),
            ),
          ),
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: () => ref.read(notificationProvider.notifier).refresh(),
            child: const Text('Retry'),
          ),
        ],
      ),
    );

  Widget _buildSliverSkeleton(BuildContext context) => SliverList(
      delegate: SliverChildBuilderDelegate((context, index) => const KovariSkeletonNotificationItem(), childCount: 12),
    );
}
