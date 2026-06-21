import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/core/providers/cache_provider.dart';
import 'package:mobile/features/explore/models/explore_state.dart';
import 'package:mobile/features/explore/models/match_user.dart';
import 'package:mobile/features/explore/services/explore_service.dart';
import 'package:mobile/features/explore/services/match_service.dart';
import 'package:mobile/shared/models/kovari_user.dart';

/// Discovery-feed state management following the Hinge/Bumble architecture:
///
///  ┌─────────────────────────────────────────────────────────────────┐
///  │  Hinge / Bumble model                                            │
///  │  1. Server always returns fresh-filtered candidates.             │
///  │  2. Client keeps a PERSISTENT "seen" ledger (user IDs only).    │
///  │  3. Fetched candidates are double-filtered client-side against   │
///  │     the ledger — defense-in-depth against cache/lag.            │
///  │  4. Discovery feed is NEVER cached on the client (ignoreCache). │
///  │  5. Tab switches restore the IN-MEMORY deck; do NOT re-fetch.   │
///  └─────────────────────────────────────────────────────────────────┘
class ExploreNotifier extends Notifier<ExploreState> {
  @override
  ExploreState build() {
    // Start with an empty deck — discovery feed is never pre-loaded from cache.
    // We do NOT seed state.matches from Hive here because that data is stale and
    // contains users that may have already been swiped.
    final initialSearch = SearchData(
      destination: '',
      budget: 20000,
      startDate: DateTime.now(),
      endDate: DateTime.now().add(const Duration(days: 4)),
      travelMode: TravelMode.solo,
    );
    final initialFilters = ExploreFilters.initial();

    return ExploreState(
      searchData: initialSearch,
      filters: initialFilters,
      matches: const [],
      currentIndex: 0,
      isLoading: false,
      hasSearched: false,
      page: 1,
      hasMore: true,
      soloMatches: const [],
      soloCurrentIndex: 0,
      soloPage: 1,
      soloHasMore: true,
      groupMatches: const [],
      groupCurrentIndex: 0,
      groupPage: 1,
      groupHasMore: true,
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

  /// Switch between Solo and Group travel modes.
  ///
  /// Restores the in-memory deck for the target mode — swiped cards stay gone.
  /// Does NOT re-fetch if the mode already has an in-memory deck.
  void setTravelMode(TravelMode mode) {
    if (state.searchData.travelMode == mode) return;

    state = state.copyWith(
      searchData: state.searchData.copyWith(travelMode: mode),
      isLoading: false,
      error: null,
      isFetchingNextPage: false,
    );

    // Only hit the server if this mode has no in-memory deck yet.
    // If we have a deck (even empty after swiping everything), trust it.
    if (state.matches.isEmpty && !state.hasSearched) {
      performSearch();
    }
  }

  void searchWithoutDestination() {
    final defaultFilters = ExploreFilters.initial();
    final updatedSearch = state.searchData.copyWith(
      destination: '',
      destinationDetails: null,
    );

    state = state.copyWith(
      searchData: updatedSearch,
      filters: defaultFilters,
      matches: const [],
      currentIndex: 0,
      page: 1,
      hasMore: true,
      hasSearched: false,
    );

    performSearch();
  }

  /// Fetch candidates from the server.
  ///
  /// The server runs [filterInteractedMatches] on every request.
  /// We additionally apply the local seen-user ledger client-side as a
  /// second filter to handle any propagation lag (same as Hinge/Bumble).
  Future<void> performSearch({
    bool isRefresh = false,
    bool isLoadMore = false,
    bool isSilent = false,
  }) async {
    final userId = _userId ?? 'dummy-user-id';
    final mode = state.searchData.travelMode;

    if (isLoadMore && state.isFetchingNextPage) return;

    if (isLoadMore) {
      if (!state.hasMore || mode != TravelMode.solo) return;
      state = state.copyWith(isFetchingNextPage: true);
    } else if (!isSilent) {
      state = state.copyWith(
        isLoading: true,
        matches: const [],
        currentIndex: 0,
        page: 1,
        hasMore: true,
      );
    }

    try {
      var matches = List<dynamic>.from(state.matches);
      var newHasMore = state.hasMore;
      var newPage = state.page;

      if (!isLoadMore) {
        await ref.read(localCacheProvider).clearSeenUsers();
      }

      // Load the local seen-ledger once per fetch for O(1) lookups below.
      final seenIds = ref.read(localCacheProvider).getSeenUsers();

      if (mode == TravelMode.solo) {
        if (!isLoadMore) {
          await _service.createSession(state.searchData, userId);
        }
        final fetchPage = isLoadMore ? state.page + 1 : 1;
        final result = await _matchService.getMatches(
          page: fetchPage,
          searchData: state.searchData,
          filters: state.filters,
        );

        List<MatchUser> fetchedMatches = result.matches.cast<MatchUser>();

        // Client-side dedup: strip any user that is in our seen ledger.
        // This is the same defense-in-depth approach Hinge uses to handle
        // the window between a swipe and the server cache being invalidated.
        if (seenIds.isNotEmpty) {
          fetchedMatches = fetchedMatches.where((m) {
            return !seenIds.contains(m.id);
          }).toList();
        }

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

        // Apply seen-ledger filter for groups too.
        var groupMatches = result.matches;
        if (seenIds.isNotEmpty) {
          groupMatches = groupMatches.where((m) {
            try {
              final dynamic item = m;
              return !seenIds.contains(item.id as String?);
            } catch (_) {
              return true;
            }
          }).toList();
        }

        matches = groupMatches;
        newHasMore = result.hasMore;
      }

      state = state.copyWith(
        matches: matches,
        hasSearched: true,
        page: newPage,
        hasMore: newHasMore,
        lastFetchTime: isLoadMore ? state.lastFetchTime : DateTime.now(),
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
    } finally {
      state = state.copyWith(isLoading: false, isFetchingNextPage: false);
    }
  }

  /// Remove a swiped card from the in-memory deck and record it in the
  /// persistent seen-users ledger so it never resurfaces — even after an
  /// app restart. This is the core of the Hinge/Bumble dedup mechanism.
  void _removeMatchAndSyncLedger(String matchId) {
    final updatedMatches = List<dynamic>.from(state.matches);
    updatedMatches.removeWhere((m) {
      if (m is MatchUser) {
        return m.id == matchId;
      }
      try {
        final dynamic item = m;
        return (item.id as String?) == matchId;
      } catch (_) {
        return false;
      }
    });

    final idsToRecord = <String>[matchId];
    try {
      final swiped = state.matches.firstWhere((m) {
        if (m is MatchUser) {
          return m.id == matchId;
        }
        try {
          final dynamic item = m;
          return (item.id as String?) == matchId;
        } catch (_) {
          return false;
        }
      });
      if (swiped is MatchUser) {
        if (swiped.id.isNotEmpty && swiped.id != matchId) {
          idsToRecord.add(swiped.id);
        }
      } else {
        final dynamic s = swiped;
        if (s.id != null && s.id != matchId) idsToRecord.add(s.id as String);
      }
    } catch (_) {}

    int newIndex = state.currentIndex;
    if (updatedMatches.isEmpty) {
      newIndex = 0;
    } else if (newIndex >= updatedMatches.length) {
      newIndex = updatedMatches.length - 1;
    }

    state = state.copyWith(matches: updatedMatches, currentIndex: newIndex);

    // Persist to seen-users ledger — the source of truth for dedup.
    final cache = ref.read(localCacheProvider);
    unawaited(cache.addSeenUsers(idsToRecord));

    // Auto-load more when the deck is running low (solo only).
    if (state.searchData.travelMode == TravelMode.solo &&
        updatedMatches.length - newIndex <= 3 &&
        state.hasMore &&
        !state.isFetchingNextPage) {
      performSearch(isLoadMore: true);
    }
  }

  final Set<String> _pendingSwipes = {};

  Future<void> handlePass(String matchId) async {
    if (_userId == null || _pendingSwipes.contains(matchId)) return;
    _pendingSwipes.add(matchId);

    final prevState = state;
    _removeMatchAndSyncLedger(matchId);

    try {
      await _service.skipMatch(
        skipperId: _userId!,
        skippedUserId:
            state.searchData.travelMode == TravelMode.solo ? matchId : null,
        skippedGroupId:
            state.searchData.travelMode == TravelMode.group ? matchId : null,
        destinationId: state.searchData.destination,
        isSolo: state.searchData.travelMode == TravelMode.solo,
      );
    } catch (e) {
      // Revert if error occurs (optional, but keep deck clean)
      state = prevState.copyWith(error: 'Failed to pass: $e');
    } finally {
      _pendingSwipes.remove(matchId);
    }
  }

  Future<void> handleInterested(String matchId) async {
    if (_userId == null || _pendingSwipes.contains(matchId)) return;
    _pendingSwipes.add(matchId);

    final prevState = state;
    // Optimistically remove card instantly from the deck
    _removeMatchAndSyncLedger(matchId);

    try {
      await _service.sendInterest(
        fromUserId: _userId!,
        toUserId:
            state.searchData.travelMode == TravelMode.solo ? matchId : null,
        toGroupId:
            state.searchData.travelMode == TravelMode.group ? matchId : null,
        destinationId: state.searchData.destination,
        isSolo: state.searchData.travelMode == TravelMode.solo,
      );
    } catch (e) {
      state = prevState.copyWith(
        error: 'Failed to express interest: $e',
      );
    } finally {
      _pendingSwipes.remove(matchId);
    }
  }
}

final exploreProvider = NotifierProvider<ExploreNotifier, ExploreState>(
  ExploreNotifier.new,
);
