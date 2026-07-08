import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/navigation/routes.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/core/providers/profile_provider.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_spacing.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/core/widgets/skeletons/kovari_skeletons.dart';
import 'package:mobile/features/app_shell/providers/app_shell_provider.dart';
import 'package:mobile/features/profile/models/user_profile.dart';
import 'package:mobile/shared/utils/url_utils.dart';
import 'package:mobile/shared/widgets/app_card.dart';
import 'package:mobile/shared/widgets/kovari_avatar.dart';
import 'package:mobile/shared/widgets/kovari_image_modal.dart';
import 'package:mobile/shared/widgets/kovari_popover.dart';
import 'package:mobile/shared/widgets/kovari_refresh_indicator.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final profile = ref.watch(profileProvider);

    if (profile == null) {
      return const Scaffold(body: KovariSkeletonProfile());
    }

    return Scaffold(
      body: KovariRefreshIndicator(
        onRefresh: () =>
            ref.read(profileProvider.notifier).fetchProfile(ignoreCache: true),
        child: CustomScrollView(
          key: const PageStorageKey('profile_scroll'),
          physics: const BouncingScrollPhysics(
            parent: AlwaysScrollableScrollPhysics(),
          ),
          keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.fromLTRB(
                  AppSpacing.md,
                  MediaQuery.of(context).padding.top + AppSpacing.sm,
                  AppSpacing.md,
                  AppSpacing.sm,
                ),
                child: Column(
                  children: [
                    _buildHeaderCard(context, ref, profile),
                    const SizedBox(height: AppSpacing.mds),
                    _buildContentCard(context, profile),
                  ],
                ),
              ),
            ),
            const SliverToBoxAdapter(child: SizedBox(height: 110)),
          ],
        ),
      ),
    );
  }

  Widget _buildHeaderCard(
    BuildContext context,
    WidgetRef ref,
    UserProfile profile,
  ) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return AppCard(
      padding: const EdgeInsets.all(AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              GestureDetector(
                onTap: () {
                  if (profile.profileImage.isNotEmpty) {
                    KovariImageModal.show(
                      context,
                      UrlUtils.getFullImageUrl(profile.profileImage)!,
                    );
                  }
                },
                child: KovariAvatar(
                  imageUrl: UrlUtils.getFullImageUrl(profile.profileImage),
                  size: 65,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            profile.name,
                            style: AppTextStyles.bodyMedium.copyWith(
                              fontWeight: FontWeight.w600,
                              fontSize: 14,
                              color: AppColors.text(context),
                            ),
                          ),
                        ),
                        KovariPopover(
                          width: 140,
                          offset: const Offset(-115, 30),
                          items: [
                            KovariMenuAction(
                              icon: LucideIcons.settings,
                              label: 'Settings',
                              onTap: () =>
                                  const SettingsRouteData().push<void>(context),
                            ),
                            KovariMenuAction(
                              icon: LucideIcons.shieldCheck,
                              label: 'Safety',
                              onTap: () =>
                                  const SafetyRouteData().push<void>(context),
                            ),
                            KovariMenuAction(
                              icon: LucideIcons.logOut,
                              label: 'Log out',
                              isDestructive: true,
                              onTap: () =>
                                  ref.read(authProvider.notifier).logout(),
                            ),
                          ],
                          child: Icon(
                            LucideIcons.menu,
                            size: 22,
                            color: AppColors.text(context),
                          ),
                        ),
                      ],
                    ),
                    Text(
                      '@${profile.username}',
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.text(context, isMuted: true),
                        fontSize: 12,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        _buildStatItem(
                          context,
                          profile.followers,
                          'Followers',
                          onTap: () => ConnectionsRouteData(
                            userId: profile.userId,
                            username: profile.username,
                            initialTab: 'followers',
                          ).push<void>(context),
                        ),
                        const SizedBox(width: 16),
                        _buildStatItem(
                          context,
                          profile.following,
                          'Following',
                          onTap: () => ConnectionsRouteData(
                            userId: profile.userId,
                            username: profile.username,
                            initialTab: 'following',
                          ).push<void>(context),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            profile.bio.isEmpty ? 'No bio added.' : profile.bio,
            style: AppTextStyles.bodySmall.copyWith(
              color: AppColors.text(context, isMuted: true),
              fontSize: 12,
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Expanded(
                child: _buildActionButton(
                  context,
                  'Edit Profile',
                  onPressed: () =>
                      const EditProfileRouteData().push<void>(context),
                  backgroundColor: AppColors.primary,
                  textColor: Colors.white,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _buildActionButton(
                  context,
                  'Explore',
                  onPressed: () {
                    // Navigate to the Explore tab (index 1)
                    StatefulNavigationShell.of(context).goBranch(1);
                  },
                  backgroundColor: AppColors.secondaryColor(context),
                  textColor: AppColors.text(context),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatItem(
    BuildContext context,
    String count,
    String label, {
    VoidCallback? onTap,
  }) => GestureDetector(
    onTap: onTap,
    behavior: HitTestBehavior.opaque,
    child: Row(
      children: [
        Text(
          count,
          style: TextStyle(
            fontWeight: FontWeight.w600,
            fontSize: 12,
            color: AppColors.text(context),
          ),
        ),
        const SizedBox(width: 4),
        Text(
          label,
          style: TextStyle(
            color: AppColors.text(context),
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    ),
  );

  Widget _buildActionButton(
    BuildContext context,
    String label, {
    required VoidCallback onPressed,
    required Color backgroundColor,
    required Color textColor,
    bool border = false,
  }) => SizedBox(
    height: 32, // Controlled height for "sm" button
    child: TextButton(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        backgroundColor: backgroundColor,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: border
              ? BorderSide(color: AppColors.borderColor(context))
              : BorderSide.none,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 16),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: textColor,
          fontSize: 12,
          fontWeight: FontWeight.bold,
        ),
      ),
    ),
  );

  Widget _buildContentCard(
    BuildContext context,
    UserProfile profile,
  ) => AppCard(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(
      horizontal: AppSpacing.md,
      vertical: AppSpacing.lg,
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(
          width: 50,
          child: Text(
            'About',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: AppColors.primary,
            ),
          ),
        ),
        const SizedBox(height: 4),
        Container(
          width: 50,
          height: 2,
          decoration: BoxDecoration(
            color: AppColors.primary,
            borderRadius: BorderRadius.circular(1),
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        // First section: 3 rows
        _buildInfoRow(
          _buildInfoItem(
            context,
            'AGE',
            profile.age.isEmpty ? 'Not specified' : profile.age,
          ),
          _buildInfoItem(
            context,
            'GENDER',
            profile.gender.isEmpty ? 'Not specified' : profile.gender,
          ),
        ),
        const SizedBox(height: 16),
        _buildInfoRow(
          _buildInfoItem(
            context,
            'NATIONALITY',
            profile.nationality.isEmpty ? 'Not specified' : profile.nationality,
          ),
          _buildInfoItem(
            context,
            'LOCATION',
            profile.location.isEmpty ? 'Not specified' : profile.location,
          ),
        ),
        const SizedBox(height: 16),
        _buildInfoRow(
          _buildInfoItem(
            context,
            'PROFESSION',
            profile.profession.isEmpty ? 'Not specified' : profile.profession,
          ),
          _buildInfoItem(
            context,
            'RELIGION',
            profile.religion.isEmpty ? 'Not specified' : profile.religion,
          ),
        ),
        const SizedBox(height: 20),
        Divider(height: 1, color: AppColors.borderColor(context)),
        const SizedBox(height: 20),
        // Second section: 2 rows
        _buildInfoRow(
          _buildInfoItem(
            context,
            'PERSONALITY',
            profile.personality.isEmpty ? 'Not specified' : profile.personality,
          ),
          _buildInfoItem(
            context,
            'FOOD PREFERENCE',
            profile.foodPreference.isEmpty
                ? 'Not specified'
                : profile.foodPreference,
          ),
        ),
        const SizedBox(height: 16),
        _buildInfoRow(
          _buildInfoItem(
            context,
            'SMOKING',
            profile.smoking.isEmpty ? 'Not specified' : profile.smoking,
          ),
          _buildInfoItem(
            context,
            'DRINKING',
            profile.drinking.isEmpty ? 'Not specified' : profile.drinking,
          ),
        ),
        if (profile.interests.isNotEmpty || profile.languages.isNotEmpty) ...[
          const SizedBox(height: 20),
          Divider(height: 1, color: AppColors.borderColor(context)),
          const SizedBox(height: 20),
          if (profile.interests.isNotEmpty) ...[
            _buildChipsSection(context, 'INTERESTS', profile.interests),
            if (profile.languages.isNotEmpty) const SizedBox(height: 20),
          ],
          if (profile.languages.isNotEmpty) ...[
            _buildChipsSection(context, 'LANGUAGES', profile.languages),
          ],
        ],
      ],
    ),
  );

  Widget _buildInfoItem(BuildContext context, String label, String value) =>
      Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: TextStyle(
              fontSize: 10,
              color: AppColors.text(context, isMuted: true),
              fontWeight: FontWeight.w600,
              letterSpacing: 0.5,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            value,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w500,
              color: AppColors.text(context),
            ),
          ),
        ],
      );

  Widget _buildInfoRow(Widget item1, Widget item2) => Row(
    children: [
      Expanded(child: item1),
      const SizedBox(width: 16),
      Expanded(child: item2),
    ],
  );

  Widget _buildChipsSection(
    BuildContext context,
    String label,
    List<String> items,
  ) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 10,
            color: AppColors.text(context, isMuted: true),
            fontWeight: FontWeight.w600,
            letterSpacing: 0.5,
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: items
              .map(
                (item) => Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: AppColors.secondaryColor(context),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    item,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: AppColors.text(context),
                    ),
                  ),
                ),
              )
              .toList(),
        ),
      ],
    );
  }
}
