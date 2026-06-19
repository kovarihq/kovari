import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/providers/contract_provider.dart';
import 'package:mobile/core/utils/safe_parser.dart';
import 'package:mobile/features/explore/models/explore_state.dart';
import 'package:mobile/features/explore/models/match_result.dart';
import 'package:mobile/features/explore/models/match_user.dart';
import 'package:mobile/features/groups/models/group.dart';

/// 🛡️ Match Service — typed, safe, crash-proof
///
/// Returns only typed models to UI providers.
/// Errors, timeouts, and malformed data are absorbed here.
class MatchService {
  MatchService(this._apiClient, this._ref);
  final ApiClient _apiClient;
  final Ref _ref;

  Future<MatchResult> getMatches({
    int page = 1,
    int limit = 20,
    SearchData? searchData,
    ExploreFilters? filters,
  }) async {
    final queryParams = <String, dynamic>{'page': page, 'limit': limit};

    if (searchData != null) {
      if (searchData.destination.trim().isNotEmpty &&
          searchData.destination != 'Any') {
        queryParams['destination'] = searchData.destination;
      }
      queryParams['budget'] = searchData.budget.toString();
      queryParams['startDate'] = searchData.startDate.toIso8601String().split(
        'T',
      )[0];
      queryParams['endDate'] = searchData.endDate.toIso8601String().split(
        'T',
      )[0];
    }

    if (filters != null) {
      queryParams['ageMin'] = filters.ageRange[0].toString();
      queryParams['ageMax'] = filters.ageRange[1].toString();
      queryParams['gender'] = filters.gender;
      queryParams['personality'] = filters.personality;
      queryParams['smoking'] = filters.smoking.toLowerCase();
      queryParams['drinking'] = filters.drinking.toLowerCase();
      queryParams['nationality'] = filters.nationality;
      if (filters.interests.isNotEmpty) {
        queryParams['interests'] = filters.interests.join(',');
      }
      if (filters.languages.isNotEmpty) {
        queryParams['languages'] = filters.languages.join(',');
      }
    }

    final response = await _apiClient.get<MatchResult>(
      'match-solo',
      queryParameters: queryParams,
      parser: (data) {
        if (data is! Map<String, dynamic>) return MatchResult.empty();

        // 🏛️ Handle standardized { success, data: { matches: [...] } }
        final envelope = (data['data'] ?? data) as Map<String, dynamic>;
        final rawList = envelope['matches'] ?? envelope['data'] ?? <dynamic>[];
        final hasMore = envelope['hasMore'] as bool? ?? false;
        final total = envelope['total'] as int? ?? 0;

        return MatchResult(
          matches: safeParseList<MatchUser>(rawList, MatchUser.fromJson),
          hasMore: hasMore,
          totalCount: total,
        );
      },
    );

    _ref
        .read(contractStateProvider.notifier)
        .update(response.meta.contractState);

    return response.data ?? MatchResult.empty();
  }

  Future<MatchResult> getGroupMatches({
    int page = 1,
    int limit = 20,
    Map<String, dynamic>? filters,
  }) async {
    final response = await _apiClient.post<MatchResult>(
      'match-groups',
      data: {'page': page, 'limit': limit, if (filters != null) ...filters},
      parser: (data) {
        if (data is! Map<String, dynamic>) return MatchResult.empty();

        // 🏛️ Handle standardized { success, data: { groups: [...] } }
        final envelope = (data['data'] ?? data) as Map<String, dynamic>;
        final rawList = envelope['groups'] ?? envelope['data'] ?? <dynamic>[];
        final hasMore = envelope['hasMore'] as bool? ?? false;
        final total = envelope['total'] as int? ?? 0;

        return MatchResult(
          matches: safeParseList<GroupModel>(rawList, GroupModel.fromJson),
          hasMore: hasMore,
          totalCount: total,
        );
      },
    );

    _ref
        .read(contractStateProvider.notifier)
        .update(response.meta.contractState);

    return response.data ?? MatchResult.empty();
  }
}

final matchServiceProvider = Provider<MatchService>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return MatchService(apiClient, ref);
});
