import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/legacy.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/network/api_endpoints.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/core/providers/cache_provider.dart';
import 'package:mobile/features/groups/data/group_service.dart';
import 'package:mobile/features/groups/models/group_state.dart';
import 'package:mobile/features/groups/providers/entity_stores.dart';

final groupServiceProvider = Provider<GroupService>((ref) {
  final apiClient = ref.read(apiClientProvider);
  return GroupService(apiClient);
});

final myGroupsProvider = StateNotifierProvider<MyGroupsNotifier, GroupState>(MyGroupsNotifier.new);

class MyGroupsNotifier extends StateNotifier<GroupState> {
  MyGroupsNotifier(this._ref) : super(GroupState()) {
    _init();
  }
  final Ref _ref;

  Future<void> _init() async {
    _ref.watch(authStateProvider);
    await refresh(isInitial: true);
  }

  Future<void> refresh({bool isInitial = false}) async {
    final cache = _ref.read(localCacheProvider);
    final service = _ref.read(groupServiceProvider);

    // 1. Try Cache First
    final cached = cache.get(ApiEndpoints.myGroups);
    if (cached != null) {
      final groups = service.parseGroups(cached.data);
      _ref.read(groupStoreProvider.notifier).updateFromList(groups);
      state = state.copyWith(
        groups: groups,
        isStale: true,
        isLoading: isInitial,
      );
    } else {
      state = state.copyWith(isLoading: true);
    }

    // 2. Fetch Fresh Data
    try {
      final freshGroups = await service.getMyGroups(ignoreCache: true);
      _ref.read(groupStoreProvider.notifier).updateFromList(freshGroups);
      state = state.copyWith(
        groups: freshGroups,
        isStale: false,
        isLoading: false,
      );
    } catch (e) {
      if (state.groups.isEmpty) {
        state = state.copyWith(error: e.toString(), isLoading: false);
      } else {
        state = state.copyWith(isStale: false, isLoading: false);
      }
    }
  }
}
