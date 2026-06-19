import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/core/providers/cache_provider.dart';
import 'package:mobile/features/explore/models/explore_state.dart';
import 'package:mobile/features/explore/models/match_user.dart';
import 'package:mobile/features/explore/services/explore_service.dart';
import 'package:mobile/features/explore/services/match_service.dart';
import 'package:mobile/shared/models/kovari_user.dart';

class ExploreNotifier extends Notifier<ExploreState> {
  @override
  ExploreState build() {
    final cache = ref.read(localCacheProvider);
    final initialSearch = SearchData(
      destination: '',
      budget: 20000,
      startDate: DateTime.now(),
      endDate: DateTime.now().add(const Duration(days: 4)),
      travelMode: TravelMode.solo,
    );
    final initialFilters = ExploreFilters.initial();

    final cacheKey =
        'matches_${initialSearch.travelMode.name}_${initialSearch.destination}';
    List<dynamic>? cachedMatches;
    try {
      cachedMatches = cache.getEntities(cacheKey);
    } catch (_) {}

    return ExploreState(
      searchData: initialSearch,
      filters: initialFilters,
      matches: cachedMatches ?? [],
      currentIndex: 0,
      isLoading: false,
      hasSearched: cachedMatches != null && cachedMatches.isNotEmpty,
      page: 1,
      hasMore: true,
    );
  }

  ExploreService get _service => ref.read(exploreServiceProvider);
  MatchService get _matchService => ref.read(matchServiceProvider);
  KovariUser? get _user => ref.watch(authStateProvider);

  String? get _userId => _user?.id;

  void updateSearchData(SearchData searchData) {
    state = state.copyWith(searchData: searchData);
  }

  void updateFilters(ExploreFilters filters) {
    state = state.copyWith(filters: filters);
  }

  void setTravelMode(TravelMode mode) {
    final cache = ref.read(localCacheProvider);
    final cacheKey = 'matches_${mode.name}_${state.searchData.destination}';
    List<dynamic>? cached;
    try {
      cached = cache.getEntities(cacheKey);
    } catch (_) {}

    state = state.copyWith(
      searchData: state.searchData.copyWith(travelMode: mode),
      hasSearched: cached != null && cached.isNotEmpty,
      matches: cached ?? [],
      currentIndex: 0,
      page: 1,
      hasMore: true,
    );

    performSearch(isSilent: cached != null && cached.isNotEmpty);
  }

  void searchWithoutDestination() {
    final defaultFilters = ExploreFilters.initial();
    final updatedSearch = state.searchData.copyWith(
      destination: '',
      destinationDetails: null,
    );

    final cache = ref.read(localCacheProvider);
    final cacheKey = 'matches_${updatedSearch.travelMode.name}_';
    List<dynamic>? cached;
    try {
      cached = cache.getEntities(cacheKey);
    } catch (_) {}

    state = state.copyWith(
      searchData: updatedSearch,
      filters: defaultFilters,
      matches: cached ?? [],
      currentIndex: 0,
      page: 1,
      hasMore: true,
      hasSearched: cached != null && cached.isNotEmpty,
    );

    performSearch(isSilent: cached != null && cached.isNotEmpty);
  }

  Future<void> performSearch({
    bool isRefresh = false,
    bool isLoadMore = false,
    bool isSilent = false,
  }) async {
    final userId = _userId ?? 'dummy-user-id';

    if (isLoadMore && state.isFetchingNextPage) return;

    if (!isRefresh && !isLoadMore && !isSilent && state.matches.isNotEmpty) {
      if (state.lastFetchTime != null &&
          state.searchData.travelMode == TravelMode.solo) {
        if (DateTime.now().difference(state.lastFetchTime!).inSeconds < 30) {
          return; // Cache valid and we already have matches
        }
      }
    }

    if (isLoadMore) {
      if (!state.hasMore || state.searchData.travelMode != TravelMode.solo) {
        return;
      }
      state = state.copyWith(isFetchingNextPage: true);
    } else if (!isSilent) {
      state = state.copyWith(
        isLoading: true,
        matches: [],
        currentIndex: 0,
        page: 1,
        hasMore: true,
      );
    }

    try {
      var matches = List<dynamic>.from(state.matches);
      var newHasMore = state.hasMore;
      var newPage = state.page;

      if (state.searchData.travelMode == TravelMode.solo) {
        if (!isLoadMore) {
          await _service.createSession(state.searchData, userId);
        }
        final fetchPage = isLoadMore ? state.page + 1 : 1;
        final result = await _matchService.getMatches(
          page: fetchPage,
          searchData: state.searchData,
          filters: state.filters,
        );

        final List<MatchUser> fetchedMatches = result.matches.cast<MatchUser>();
        fetchedMatches.sort((a, b) => (b.score ?? 0).compareTo(a.score ?? 0));

        if (isLoadMore) {
          matches.addAll(fetchedMatches);
        } else {
          matches = fetchedMatches;
        }
        newHasMore = result.hasMore;
        newPage = fetchPage;
      } else {
        final result = await _service.matchGroups(
          userId,
          state.searchData,
          state.filters,
        );
        matches = result.matches;
        newHasMore = result.hasMore;
      }

      state = state.copyWith(
        matches: matches,
        hasSearched: true,
        page: newPage,
        hasMore: newHasMore,
        lastFetchTime: isLoadMore ? state.lastFetchTime : DateTime.now(),
      );

      // Persist to cache
      if (!isLoadMore) {
        final cache = ref.read(localCacheProvider);
        unawaited(
          cache.setEntities(
            'matches_${state.searchData.travelMode.name}_${state.searchData.destination}',
            matches,
          ),
        );
      }
    } catch (e) {
      state = state.copyWith(error: e.toString());
    } finally {
      state = state.copyWith(isLoading: false, isFetchingNextPage: false);
    }
  }

  void nextMatch() {
    if (state.currentIndex < state.matches.length - 1) {
      state = state.copyWith(currentIndex: state.currentIndex + 1);

      if (state.searchData.travelMode == TravelMode.solo &&
          state.currentIndex >= state.matches.length - 3 &&
          state.hasMore) {
        performSearch(isLoadMore: true);
      }
    } else {
      if (state.searchData.travelMode == TravelMode.solo && state.hasMore) {
        performSearch(isLoadMore: true);
      } else {
        state = state.copyWith(matches: [], currentIndex: 0);
      }
    }
  }

  Future<void> handlePass(String matchId) async {
    if (_userId == null || state.isPending) return;

    final prevState = state;
    // Optimistic Update
    nextMatch();

    try {
      await _service.skipMatch(
        skipperId: _userId!,
        skippedUserId: state.searchData.travelMode == TravelMode.solo
            ? matchId
            : null,
        skippedGroupId: state.searchData.travelMode == TravelMode.group
            ? matchId
            : null,
        destinationId: state.searchData.destination,
        isSolo: state.searchData.travelMode == TravelMode.solo,
      );
    } catch (e) {
      state = prevState.copyWith(error: 'Failed to pass: $e');
    }
  }

  Future<void> handleInterested(String matchId) async {
    if (_userId == null || state.isPending) return;

    final prevState = state;
    state = state.copyWith(isPending: true);

    try {
      await _service.sendInterest(
        fromUserId: _userId!,
        toUserId: state.searchData.travelMode == TravelMode.solo
            ? matchId
            : null,
        toGroupId: state.searchData.travelMode == TravelMode.group
            ? matchId
            : null,
        destinationId: state.searchData.destination,
        isSolo: state.searchData.travelMode == TravelMode.solo,
      );
      state = state.copyWith(isPending: false);
      nextMatch();
    } catch (e) {
      state = prevState.copyWith(
        error: 'Failed to express interest: $e',
        isPending: false,
      );
    }
  }
}

final exploreProvider = NotifierProvider<ExploreNotifier, ExploreState>(
  ExploreNotifier.new,
);
