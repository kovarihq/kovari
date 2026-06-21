import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/services/haptic_service.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/core/widgets/skeletons/kovari_skeletons.dart';
import 'package:mobile/features/explore/models/explore_state.dart';
import 'package:mobile/features/explore/models/match_user.dart';
import 'package:mobile/features/explore/providers/explore_provider.dart';
import 'package:mobile/features/explore/widgets/explore_filters_sheet.dart';
import 'package:mobile/features/explore/widgets/group_match_card.dart';
import 'package:mobile/features/explore/widgets/solo_match_card.dart';
import 'package:mobile/features/groups/models/group.dart';
import 'package:mobile/shared/utils/scroll_preloader.dart';
import 'package:mobile/shared/widgets/app_card.dart';
import 'package:mobile/shared/widgets/interactive_wrapper.dart';
import 'package:mobile/shared/widgets/kovari_empty_state.dart';

class ExploreScreen extends ConsumerStatefulWidget {
  const ExploreScreen({super.key});

  @override
  ConsumerState<ExploreScreen> createState() => _ExploreScreenState();
}

class _ExploreScreenState extends ConsumerState<ExploreScreen>
    with
        SingleTickerProviderStateMixin,
        WidgetsBindingObserver,
        AutomaticKeepAliveClientMixin {
  late TabController _tabController;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) {
        ref
            .read(exploreProvider.notifier)
            .setTravelMode(
              _tabController.index == 0 ? TravelMode.solo : TravelMode.group,
            );
      }
    });

    WidgetsBinding.instance.addPostFrameCallback((_) {
      final state = ref.read(exploreProvider);
      _tabController.index = state.searchData.travelMode == TravelMode.solo
          ? 0
          : 1;

      // Always do an initial fetch on mount.
      // isSilent=true shows cached data immediately while refreshing in background.
      // setTravelMode (on tab switch) handles the "don't re-fetch" guard separately.
      ref
          .read(exploreProvider.notifier)
          .performSearch(isSilent: state.matches.isNotEmpty);
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _tabController.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Manual search only
  }

  void _showFilters() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      useRootNavigator: true,
      backgroundColor: Colors.transparent,
      builder: (context) => const ExploreFiltersSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final state = ref.watch(exploreProvider);

    ref.listen(exploreProvider, (previous, next) {
      if (previous?.currentIndex != next.currentIndex) {
        for (var i = 1; i <= 3; i++) {
          final index = next.currentIndex + i;
          if (index < next.matches.length) {
            final match = next.matches[index];
            final String? imageUrl =
                next.searchData.travelMode == TravelMode.solo
                ? (match is MatchUser ? match.image : null)
                : (match is GroupModel ? match.coverImage : null);

            if (imageUrl != null && imageUrl.isNotEmpty) {
              precacheImage(CachedNetworkImageProvider(imageUrl), context);
            }
          }
        }
      }
    });

    final bottomSpacer = MediaQuery.of(context).padding.bottom + 76;

    return Column(
      children: [
        Padding(
          padding: EdgeInsets.only(top: MediaQuery.of(context).padding.top),
          child: _buildHeader(state),
        ),
        Expanded(
          child: ScrollPreloader(
            onIdle: () {
              // Manual search only
            },
            child: AppCard(
              width: double.infinity,
              padding: EdgeInsets.zero,
              margin: EdgeInsets.only(
                left: 16.0,
                right: 16.0,
                bottom: bottomSpacer,
              ),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppColors.borderColor(context)),
              boxShadow: const [],
              child: _buildBody(state),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildHeader(ExploreState state) => Padding(
    padding: const EdgeInsets.all(16.0),
    child: Row(
      children: [
        Expanded(
          child: AppCard(
            height: 44,
            padding: EdgeInsets.zero,
            borderRadius: BorderRadius.circular(22),
            boxShadow: const [],
            child: TabBar(
              controller: _tabController,
              onTap: (index) => HapticService.selection(),
              overlayColor: WidgetStateProperty.all(Colors.transparent),
              splashFactory: NoSplash.splashFactory,
              indicator: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(22),
                border: Border.all(color: Colors.transparent, width: 0),
              ),
              indicatorSize: TabBarIndicatorSize.tab,
              labelColor: AppColors.primary,
              unselectedLabelColor: AppColors.text(context, isMuted: true),
              labelStyle: AppTextStyles.bodySmall.copyWith(
                fontWeight: FontWeight.bold,
              ),
              unselectedLabelStyle: AppTextStyles.bodySmall.copyWith(
                fontWeight: FontWeight.w600,
              ),
              dividerColor: Colors.transparent,
              tabs: const [
                Tab(text: 'Solo'),
                Tab(text: 'Groups'),
              ],
            ),
          ),
        ),
        const SizedBox(width: 8),
        InteractiveWrapper(
          onPressed: _showFilters,
          child: AppCard(
            height: 44,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            borderRadius: BorderRadius.circular(22),
            boxShadow: const [],
            child: Center(
              child: Text(
                'Filters',
                style: AppTextStyles.bodySmall.copyWith(
                  fontWeight: FontWeight.bold,
                  color: AppColors.text(context, isMuted: true),
                ),
              ),
            ),
          ),
        ),
      ],
    ),
  );

  Widget _buildBody(ExploreState state) {
    if (state.isLoading && state.matches.isEmpty) {
      return const KovariSkeletonExplore();
    }

    if (state.error != null) {
      return KovariEmptyState(
        title: 'Something went wrong',
        description: state.error!,
        icon: Icons.error_outline,
        actionLabel: 'Retry',
        onAction: () => ref.read(exploreProvider.notifier).performSearch(),
      );
    }

    if (state.matches.isEmpty) {
      final hasDestination = state.searchData.destination.trim().isNotEmpty;
      if (hasDestination) {
        final shortDest = state.searchData.destination.split(',')[0].trim();
        return KovariEmptyState(
          title: state.searchData.travelMode == TravelMode.solo
              ? "No one's heading to $shortDest yet"
              : "No groups found for $shortDest yet",
          description:
              "You're in the first batch of Kovari — more travelers are joining every week.",
          icon: Icons.sentiment_dissatisfied_outlined,
          actionLabel: state.searchData.travelMode == TravelMode.solo
              ? 'Browse all travelers instead →'
              : 'Browse all groups instead →',
          onAction: () =>
              ref.read(exploreProvider.notifier).searchWithoutDestination(),
        );
      } else {
        return KovariEmptyState(
          title: state.searchData.travelMode == TravelMode.solo
              ? 'No travelers found yet'
              : 'No groups found yet',
          description:
              'Try adjusting your preferences or dates to find more companions.',
          icon: Icons.sentiment_dissatisfied_outlined,
          actionLabel: 'Adjust Filters',
          onAction: _showFilters,
        );
      }
    }

    final match = state.matches[state.currentIndex];

    // Defensive check for type mismatch during transitions
    final isTypeMismatch =
        (state.searchData.travelMode == TravelMode.solo &&
            match is! MatchUser) ||
        (state.searchData.travelMode == TravelMode.group &&
            match is! GroupModel);

    if (isTypeMismatch) {
      return const KovariSkeletonExplore();
    }

    return Padding(
      padding: const EdgeInsets.only(top: 8, bottom: 8),
      child: Stack(
        children: [
          Positioned.fill(
            child: RepaintBoundary(
              child: state.searchData.travelMode == TravelMode.solo
                  ? SoloMatchCard(match: match as MatchUser)
                  : GroupMatchCard(group: match as GroupModel),
            ),
          ),
          if (state.isFetchingNextPage)
            const Positioned(
              bottom: 12,
              left: 0,
              right: 0,
              child: Center(
                child: Card(
                  elevation: 4,
                  shape: CircleBorder(),
                  child: Padding(
                    padding: EdgeInsets.all(8.0),
                    child: SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(
                        strokeWidth: 2.5,
                        color: AppColors.primary,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
