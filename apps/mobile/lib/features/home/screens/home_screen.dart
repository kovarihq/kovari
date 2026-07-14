import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/navigation/routes.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_spacing.dart';
import 'package:mobile/core/widgets/skeletons/kovari_skeletons.dart';
import 'package:mobile/features/home/models/home_state.dart';
import 'package:mobile/features/home/providers/home_provider.dart';
import 'package:mobile/features/home/widgets/cards/stat_card.dart';
import 'package:mobile/features/home/widgets/cards/top_destination_card.dart';
import 'package:mobile/features/home/widgets/cards/upcoming_trip_card.dart';
import 'package:mobile/features/home/widgets/header/home_header.dart';
import 'package:mobile/features/home/widgets/sections/groups_section.dart';
import 'package:mobile/features/home/widgets/sections/itinerary_section.dart';
import 'package:mobile/features/home/widgets/sections/requests_section.dart';
import 'package:mobile/features/requests/providers/request_provider.dart';
import 'package:mobile/shared/utils/scroll_preloader.dart';
import 'package:mobile/shared/widgets/kovari_empty_state.dart';
import 'package:mobile/shared/widgets/kovari_refresh_indicator.dart';
import 'package:url_launcher/url_launcher.dart';

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(homeDataProvider.notifier).refresh(isSilent: true);
      ref.read(interestsProvider.notifier).silentRefresh();
    });
  }

  Future<void> _handleRefresh() async {
    await ref.read(homeDataProvider.notifier).refresh();
  }

  void _handleExploreUpcomingTrip(String? groupId) {
    if (groupId != null) {
      GroupDetailsRouteData(groupId: groupId).push<void>(context);
    }
  }

  Future<void> _handleOpenMap(String destination) async {
    if (destination.isEmpty) return;

    final url = Platform.isIOS
        ? 'https://maps.apple.com/?q=${Uri.encodeComponent(destination)}'
        : 'https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(destination)}';

    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final homeState = ref.watch(homeDataProvider);

    // Pre-cache Side Effects
    if (homeState.data != null) {
      final data = homeState.data!;
      if (data.topDestination?.imageUrl != null &&
          data.topDestination!.imageUrl!.isNotEmpty) {
        precacheImage(
          CachedNetworkImageProvider(data.topDestination!.imageUrl!),
          context,
        );
      }
      if (data.profile.avatar.isNotEmpty) {
        precacheImage(CachedNetworkImageProvider(data.profile.avatar), context);
      }
    }

    final topPadding = MediaQuery.of(context).padding.top;

    return Material(
      color: AppColors.surface(context),
      child: ScrollPreloader(
        onIdle: () {
          if (homeState.data != null) {
            ref.read(homeDataProvider.notifier).refresh(isSilent: true);
          }
        },
        child: KovariRefreshIndicator(
          onRefresh: _handleRefresh,
          child: CustomScrollView(
            key: const PageStorageKey('home_scroll'),
            physics: const BouncingScrollPhysics(
              parent: AlwaysScrollableScrollPhysics(),
            ),
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            slivers: [
              // 1. Home Header with Status Bar Padding
              SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.fromLTRB(
                    AppSpacing.md,
                    topPadding + AppSpacing.md,
                    AppSpacing.md,
                    AppSpacing.xs,
                  ),
                  child: HomeHeader(
                    firstName:
                        homeState.data?.profile.name.split(' ')[0] ?? 'User',
                    isLoading: homeState.isLoading && homeState.data == null,
                  ),
                ),
              ),

              // 2. Main Stats/Cards (Wrapped in horizontal padding)
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
                sliver: SliverList(
                  delegate: SliverChildListDelegate([
                    if (homeState.isLoading && homeState.data == null) ...[
                      const KovariSkeletonCard(height: 180), // Top Destination
                      const SizedBox(height: AppSpacing.mds),
                      const KovariSkeletonCard(height: 180), // Upcoming Trip
                      const SizedBox(height: AppSpacing.mds),
                      const KovariSkeletonCard(height: 80), // Stat 1
                      const SizedBox(height: AppSpacing.mds),
                      const KovariSkeletonCard(height: 80), // Stat 2
                    ] else if (homeState.data != null) ...[
                      // Top Destination
                      if (homeState.data!.topDestination != null)
                        TopDestinationCard(
                          name: homeState.data!.topDestination!.name,
                          imageUrl: homeState.data!.topDestination!.imageUrl,
                          onExplore: () => _handleOpenMap(
                            homeState.data!.topDestination!.name,
                          ),
                        ),
                      const SizedBox(height: AppSpacing.mds),

                      // Upcoming Trip
                      if (homeState.data!.featuredTrip != null) ...[
                        UpcomingTripCard(
                          name: homeState.data!.featuredTrip!.name,
                          groupId: homeState.data!.featuredTrip!.id,
                          imageUrl: homeState.data!.featuredTrip!.coverImage,
                          onExplore: () => _handleExploreUpcomingTrip(
                            homeState.data!.featuredTrip!.id,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.mds),
                      ],

                      // Stats
                      StatCard(
                        title: 'Total Travel Days',
                        value: homeState.data!.stats.travelDaysDisplay,
                      ),
                      const SizedBox(height: AppSpacing.mds),
                      StatCard(
                        title: 'Profile Impressions',
                        value: homeState.data!.stats.impressionsDisplay,
                      ),
                    ] else
                      const KovariEmptyState(
                        title: 'Welcome',
                        description: 'Welcome to Kovari! Start exploring now.',
                      ),
                  ]),
                ),
              ),

              const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.mds)),

              // 3. Sections
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
                sliver: _buildSliverBody(homeState),
              ),

              const SliverToBoxAdapter(child: SizedBox(height: 110)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSliverBody(HomeState state) {
    if (state.isLoading && state.data == null) {
      return SliverList(
        delegate: SliverChildListDelegate([
          const KovariSkeletonCard(height: 240), // Groups
          const SizedBox(height: AppSpacing.mds),
          const KovariSkeletonCard(height: 240), // Requests
          const SizedBox(height: AppSpacing.mds),
          const KovariSkeletonCard(height: 240), // Itinerary
        ]),
      );
    }

    final data = state.data;
    if (data == null) return const SliverToBoxAdapter(child: SizedBox.shrink());

    // Map active groups to MockGroup for GroupsSection compatibility
    final groups = data.activeGroups
        .map(
          (g) => MockGroup(
            id: g.id,
            name: g.name,
            destination: g.destination ?? 'Various',
            members: g.members,
            imageUrl: g.coverImage,
          ),
        )
        .toList();

    // Map featured trip itinerary to MockEvent for ItinerarySection compatibility
    final events =
        data.featuredTrip?.itinerary.map((item) {
          final date = item.datetime != null
              ? DateTime.parse(item.datetime!).toLocal()
              : DateTime.now();
          return MockEvent(
            id: item.id,
            title: item.title,
            description: item.description,
            start: date,
            end: date.add(const Duration(hours: 1)),
          );
        }).toList() ??
        [];

    return SliverList(
      delegate: SliverChildListDelegate([
        // Sections
        RepaintBoundary(
          child: GroupsSection(
            groups: groups,
            isLoading: state.isLoading,
            onGroupTap: _handleExploreUpcomingTrip,
          ),
        ),
        const SizedBox(height: AppSpacing.mds),
        RepaintBoundary(child: RequestsSection(isLoading: state.isLoading)),
        const SizedBox(height: AppSpacing.mds),
        RepaintBoundary(
          child: ItinerarySection(events: events, isLoading: state.isLoading),
        ),
      ]),
    );
  }
}
