import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/core/widgets/skeletons/kovari_skeletons.dart';
import 'package:mobile/features/groups/models/group.dart';
import 'package:mobile/features/groups/providers/entity_stores.dart';
import 'package:mobile/features/groups/providers/group_details_provider.dart';
import 'package:mobile/features/groups/widgets/group_tab_bar.dart';
import 'package:mobile/features/groups/widgets/tabs/chats_tab.dart';
import 'package:mobile/features/groups/widgets/tabs/itinerary_tab.dart';
import 'package:mobile/features/groups/widgets/tabs/overview_tab.dart';
import 'package:mobile/features/groups/widgets/tabs/settings_tab.dart';
import 'package:mobile/shared/widgets/app_card.dart';
import 'package:mobile/features/chat/providers/conversation_runtime_store.dart';
import 'package:mobile/shared/widgets/kovari_avatar.dart';
import 'package:mobile/shared/widgets/kovari_refresh_indicator.dart';
import 'package:mobile/shared/widgets/primary_button.dart';
import 'package:mobile/shared/widgets/secondary_button.dart';

class GroupDetailsScreen extends ConsumerStatefulWidget {

  GroupDetailsScreen({super.key, required this.groupId}) {
    debugPrint('🚀 [GroupDetailsScreen] Constructor called for ID: $groupId');
  }
  final String groupId;

  @override
  ConsumerState<GroupDetailsScreen> createState() => _GroupDetailsScreenState();
}

class _GroupDetailsScreenState extends ConsumerState<GroupDetailsScreen> {
  final TextEditingController _notesController = TextEditingController();
  bool _isEditingNotes = false;
  int _activeTabIndex = 0;

  @override
  void initState() {
    super.initState();
    // 🛡️ [Hard Architectural Law] Subscribe to runtime state on mount
    Future.microtask(() {
      ref.read(groupStoreProvider.notifier).subscribe(widget.groupId);
      ref.read(membershipStoreProvider.notifier).subscribe(widget.groupId);
      ref.read(memberStoreProvider.notifier).subscribe(widget.groupId);
      ref.read(itineraryStoreProvider.notifier).subscribe(widget.groupId);
    });
  }

  @override
  void dispose() {
    // GC: Cleanup subscriptions
    ref.read(groupStoreProvider.notifier).unsubscribe(widget.groupId);
    ref.read(membershipStoreProvider.notifier).unsubscribe(widget.groupId);
    ref.read(memberStoreProvider.notifier).unsubscribe(widget.groupId);
    ref.read(itineraryStoreProvider.notifier).unsubscribe(widget.groupId);
    _notesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    debugPrint(
      '🏗️ [GroupDetailsScreen] Building screen for ID: ${widget.groupId}',
    );

    // Subscribe reactively to store slices
    final groupState = ref.watch(
      groupStoreProvider.select((s) => s[widget.groupId]),
    );
    final membershipState = ref.watch(
      membershipStoreProvider.select((s) => s[widget.groupId]),
    );

    // 1. Check if we have ANY data to show (Memory or Disk snapshot)
    if (groupState == null || !groupState.hasData) {
      return _buildSkeletonState();
    }

    final group = groupState.data!;

    // 2. Handle Membership Layer
    if (membershipState == null || !membershipState.hasData) {
      return _buildPartialState(group); // Show header at least
    }

    final membership = membershipState.data;

    // Logic for Pending/Join states: Creators bypass the review screen
    if (group.status == 'pending' && !membership!.isCreator) {
      return _buildPendingState(context);
    }

    if (!membership!.isMember && !membership.isCreator) {
      return _buildJoinState(membership);
    }

    // Sync notes controller silently
    if (!_isEditingNotes &&
        group.notes != null &&
        _notesController.text != group.notes) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted &&
            !_isEditingNotes &&
            _notesController.text != group.notes) {
          _notesController.text = group.notes!;
        }
      });
    }

    return Scaffold(
      body: Column(
        children: [
          Container(
            color: Colors.transparent,
            child: SafeArea(bottom: false, child: _buildHeader(group)),
          ),

          GroupTabBar(
            activeIndex: _activeTabIndex,
            onTabChanged: (index) => setState(() => _activeTabIndex = index),
          ),
          Expanded(
            child: NotificationListener<OverscrollIndicatorNotification>(
              onNotification: (notification) {
                // Disable pull-to-refresh overscroll glow on the Chats tab
                if (_activeTabIndex == 1) {
                  notification.disallowIndicator();
                  return true;
                }
                return false;
              },
              child: KovariRefreshIndicator(
                onRefresh: _activeTabIndex == 1
                    ? () async {} // no-op for chats tab
                    : _onRefresh,
                child: IndexedStack(
                  index: _activeTabIndex,
                  children: [
                    OverviewTab(
                      group: group,
                      isEditingNotes: _isEditingNotes,
                      notesController: _notesController,
                      onEditNotesToggle: () =>
                          setState(() => _isEditingNotes = !_isEditingNotes),
                      onTabChange: (index) =>
                          setState(() => _activeTabIndex = index),
                      onViewAllMembers: _showMembersModal,
                    ),
                    ChatsTab(group: group),
                    ItineraryTab(group: group),
                    SettingsTab(
                      group: group,
                      onViewMembers: () {
                        final members = ref
                            .read(memberStoreProvider)[widget.groupId]
                            ?.data;
                        if (members != null) {
                          _showMembersModal(members);
                        }
                      },
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _onRefresh() async {
    // 🚀 Force refresh all entity stores for this group
    await Future.wait([
      ref
          .read(groupStoreProvider.notifier)
          .subscribe(widget.groupId, force: true),
      ref
          .read(membershipStoreProvider.notifier)
          .subscribe(widget.groupId, force: true),
      ref
          .read(memberStoreProvider.notifier)
          .subscribe(widget.groupId, force: true),
    ]);
  }

  Widget _buildSkeletonState() => Scaffold(
      backgroundColor: AppColors.backgroundColor(context),
      body: Column(
        children: [
          SafeArea(bottom: false, child: _buildSkeletonHeader(context)),
          const Expanded(child: KovariSkeletonGroupOverview()),
        ],
      ),
    );

  Widget _buildSkeletonHeader(BuildContext context) => Container(
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
      child: Row(
        children: [
          _buildBackButton(context),
          const SizedBox(width: 4),
          const Skeleton(width: 150, height: 16),
        ],
      ),
    );

  Widget _buildPartialState(GroupModel group) => Scaffold(
      backgroundColor: AppColors.backgroundColor(context),
      body: Column(
        children: [
          Container(
            color: AppColors.backgroundColor(context),
            child: SafeArea(bottom: false, child: _buildHeader(group)),
          ),
          const Expanded(child: KovariSkeletonGroupOverview()),
        ],
      ),
    );

  Widget _buildHeader(GroupModel group) => RepaintBoundary(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 8),
        child: Row(
          children: [
            _buildBackButton(context),
            const SizedBox(width: 4),
            Expanded(
              child: Text(
                group.name,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: AppColors.text(context),
                ),
              ),
            ),
          ],
        ),
      ),
    );

  Widget _buildBackButton(BuildContext context) => IconButton(
      icon: const Icon(LucideIcons.arrowLeft, size: 20),
      onPressed: () => context.pop(),
      color: AppColors.text(context),
      splashRadius: 24,
      tooltip: 'Back',
    );

  Widget _buildPendingState(BuildContext context) => Scaffold(
      appBar: AppBar(backgroundColor: Colors.transparent, elevation: 0),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                LucideIcons.circleAlert,
                size: 34,
                color: AppColors.text(context),
              ),
              const SizedBox(height: 12),
              Text(
                'Group Under Review',
                style: AppTextStyles.h2.copyWith(
                  color: AppColors.text(context),
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              Text(
                'This group is currently pending admin approval and is not available for viewing or interaction.',
                style: AppTextStyles.bodyMedium.copyWith(
                  color: AppColors.mutedForeground,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
              PrimaryButton(
                text: 'Back to Groups',
                onPressed: () => context.pop(),
              ),
            ],
          ),
        ),
      ),
    );

  Widget _buildJoinState(MembershipInfo membership) => Scaffold(
      appBar: AppBar(backgroundColor: Colors.transparent, elevation: 0),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(LucideIcons.users, size: 64, color: AppColors.muted),
              const SizedBox(height: 24),
              Text(
                'Join the group',
                style: AppTextStyles.h2,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              Text(
                'You need to be a member of this group to access its itinerary and notes.',
                style: AppTextStyles.bodyMedium.copyWith(
                  color: AppColors.mutedForeground,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 32),
              PrimaryButton(
                text: membership.hasPendingRequest
                    ? 'Request Pending'
                    : 'Request to Join Group',
                onPressed: membership.hasPendingRequest
                    ? null
                    : () {
                        ref
                            .read(groupActionsProvider(widget.groupId))
                            .joinRequest();
                      },
              ),
              const SizedBox(height: 12),
              SecondaryButton(
                text: 'Back to Groups',
                onPressed: () => context.pop(),
              ),
            ],
          ),
        ),
      ),
    );

  void _showMembersModal(List<GroupMember> members) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => AppCard(
        height: MediaQuery.of(context).size.height * 0.7,
        padding: const EdgeInsets.all(24),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.text(
                    context,
                    isMuted: true,
                  ).withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 24),
            Text('Group Members (${members.length})', style: AppTextStyles.h3),
            const SizedBox(height: 24),
            Expanded(
              child: () {
                final sortedMembers = [...members]
                  ..sort((a, b) {
                    if (a.role == 'admin' && b.role != 'admin') return -1;
                    if (a.role != 'admin' && b.role == 'admin') return 1;
                    return a.name.toLowerCase().compareTo(b.name.toLowerCase());
                  });

                return ListView.builder(
                  itemCount: sortedMembers.length,
                  itemBuilder: (context, index) {
                    final member = sortedMembers[index];
                    final conversations = ref.watch(conversationRuntimeStoreProvider);
                    bool isMemberOnline = false;
                    for (final state in conversations.values) {
                      if (state.conversationType == ConversationType.direct) {
                        final pUserId = state.metadata?.partnerUserId;
                        final pClerkId = state.metadata?.partnerClerkId;
                        if ((pUserId != null && pUserId == member.userIdFromUserTable) ||
                            (pClerkId != null && pClerkId == member.clerkId) ||
                            (pUserId != null && pUserId == member.id) ||
                            (pClerkId != null && pClerkId == member.id)) {
                          isMemberOnline = state.isPartnerOnline;
                          break;
                        }
                      }
                    }
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 16.0),
                      child: Row(
                        children: [
                          KovariAvatar(
                            imageUrl: member.avatar,
                            size: 48,
                            isOnline: isMemberOnline,
                            fullName: member.name,
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  member.name,
                                  style: AppTextStyles.bodyMedium.copyWith(
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                Text(
                                  '@${member.username}',
                                  style: AppTextStyles.bodySmall.copyWith(
                                    color: AppColors.mutedForeground,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          if (member.role == 'admin')
                            Container(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                                vertical: 4,
                              ),
                              decoration: BoxDecoration(
                                color: AppColors.primaryLight,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Text(
                                'Admin',
                                style: TextStyle(
                                  color: AppColors.primary,
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                        ],
                      ),
                    );
                  },
                );
              }(),
            ),
          ],
        ),
      ),
    );
  }
}
