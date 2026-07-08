import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/navigation/routes.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_radius.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/core/widgets/skeletons/kovari_skeletons.dart';
import 'package:mobile/features/groups/models/group.dart';
import 'package:mobile/features/groups/models/hydrated_state.dart';
import 'package:mobile/features/groups/providers/entity_stores.dart';
import 'package:mobile/features/groups/widgets/group_card.dart';
import 'package:mobile/shared/widgets/app_card.dart';
import 'package:mobile/shared/widgets/kovari_refresh_indicator.dart';

class GroupsScreen extends ConsumerStatefulWidget {
  const GroupsScreen({super.key});

  @override
  ConsumerState<GroupsScreen> createState() => _GroupsScreenState();
}

class _GroupsScreenState extends ConsumerState<GroupsScreen>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final groupState = ref.watch(myGroupsStoreProvider);

    return Column(
      children: [
        // Sticky Header with Status Bar Padding
        Padding(
          padding: EdgeInsets.fromLTRB(
            16.0,
            MediaQuery.of(context).padding.top + 16.0,
            16.0,
            16.0,
          ),
          child: Row(
            children: [
              _buildTabButton(
                context,
                'My Groups',
                true,
                onTap: () {
                  debugPrint('💎 [GroupsScreen] Already on My Groups tab');
                },
              ),
              const SizedBox(width: 8),
              _buildTabButton(
                context,
                'New group',
                false,
                onTap: () {
                  debugPrint('🚀 [GroupsScreen] Navigating to Create Group...');
                  const CreateGroupRouteData().push<void>(context);
                },
              ),
            ],
          ),
        ),

        // Scrollable Content
        Expanded(
          child: KovariRefreshIndicator(
            onRefresh: () => ref.read(myGroupsStoreProvider.notifier).refresh(),
            child: CustomScrollView(
              key: const PageStorageKey('groups_scroll'),
              physics: const BouncingScrollPhysics(
                parent: AlwaysScrollableScrollPhysics(),
              ),
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              slivers: [
                // 1. Stale Indicator
                if (groupState.isStale)
                  const SliverToBoxAdapter(
                    child: LinearProgressIndicator(minHeight: 2),
                  ),

                // 2. Body
                _buildSliverContent(context, ref, groupState),

                // 3. Bottom Padding for floating nav
                const SliverToBoxAdapter(child: SizedBox(height: 110)),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSliverContent(
    BuildContext context,
    WidgetRef ref,
    HydratedState<List<GroupModel>> state,
  ) {
    final groups = state.data ?? [];
    if (state.isHydrating && groups.isEmpty) {
      return SliverPadding(
        padding: const EdgeInsets.symmetric(horizontal: 16.0),
        sliver: SliverToBoxAdapter(
          child: AppCard(
            padding: EdgeInsets.zero,
            child: ClipRRect(
              borderRadius: AppRadius.large,
              child: Column(
                children: List.generate(
                  10,
                  (i) => Column(
                    children: [
                      const KovariSkeletonGroupListItem(),
                      if (i < 9)
                        Divider(
                          height: 1,
                          color: AppColors.borderColor(context),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    }

    if (state.error != null && groups.isEmpty) {
      return SliverFillRemaining(
        child: Center(
          child: Text(
            state.error!,
            style: TextStyle(color: AppColors.text(context)),
          ),
        ),
      );
    }

    if (groups.isEmpty) {
      return SliverFillRemaining(
        hasScrollBody: false,
        child: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: AppColors.surface(context, level: 2),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  LucideIcons.users,
                  size: 32,
                  color: AppColors.text(context, isMuted: true),
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'No groups yet',
                style: AppTextStyles.h3.copyWith(
                  color: AppColors.text(context),
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Create or join a group to start planning.',
                style: TextStyle(color: AppColors.text(context, isMuted: true)),
              ),
            ],
          ),
        ),
      );
    }

    return SliverPadding(
      padding: const EdgeInsets.symmetric(horizontal: 16.0),
      sliver: SliverToBoxAdapter(
        child: AppCard(
          padding: EdgeInsets.zero,
          child: ClipRRect(
            borderRadius: AppRadius.large,
            clipBehavior: Clip.antiAliasWithSaveLayer,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Column(
                  children: [
                    for (int i = 0; i < groups.length; i++) ...[
                      RepaintBoundary(
                        child: GroupCard(
                          group: groups[i],
                          onAction: () => GroupDetailsRouteData(
                            groupId: groups[i].id,
                          ).push<void>(context),
                        ),
                      ),
                      if (i < groups.length - 1)
                        Divider(
                          height: 1,
                          color: AppColors.borderColor(context),
                        ),
                    ],
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTabButton(
    BuildContext context,
    String label,
    bool isSelected, {
    VoidCallback? onTap,
  }) => InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 30, vertical: 12),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.primary.withValues(alpha: 0.1)
              : AppColors.surface(context, level: 1),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: AppColors.borderColor(context)),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: AppTextStyles.bodySmall.fontSize,
            fontWeight: FontWeight.w600,
            color: isSelected
                ? AppColors.primary
                : AppColors.text(context, isMuted: true),
          ),
        ),
      ),
    );
}
