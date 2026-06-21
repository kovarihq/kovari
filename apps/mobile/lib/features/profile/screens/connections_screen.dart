import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/navigation/routes.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/providers/profile_provider.dart';
import 'package:mobile/core/services/haptic_service.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/core/widgets/skeletons/kovari_skeletons.dart';
import 'package:mobile/features/profile/data/connections_service.dart';
import 'package:mobile/features/profile/models/user_connection.dart';
import 'package:mobile/features/profile/widgets/user_list_item.dart';
import 'package:mobile/shared/widgets/kovari_confirm_dialog.dart';
import 'package:mobile/shared/widgets/kovari_snackbar.dart';

class ConnectionsScreen extends ConsumerStatefulWidget {
  // 'followers' or 'following'

  const ConnectionsScreen({
    super.key,
    required this.userId,
    required this.username,
    this.initialTab = 'followers',
  });
  final String userId;
  final String username;
  final String initialTab;

  @override
  ConsumerState<ConnectionsScreen> createState() => _ConnectionsScreenState();
}

class _ConnectionsScreenState extends ConsumerState<ConnectionsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  late ConnectionsService _service;

  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

  List<UserConnection> _followers = [];
  List<UserConnection> _following = [];
  bool _isLoading = true;
  bool _isFetchingMoreFollowers = false;
  bool _isFetchingMoreFollowing = false;
  bool _hasMoreFollowers = true;
  bool _hasMoreFollowing = true;
  int _followersPage = 1;
  int _followingPage = 1;
  String? _error;

  final ScrollController _followersScrollController = ScrollController();
  final ScrollController _followingScrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(
      length: 2,
      vsync: this,
      initialIndex: widget.initialTab == 'followers' ? 0 : 1,
    );
    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) {
        setState(() {});
      }
    });
    _followersScrollController.addListener(() => _onScroll('followers'));
    _followingScrollController.addListener(() => _onScroll('following'));

    _service = ConnectionsService(ref.read(apiClientProvider));
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    _followersScrollController.dispose();
    _followingScrollController.dispose();
    super.dispose();
  }

  void _onScroll(String type) {
    final controller = type == 'followers'
        ? _followersScrollController
        : _followingScrollController;

    if (controller.position.pixels >=
        controller.position.maxScrollExtent - 200) {
      if (type == 'followers') {
        _fetchMoreFollowers();
      } else {
        _fetchMoreFollowing();
      }
    }
  }

  Future<void> _loadData() async {
    if (!mounted) {
      return;
    }
    setState(() {
      _isLoading = true;
      _error = null;
      _followersPage = 1;
      _followingPage = 1;
      _hasMoreFollowers = true;
      _hasMoreFollowing = true;
    });

    try {
      final followers = await _service.getFollowers(widget.userId);
      final following = await _service.getFollowing(widget.userId);

      if (mounted) {
        setState(() {
          _followers = followers;
          _following = following;
          _hasMoreFollowers = followers.length >= 20;
          _hasMoreFollowing = following.length >= 20;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _fetchMoreFollowers() async {
    if (_isFetchingMoreFollowers ||
        !_hasMoreFollowers ||
        _searchQuery.isNotEmpty) {
      return;
    }

    setState(() => _isFetchingMoreFollowers = true);

    try {
      final nextPage = _followersPage + 1;
      final newFollowers = await _service.getFollowers(
        widget.userId,
        offset: _followersPage * 20,
      );

      if (mounted) {
        setState(() {
          _followers.addAll(newFollowers);
          _followersPage = nextPage;
          _hasMoreFollowers = newFollowers.length >= 20;
          _isFetchingMoreFollowers = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isFetchingMoreFollowers = false);
    }
  }

  Future<void> _fetchMoreFollowing() async {
    if (_isFetchingMoreFollowing ||
        !_hasMoreFollowing ||
        _searchQuery.isNotEmpty) {
      return;
    }

    setState(() => _isFetchingMoreFollowing = true);

    try {
      final nextPage = _followingPage + 1;
      final newFollowing = await _service.getFollowing(
        widget.userId,
        offset: _followingPage * 20,
      );

      if (mounted) {
        setState(() {
          _following.addAll(newFollowing);
          _followingPage = nextPage;
          _hasMoreFollowing = newFollowing.length >= 20;
          _isFetchingMoreFollowing = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _isFetchingMoreFollowing = false);
    }
  }

  Future<void> _handleFollowToggle(UserConnection user) async {
    final originalState = user.isFollowing;
    final userId = user.id;

    // Optimistic UI Update
    setState(() {
      _followers = _followers.map((u) {
        if (u.id == userId) return u.copyWith(isFollowing: !originalState);
        return u;
      }).toList();
      _following = _following.map((u) {
        if (u.id == userId) return u.copyWith(isFollowing: !originalState);
        return u;
      }).toList();
    });

    try {
      if (originalState) {
        await _service.unfollowUser(userId);
      } else {
        await _service.followUser(userId);
      }
      // Re-fetch connections to ensure counts are synced
      final following = await _service.getFollowing(widget.userId);
      if (mounted) {
        setState(() {
          _following = following;
        });
      }
    } catch (e) {
      // Revert on error
      if (mounted) {
        setState(() {
          _followers = _followers.map((u) {
            if (u.id == userId) return u.copyWith(isFollowing: originalState);
            return u;
          }).toList();
          _following = _following.map((u) {
            if (u.id == userId) return u.copyWith(isFollowing: originalState);
            return u;
          }).toList();
        });
        KovariSnackbar.error(context, 'Error: ${e.toString()}');
      }
    }
  }

  Future<void> _handleRemoveFollower(UserConnection user) async {
    final userId = user.id;

    // Show confirmation dialog
    showKovariConfirmDialog(
      context: context,
      title: 'Remove Follower?',
      content:
          "Kovari won't tell @${user.username} they were removed from your followers.",
      confirmLabel: 'Remove',
      isDestructive: true,
      onConfirm: () async {
        // Optimistic UI Update
        final originalFollowers = List<UserConnection>.from(_followers);
        setState(() {
          _followers = _followers.where((u) => u.id != userId).toList();
        });

        try {
          await _service.removeFollower(userId);
        } catch (e) {
          // Revert on error
          if (mounted) {
            setState(() {
              _followers = originalFollowers;
            });
            ScaffoldMessenger.of(
              context,
            ).showSnackBar(SnackBar(content: Text('Error: ${e.toString()}')));
          }
        }
      },
    );
  }

  Future<void> _handleUnfollow(UserConnection user) async {
    final userId = user.id;

    // Show confirmation dialog
    showKovariConfirmDialog(
      context: context,
      title: 'Unfollow?',
      content: "Kovari won't tell ${user.name} they were unfollowed.",
      confirmLabel: 'Unfollow',
      isDestructive: true,
      onConfirm: () async {
        // Optimistic UI Update
        final originalFollowing = List<UserConnection>.from(_following);
        setState(() {
          _following = _following.where((u) => u.id != userId).toList();
        });

        try {
          await _service.unfollowUser(userId);
        } catch (e) {
          // Revert on error
          if (mounted) {
            setState(() {
              _following = originalFollowing;
            });
            ScaffoldMessenger.of(
              context,
            ).showSnackBar(SnackBar(content: Text('Error: ${e.toString()}')));
          }
        }
      },
    );
  }

  List<UserConnection> _getFilteredList(List<UserConnection> list) {
    if (_searchQuery.isEmpty) return list;
    return list.where((user) {
      final query = _searchQuery.toLowerCase();
      return user.name.toLowerCase().contains(query) ||
          user.username.toLowerCase().contains(query);
    }).toList();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: NestedScrollView(
      headerSliverBuilder: (context, innerBoxIsScrolled) => [
        // Premium App Bar & Tabs
        SliverOverlapAbsorber(
          handle: NestedScrollView.sliverOverlapAbsorberHandleFor(context),
          sliver: SliverAppBar(
            pinned: true,
            elevation: 0,
            backgroundColor: AppColors.surface(context),
            leading: IconButton(
              icon: Icon(
                LucideIcons.arrowLeft,
                color: AppColors.text(context),
                size: 20,
              ),
              onPressed: () => context.pop(),
            ),
            centerTitle: false,
            titleSpacing: 0, // Tighten gap between back icon and title
            title: _isLoading && widget.username.isEmpty
                ? const KovariSkeletonCard(width: 80, height: 14)
                : Text(
                    widget.username,
                    style: AppTextStyles.h3.copyWith(
                      color: AppColors.text(context),
                      fontSize: 14, // Maintaining exact size as requested
                    ),
                  ),
            bottom: PreferredSize(
              preferredSize: const Size.fromHeight(48),
              child: DecoratedBox(
                decoration: BoxDecoration(color: AppColors.surface(context)),
                child: TabBar(
                  controller: _tabController,
                  overlayColor: WidgetStateProperty.all(Colors.transparent),
                  indicatorColor: AppColors.primary,
                  indicatorSize: TabBarIndicatorSize.tab,
                  dividerColor: AppColors.borderColor(context),
                  dividerHeight: 1,
                  onTap: (index) {
                    HapticService.selection();
                    // Clear search when switching tabs
                    if (_searchQuery.isNotEmpty) {
                      _searchController.clear();
                      setState(() => _searchQuery = '');
                    }
                  },
                  labelColor: AppColors.primary,
                  unselectedLabelColor: AppColors.text(context),
                  labelStyle: AppTextStyles.button.copyWith(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                  unselectedLabelStyle: AppTextStyles.button.copyWith(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                  ),
                  tabs: [
                    Tab(
                      child: Text(
                        '${_followers.length} followers',
                        style: AppTextStyles.button.copyWith(
                          fontSize: 13,
                          fontWeight: _tabController.index == 0
                              ? FontWeight.w600
                              : FontWeight.w500,
                          color: _tabController.index == 0
                              ? AppColors.primary
                              : AppColors.text(context),
                        ),
                      ),
                    ),
                    Tab(
                      child: Text(
                        '${_following.length} following',
                        style: AppTextStyles.button.copyWith(
                          fontSize: 13,
                          fontWeight: _tabController.index == 1
                              ? FontWeight.w600
                              : FontWeight.w500,
                          color: _tabController.index == 1
                              ? AppColors.primary
                              : AppColors.text(context),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildUserList(_followers, 'followers'),
          _buildUserList(_following, 'following'),
        ],
      ),
    ),
  );

  Widget _buildUserList(List<UserConnection> users, String type) => Builder(
    builder: (context) => CustomScrollView(
      key: PageStorageKey<String>(type),
      controller: type == 'followers'
          ? _followersScrollController
          : _followingScrollController,
      slivers: [
        SliverOverlapInjector(
          handle: NestedScrollView.sliverOverlapAbsorberHandleFor(context),
        ),
        // Search Bar (Always visible)
        SliverToBoxAdapter(
          child: ClipRRect(
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.transparent,
                  border: Border(
                    bottom: BorderSide(color: AppColors.borderColor(context)),
                  ),
                ),
                child: SizedBox(
                  height: 38,
                  child: TextField(
                    controller: _searchController,
                    enabled: !_isLoading,
                    style: AppTextStyles.bodyMedium.copyWith(
                      fontSize: 13,
                      color: AppColors.text(context),
                    ),
                    onChanged: (value) {
                      setState(() {
                        _searchQuery = value;
                      });
                    },
                    decoration: InputDecoration(
                      filled: true,
                      fillColor: AppColors.secondaryColor(context),
                      hintText: 'Search',
                      hintStyle: AppTextStyles.bodyMedium.copyWith(
                        color: AppColors.text(context, isMuted: true),
                        fontSize: 13,
                      ),
                      suffixIcon: _searchQuery.isNotEmpty
                          ? IconButton(
                              icon: const Icon(LucideIcons.x, size: 16),
                              onPressed: () {
                                _searchController.clear();
                                setState(() {
                                  _searchQuery = '';
                                });
                              },
                            )
                          : Icon(
                              LucideIcons.search,
                              size: 18,
                              color: AppColors.text(context, isMuted: true),
                            ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(12),
                        borderSide: BorderSide.none,
                      ),
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: 12,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        if (_isLoading)
          SliverToBoxAdapter(child: _buildSkeletonList())
        else if (_error != null)
          SliverFillRemaining(
            hasScrollBody: false,
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(
                    LucideIcons.info,
                    color: AppColors.destructive,
                    size: 40,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _error!,
                    textAlign: TextAlign.center,
                    style: AppTextStyles.bodyMedium,
                  ),
                  TextButton(onPressed: _loadData, child: const Text('Retry')),
                ],
              ),
            ),
          )
        else if (_getFilteredList(users).isEmpty)
          SliverFillRemaining(
            hasScrollBody: false,
            child: _buildEmptyState(type),
          )
        else ...[
          SliverList(
            delegate: SliverChildBuilderDelegate((context, index) {
              final filteredUsers = _getFilteredList(users);
              final user = filteredUsers[index];
              final currentUserId = ref.watch(profileProvider)?.userId;
              final isMe = user.id == currentUserId;
              final isViewingOwnConnections = widget.userId == currentUserId;

              return UserListItem(
                user: user,
                type: type,
                isOwnProfile: isViewingOwnConnections,
                onTap: isMe
                    ? null
                    : () => PublicProfileRouteData(
                        userId: user.id,
                      ).push<void>(context),
                onActionPressed: () {
                  if (isViewingOwnConnections) {
                    if (type == 'followers' && !user.isFollowing) {
                      _handleFollowToggle(user);
                    } else {
                      KovariSnackbar.info(context, 'Chat coming soon!');
                    }
                  } else {
                    if (user.isFollowing) {
                      KovariSnackbar.info(context, 'Chat coming soon!');
                    } else {
                      _handleFollowToggle(user);
                    }
                  }
                },
                onRemovePressed: isViewingOwnConnections
                    ? (type == 'followers'
                          ? () => _handleRemoveFollower(user)
                          : () => _handleUnfollow(user))
                    : null,
              );
            }, childCount: _getFilteredList(users).length),
          ),
          if ((type == 'followers' && _isFetchingMoreFollowers) ||
              (type == 'following' && _isFetchingMoreFollowing))
            const SliverToBoxAdapter(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Center(
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: AppColors.primary,
                  ),
                ),
              ),
            ),
          const SliverToBoxAdapter(child: SizedBox(height: 40)),
        ],
      ],
    ),
  );

  Widget _buildSkeletonList() => Column(
    children: List.generate(8, (index) => const KovariSkeletonUserListItem()),
  );

  Widget _buildEmptyState(String type) {
    final title = _searchQuery.isNotEmpty
        ? 'No users found'
        : (type == 'followers' ? 'No followers yet' : 'Not following anyone');

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              title,
              style: AppTextStyles.h3.copyWith(
                fontSize: 14,
                color: AppColors.text(context, isMuted: true),
              ),
            ),
            if (_searchQuery.isEmpty) ...[
              const SizedBox(height: 4),
              Text(
                type == 'followers'
                    ? "When people follow you, you'll see them here."
                    : "When you follow people, you'll see them here.",
                style: AppTextStyles.bodySmall.copyWith(
                  color: AppColors.text(context, isMuted: true),
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
