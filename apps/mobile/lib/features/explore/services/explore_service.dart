import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/models/api_response.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/network/api_endpoints.dart';
import 'package:mobile/core/providers/contract_provider.dart';
import 'package:mobile/core/utils/safe_parser.dart';
import 'package:mobile/features/explore/models/explore_state.dart';
import 'package:mobile/features/explore/models/match_result.dart';
import 'package:mobile/features/explore/models/match_user.dart';
import 'package:mobile/features/groups/models/group.dart';

class ExploreService {

  ExploreService(this._apiClient, this._ref);
  final ApiClient _apiClient;
  final Ref _ref;

  Future<void> createSession(SearchData searchData, String userId) async {
    final payload = <String, dynamic>{
      'userId': userId,
      'destinationName': searchData.destination,
      'budget': searchData.budget,
      'startDate': searchData.startDate.toIso8601String().split('T')[0],
      'endDate': searchData.endDate.toIso8601String().split('T')[0],
      'travelMode': searchData.travelMode == TravelMode.solo ? 'solo' : 'group',
    };

    if (searchData.destinationDetails != null) {
      payload['destination'] = {
        'name':
            searchData.destinationDetails!['formatted'] ??
            searchData.destination,
        'lat': searchData.destinationDetails!['lat'],
        'lon': searchData.destinationDetails!['lon'],
        'city': searchData.destinationDetails!['city'],
        'country': searchData.destinationDetails!['country'],
      };
    }

    // Fire-and-forget: session creation failure is non-critical
    await _apiClient.post<void>(
      ApiEndpoints.exploreSession,
      data: payload,
      parser: (_) {},
    );
  }

  Future<MatchResult> matchSolo(
    String userId,
    ExploreFilters filters,
  ) async {
    final queryParams = <String, dynamic>{
      'userId': userId,
      'ageMin': filters.ageRange[0].toString(),
      'ageMax': filters.ageRange[1].toString(),
      'gender': filters.gender,
      'personality': filters.personality,
      'smoking': filters.smoking.toLowerCase(),
      'drinking': filters.drinking.toLowerCase(),
      'nationality': filters.nationality,
    };

    if (filters.interests.isNotEmpty) {
      queryParams['interests'] = filters.interests.join(',');
    }
    if (filters.languages.isNotEmpty) {
      queryParams['languages'] = filters.languages.join(',');
    }

    final response = await _apiClient.get<MatchResult>(
      ApiEndpoints.matchSolo,
      queryParameters: queryParams,
      parser: (data) {
        if (data is! Map<String, dynamic>) return MatchResult.empty();
        final rawList = data['matches'] ?? data['data'] ?? <dynamic>[];
        return MatchResult(
          matches: safeParseList<MatchUser>(rawList, MatchUser.fromJson),
          hasMore: data['hasMore'] as bool? ?? false,
          totalCount: data['total'] as int? ?? 0,
        );
      },
    );

    _updateContractState(response.meta);

    return response.data ?? MatchResult.empty();
  }

  Future<MatchResult> matchGroups(
    String userId,
    SearchData searchData,
    ExploreFilters filters,
  ) async {
    final payload = <String, dynamic>{
      'userId': userId,
      'budget': searchData.budget,
      'startDate': searchData.startDate.toIso8601String().split('T')[0],
      'endDate': searchData.endDate.toIso8601String().split('T')[0],
      'ageMin': filters.ageRange[0],
      'ageMax': filters.ageRange[1],
      'languages': filters.languages,
      'interests': filters.interests,
      'smoking': filters.smoking == 'Yes',
      'drinking': filters.drinking == 'Yes',
      'nationality': filters.nationality != 'Any'
          ? filters.nationality
          : 'Unknown',
    };

    if (searchData.destination.trim().isNotEmpty && searchData.destination != 'Any') {
      payload['destination'] = searchData.destination;
    }

    if (searchData.destinationDetails != null) {
      payload['lat'] = searchData.destinationDetails!['lat'];
      payload['lon'] = searchData.destinationDetails!['lon'];
    }

    final response = await _apiClient.post<MatchResult>(
      ApiEndpoints.matchGroups,
      data: payload,
      parser: (data) {
        if (data is! Map<String, dynamic>) return MatchResult.empty();
        
        // 🛡️ Contract Authority: Read from 'groups' (standard) or 'data' (fallback)
        final rawList = data['groups'] ?? data['data'] ?? <dynamic>[];
        
        return MatchResult(
          matches: safeParseList<GroupModel>(rawList, GroupModel.fromJson),
          hasMore: data['hasMore'] as bool? ?? false,
          totalCount: data['total'] as int? ?? 0,
        );
      },
    );

    _updateContractState(response.meta);

    return response.data ?? MatchResult.empty();
  }

  Future<void> sendInterest({
    required String fromUserId,
    String? toUserId,
    String? toGroupId,
    required String destinationId,
    required bool isSolo,
  }) async {
    final payload = <String, dynamic>{
      'fromUserId': fromUserId,
      'destinationId': destinationId,
    };
    final String path;
    if (isSolo) {
      payload['toUserId'] = toUserId;
      path = ApiEndpoints.exploreInterest;
    } else {
      payload['toGroupId'] = toGroupId;
      path = 'groups/interest';
    }
    await _apiClient.post<void>(
      path,
      data: payload,
      parser: (_) {},
    );
  }

  Future<void> skipMatch({
    required String skipperId,
    String? skippedUserId,
    String? skippedGroupId,
    required String destinationId,
    required bool isSolo,
  }) async {
    final payload = <String, dynamic>{
      'skipperId': skipperId,
      'destinationId': destinationId,
      'type': isSolo ? 'solo' : 'group',
      'skippedUserId': isSolo ? skippedUserId : skippedGroupId,
    };
    await _apiClient.post<void>(
      ApiEndpoints.exploreSkip,
      data: payload,
      parser: (_) {},
    );
  }

  Future<void> reportMatch({
    required String reporterId,
    String? reportedUserId,
    String? reportedGroupId,
    required String reason,
    required bool isSolo,
  }) async {
    final payload = <String, dynamic>{
      'reporterId': reporterId,
      'reason': reason,
      'type': isSolo ? 'user' : 'group',
      'targetId': isSolo ? reportedUserId : reportedGroupId,
    };
    await _apiClient.post<void>(
      ApiEndpoints.exploreReport,
      data: payload,
      parser: (_) {},
    );
  }

  void _updateContractState(ApiMeta meta) {
    _ref.read(contractStateProvider.notifier).update(meta.contractState);
  }
}

final exploreServiceProvider = Provider<ExploreService>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return ExploreService(apiClient, ref);
});
