import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/navigation/routes.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/providers/profile_provider.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_spacing.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/core/widgets/skeletons/kovari_skeletons.dart';
import 'package:mobile/features/chat/models/conversation_entity.dart';
import 'package:mobile/features/chat/providers/conversation_store.dart';
import 'package:mobile/features/chat/screens/chat_screen.dart';
import 'package:mobile/features/chat/utils/direct_chat_id.dart';
import 'package:mobile/features/onboarding/data/profile_service.dart';
import 'package:mobile/features/profile/data/connections_service.dart';
import 'package:mobile/features/profile/models/user_profile.dart';
import 'package:mobile/shared/utils/url_utils.dart';
import 'package:mobile/shared/widgets/app_card.dart';
import 'package:mobile/shared/widgets/kovari_avatar.dart';
import 'package:mobile/shared/widgets/kovari_confirm_dialog.dart';
import 'package:mobile/shared/widgets/kovari_image_modal.dart';

class PublicProfileScreen extends ConsumerStatefulWidget {
  const PublicProfileScreen({super.key, required this.userId});
  final String userId;

  @override
  ConsumerState<PublicProfileScreen> createState() =>
      _PublicProfileScreenState();
}

class _PublicProfileScreenState extends ConsumerState<PublicProfileScreen> {
  UserProfile? _profile;
  bool _isLoading = true;
  String? _error;
  late ProfileService _profileService;
  late ConnectionsService _connectionsService;

  @override
  void initState() {
    super.initState();
    final apiClient = ref.read(apiClientProvider);
    _profileService = ProfileService(apiClient);
    _connectionsService = ConnectionsService(apiClient);
    _fetchProfile();
  }

  Future<void> _fetchProfile() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final profileData = await _profileService.getProfileById(widget.userId);
      if (profileData != null) {
        setState(() {
          _profile = UserProfile.fromJson(profileData);
          _isLoading = false;
        });
      } else {
        setState(() {
          _error = 'User not found';
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  Future<void> _toggleFollow() async {
    if (_profile == null) return;

    final wasFollowing = _profile!.isFollowing;

    if (wasFollowing) {
      // Show confirmation dialog for unfollowing
      showKovariConfirmDialog(
        context: context,
        title: 'Unfollow?',
        content:
            "Kovari won't tell @${_profile!.username} they were unfollowed.",
        confirmLabel: 'Unfollow',
        isDestructive: true,
        onConfirm: () => _executeFollowToggle(wasFollowing),
      );
    } else {
      unawaited(_executeFollowToggle(wasFollowing));
    }
  }

  void _openDirectMessage(UserProfile profile) {
    final myId = ref.read(profileProvider)?.userId;
    if (myId == null || myId.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please wait for your profile to load.')),
      );
      return;
    }
    final partnerId = profile.userId.isNotEmpty
        ? profile.userId
        : widget.userId;
    if (partnerId.isEmpty || partnerId == myId) {
      return;
    }

    final chatId = directChatId(myId, partnerId);
    final avatar = UrlUtils.getFullImageUrl(profile.profileImage);

    ref
        .read(conversationStoreProvider.notifier)
        .upsertConversation(
          ConversationEntity(
            chatId: chatId,
            participantIds: [myId, partnerId],
            partnerName: profile.name,
            partnerAvatar: avatar,
            partnerUserId: partnerId,
            partnerClerkId: partnerId,
          ),
        );

    unawaited(
      Navigator.of(context, rootNavigator: true).push<void>(
        MaterialPageRoute<void>(builder: (_) => ChatScreen(key: ValueKey(chatId), chatId: chatId)),
      ),
    );
  }

  Future<void> _executeFollowToggle(bool wasFollowing) async {
    // Optimistic update
    setState(() {
      _profile = _profile!.copyWith(
        isFollowing: !wasFollowing,
        followers: (int.parse(_profile!.followers) + (wasFollowing ? -1 : 1))
            .toString(),
      );
    });

    try {
      if (wasFollowing) {
        await _connectionsService.unfollowUser(widget.userId);
      } else {
        await _connectionsService.followUser(widget.userId);
      }
    } catch (e) {
      // Revert on error
      setState(() {
        _profile = _profile!.copyWith(
          isFollowing: wasFollowing,
          followers: (int.parse(_profile!.followers) + (wasFollowing ? 1 : -1))
              .toString(),
        );
      });
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: ${e.toString()}')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final currentUserId = ref.watch(profileProvider)?.userId;
    final isMe = widget.userId == currentUserId;

    if (_isLoading) {
      return const Scaffold(body: KovariSkeletonProfile());
    }

    if (_error != null || _profile == null) {
      return Scaffold(
        backgroundColor: AppColors.backgroundColor(context),
        appBar: AppBar(
          backgroundColor: AppColors.backgroundColor(context),
          elevation: 0,
          leading: IconButton(
            icon: Icon(LucideIcons.arrowLeft, color: AppColors.text(context)),
            onPressed: () => context.pop(),
          ),
        ),
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(_error ?? 'User not found'),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _fetchProfile,
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.backgroundColor(context),
      appBar: AppBar(
        backgroundColor: AppColors.backgroundColor(context),
        elevation: 0,
        centerTitle: false,
        titleSpacing: 0,
        leading: IconButton(
          icon: Icon(
            LucideIcons.arrowLeft,
            color: AppColors.text(context),
            size: 20,
          ),
          onPressed: () => context.pop(),
        ),
        title: Text(
          _profile!.username,
          style: AppTextStyles.bodyMedium.copyWith(
            color: AppColors.text(context),
            fontWeight: FontWeight.w600,
            fontSize: 14,
          ),
        ),
      ),
      body: SafeArea(
        bottom: false,
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.md,
                  vertical: AppSpacing.sm,
                ),
                child: Column(
                  children: [
                    _buildHeaderCard(context, _profile!, isMe),
                    const SizedBox(height: 12),
                    _buildContentCard(_profile!),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeaderCard(
    BuildContext context,
    UserProfile profile,
    bool isMe,
  ) => AppCard(
    padding: const EdgeInsets.all(AppSpacing.md),
    borderRadius: BorderRadius.circular(24),
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
                fullName: profile.name,
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    profile.name,
                    style: AppTextStyles.bodyMedium.copyWith(
                      color: AppColors.text(context),
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
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
                        profile.followers,
                        'Followers',
                        onTap: profile.isOwnProfile
                            ? () => ConnectionsRouteData(
                                userId: profile.userId,
                                username: profile.username,
                                initialTab: 'followers',
                              ).push<void>(context)
                            : null,
                      ),
                      const SizedBox(width: 16),
                      _buildStatItem(
                        profile.following,
                        'Following',
                        onTap: profile.isOwnProfile
                            ? () => ConnectionsRouteData(
                                userId: profile.userId,
                                username: profile.username,
                                initialTab: 'following',
                              ).push<void>(context)
                            : null,
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
        if (!isMe) ...[
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Expanded(
                child: _buildActionButton(
                  profile.isFollowing
                      ? 'Following'
                      : (profile.isFollowingMe ? 'Follow Back' : 'Follow'),
                  onPressed: _toggleFollow,
                  backgroundColor: profile.isFollowing
                      ? AppColors.secondaryColor(context)
                      : AppColors.primary,
                  textColor: profile.isFollowing
                      ? AppColors.text(context)
                      : AppColors.primaryForeground,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _buildActionButton(
                  'Message',
                  onPressed: () => _openDirectMessage(profile),
                  backgroundColor: AppColors.secondaryColor(context),
                  textColor: AppColors.text(context),
                ),
              ),
            ],
          ),
        ],
      ],
    ),
  );

  Widget _buildStatItem(String count, String label, {VoidCallback? onTap}) =>
      GestureDetector(
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
    String label, {
    required VoidCallback onPressed,
    required Color backgroundColor,
    required Color textColor,
  }) => SizedBox(
    height: 36,
    child: TextButton(
      onPressed: onPressed,
      style: TextButton.styleFrom(
        backgroundColor: backgroundColor,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        padding: const EdgeInsets.symmetric(horizontal: 16),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: textColor,
          fontSize: 13,
          fontWeight: FontWeight.bold,
        ),
      ),
    ),
  );

  Widget _buildContentCard(UserProfile profile) => AppCard(
    width: double.infinity,
    padding: const EdgeInsets.symmetric(
      horizontal: AppSpacing.md,
      vertical: AppSpacing.lg,
    ),
    borderRadius: BorderRadius.circular(24),
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
        _buildInfoRow(
          _buildInfoItem(
            'AGE',
            profile.age.isEmpty ? 'Not specified' : profile.age,
          ),
          _buildInfoItem(
            'GENDER',
            profile.gender.isEmpty ? 'Not specified' : profile.gender,
          ),
        ),
        const SizedBox(height: 16),
        _buildInfoRow(
          _buildInfoItem(
            'NATIONALITY',
            profile.nationality.isEmpty ? 'Not specified' : profile.nationality,
          ),
          _buildInfoItem(
            'LOCATION',
            profile.location.isEmpty ? 'Not specified' : profile.location,
          ),
        ),
        const SizedBox(height: 16),
        _buildInfoRow(
          _buildInfoItem(
            'PROFESSION',
            profile.profession.isEmpty ? 'Not specified' : profile.profession,
          ),
          _buildInfoItem(
            'RELIGION',
            profile.religion.isEmpty ? 'Not specified' : profile.religion,
          ),
        ),
        const SizedBox(height: 20),
        Divider(height: 1, color: AppColors.borderColor(context)),
        const SizedBox(height: 20),
        _buildInfoRow(
          _buildInfoItem(
            'PERSONALITY',
            profile.personality.isEmpty ? 'Not specified' : profile.personality,
          ),
          _buildInfoItem(
            'FOOD PREFERENCE',
            profile.foodPreference.isEmpty
                ? 'Not specified'
                : profile.foodPreference,
          ),
        ),
        const SizedBox(height: 16),
        _buildInfoRow(
          _buildInfoItem(
            'SMOKING',
            profile.smoking.isEmpty ? 'Not specified' : profile.smoking,
          ),
          _buildInfoItem(
            'DRINKING',
            profile.drinking.isEmpty ? 'Not specified' : profile.drinking,
          ),
        ),
        if (profile.interests.isNotEmpty || profile.languages.isNotEmpty) ...[
          const SizedBox(height: 20),
          Divider(height: 1, color: AppColors.borderColor(context)),
          const SizedBox(height: 20),
          if (profile.interests.isNotEmpty) ...[
            _buildChipsSection('INTERESTS', profile.interests),
            if (profile.languages.isNotEmpty) const SizedBox(height: 20),
          ],
          if (profile.languages.isNotEmpty) ...[
            _buildChipsSection('LANGUAGES', profile.languages),
          ],
        ],
      ],
    ),
  );

  Widget _buildInfoItem(String label, String value) => Column(
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

  Widget _buildChipsSection(String label, List<String> items) => Column(
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
        runSpacing: 4,
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
