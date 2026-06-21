import 'package:flutter/rendering.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/network/api_endpoints.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/core/utils/safe_parser.dart';
import 'package:mobile/features/groups/models/group.dart';

class GroupService {
  GroupService(this._apiClient);
  final ApiClient _apiClient;

  Future<List<GroupModel>> getMyGroups({bool ignoreCache = false}) async {
    final response = await _apiClient.get<List<GroupModel>>(
      ApiEndpoints.myGroups,
      parser: parseGroups,
      ignoreCache: ignoreCache,
    );

    if (response.success && response.data != null) {
      final groups = response.data!;
      final groupsWithImg = groups
          .where((g) => g.destinationImage != null)
          .length;
      debugPrint(
        '📡 [GroupService] getMyGroups success: ${groups.length} groups found ($groupsWithImg with images)',
      );
      return groups;
    }

    throw Exception(response.error?.message ?? 'Failed to load groups');
  }

  List<GroupModel> parseGroups(dynamic data) {
    final actualData = (data is Map && data.containsKey('data'))
        ? data['data']
        : data;
    if (actualData is! List) return [];
    return actualData
        .map((e) => GroupModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<GroupModel> createGroup(Map<String, dynamic> data) async {
    final response = await _apiClient.post<GroupModel>(
      ApiEndpoints.createGroup,
      data: data,
      parser: (json) => GroupModel.fromJson(json as Map<String, dynamic>),
    );
    if (response.success && response.data != null) {
      return response.data!;
    }
    throw Exception(response.error?.message ?? 'Failed to create group');
  }

  Future<GroupModel> getGroupDetails(
    String groupId, {
    bool ignoreCache = false,
  }) async {
    final response = await _apiClient.get<GroupModel>(
      ApiEndpoints.groupDetails(groupId),
      ignoreCache: ignoreCache,
      parser: (json) {
        debugPrint(
          '📡 [GroupService] getGroupDetails Raw JSON for $groupId: $json',
        );
        return GroupModel.fromJson(json as Map<String, dynamic>);
      },
    );
    if (response.success && response.data != null) {
      return response.data!;
    }
    throw Exception(response.error?.message ?? 'Failed to fetch group details');
  }

  Future<List<GroupMember>> getGroupMembers(
    String groupId, {
    bool ignoreCache = false,
  }) async {
    final response = await _apiClient.get<List<GroupMember>>(
      ApiEndpoints.groupMembers(groupId),
      ignoreCache: ignoreCache,
      parser: (json) {
        if (json is List) {
          return json
              .map((m) => GroupMember.fromJson(m as Map<String, dynamic>))
              .toList();
        }
        if (json is Map && json['members'] is List) {
          return (json['members'] as List)
              .map((m) => GroupMember.fromJson(m as Map<String, dynamic>))
              .toList();
        }
        return [];
      },
    );

    if (response.success && response.data != null) {
      return response.data!;
    }

    throw Exception(response.error?.message ?? 'Failed to fetch group members');
  }

  Future<List<JoinRequestModel>> getJoinRequests(String groupId) async {
    final response = await _apiClient.get<List<JoinRequestModel>>(
      ApiEndpoints.groupJoinRequest(groupId),
      parser: (json) {
        if (json is Map && json['joinRequests'] is List) {
          return (json['joinRequests'] as List)
              .map((r) => JoinRequestModel.fromJson(r as Map<String, dynamic>))
              .toList();
        }
        return [];
      },
    );
    return response.data ?? [];
  }

  Future<void> approveJoinRequest(String groupId, String userId) async {
    AppLogger.d("[GroupService] Approving join request for userId: '$userId'");
    final response = await _apiClient.post<dynamic>(
      ApiEndpoints.groupJoin(groupId),
      data: {'userId': userId},
      parser: (json) => json,
    );
    if (!response.success) {
      throw Exception(response.error?.message ?? 'Failed to approve');
    }
  }

  Future<void> rejectJoinRequest(String groupId, String requestId) async {
    final response = await _apiClient.delete<dynamic>(
      ApiEndpoints.groupJoinRequest(groupId),
      data: {'requestId': requestId},
      parser: (json) => json,
    );
    if (!response.success) {
      throw Exception(response.error?.message ?? 'Failed to reject');
    }
  }

  Future<void> removeMember(
    String groupId,
    String memberId,
    String memberClerkId,
  ) async {
    final response = await _apiClient.delete<dynamic>(
      ApiEndpoints.groupMembers(groupId),
      data: {'memberId': memberId, 'memberClerkId': memberClerkId},
      parser: (json) => json,
    );
    if (!response.success) {
      throw Exception(response.error?.message ?? 'Failed to remove member');
    }
  }

  Future<String> getInviteLink(String groupId) async {
    final response = await _apiClient.get<String>(
      '${ApiEndpoints.groupInvitationLink(groupId)}&platform=mobile',
      parser: (json) => (json as Map)['link'] as String,
    );
    final rawLink = (response.data ?? '').trim();

    // Industry Standard: Use the production domain for all invitation links.
    // This transforms legacy deep links (kovari://) OR local dev links
    // into standard Universal Links (https://kovari.in) that are perfectly
    // clickable in WhatsApp/Email and trigger native app deep-linking.
    if (rawLink.isNotEmpty) {
      final token = rawLink.split('/').last;
      return 'https://kovari.in/invite/$token';
    }

    return rawLink;
  }

  Future<Map<String, dynamic>> getInviteInfo(String token) async {
    final response = await _apiClient.get<Map<String, dynamic>>(
      ApiEndpoints.v1InviteInfo(token),
      parser: (json) => json as Map<String, dynamic>,
    );
    if (!response.success || response.data == null) {
      throw Exception(response.error?.message ?? 'Invalid invite link');
    }
    return response.data!;
  }

  Future<void> sendGroupInvite(
    String groupId,
    List<Map<String, String>> invites,
  ) async {
    final response = await _apiClient.post<dynamic>(
      ApiEndpoints.groupInvitationSend,
      data: {'groupId': groupId, 'invites': invites, 'platform': 'mobile'},
      parser: (json) => json,
    );
    if (!response.success) {
      throw Exception(response.error?.message ?? 'Failed to send invites');
    }

    // Handle status-based "errors" that come back as 200 OK correctly
    if (response.data is Map) {
      final data = response.data as Map;
      final status = data['status'];
      if (status != null && status != 'sent' && status != 'success') {
        throw Exception(data['message'] ?? 'Failed to send invite');
      }
    }
  }

  Future<List<ItineraryItem>> getGroupItinerary(
    String groupId, {
    bool ignoreCache = false,
  }) async {
    final response = await _apiClient.get<List<ItineraryItem>>(
      ApiEndpoints.groupItinerary(groupId),
      ignoreCache: ignoreCache,
      parser: (data) {
        final rawList = data is List ? data : <dynamic>[];
        return safeParseList(rawList, ItineraryItem.fromJson);
      },
    );
    return response.data ?? [];
  }

  Future<MembershipInfo> getGroupMembership(
    String groupId, {
    bool ignoreCache = false,
  }) async {
    final response = await _apiClient.get<MembershipInfo>(
      ApiEndpoints.groupMembership(groupId),
      ignoreCache: ignoreCache,
      parser: (json) => MembershipInfo.fromJson(json as Map<String, dynamic>),
    );
    if (response.success && response.data != null) {
      return response.data!;
    }
    throw Exception('Failed to fetch group membership');
  }

  Future<void> sendJoinRequest(String groupId) async {
    final response = await _apiClient.post<void>(
      ApiEndpoints.groupJoinRequest(groupId),
      parser: (_) {},
    );
    if (!response.success) throw Exception('Failed to send join request');
  }

  Future<void> joinGroup(String groupId, {bool viaInvite = false}) async {
    final response = await _apiClient.post<void>(
      ApiEndpoints.groupJoin(groupId),
      data: viaInvite ? {'viaInvite': true} : <String, dynamic>{},
      parser: (_) {},
    );
    AppLogger.d(
      'Join API Response - Success: ${response.success}, Error: ${response.error?.message}',
    );
    if (!response.success) {
      throw Exception(response.error?.message ?? 'Failed to join group');
    }
  }

  Future<void> generateAiOverview(String groupId) async {
    final response = await _apiClient.post<void>(
      ApiEndpoints.groupAiOverview(groupId),
      parser: (_) {},
    );
    if (!response.success) throw Exception('Failed to generate AI overview');
  }

  Future<GroupModel> updateGroup(
    String groupId,
    Map<String, dynamic> data,
  ) async {
    final response = await _apiClient.patch<GroupModel>(
      ApiEndpoints.groupDetails(groupId),
      data: data,
      parser: (json) => GroupModel.fromJson(json as Map<String, dynamic>),
    );
    if (response.success && response.data != null) {
      return response.data!;
    }
    throw Exception(response.error?.message ?? 'Failed to update group');
  }

  Future<GroupModel> updateGroupNotes(String groupId, String notes) async =>
      updateGroup(groupId, {'notes': notes});

  Future<void> updateItineraryItem(
    String groupId,
    String itemId,
    Map<String, dynamic> data,
  ) async {
    final response = await _apiClient.put<void>(
      ApiEndpoints.itineraryItem(groupId, itemId),
      data: data,
      parser: (_) {},
    );
    if (!response.success) throw Exception('Failed to update itinerary item');
  }

  Future<void> createItineraryItem(
    String groupId,
    Map<String, dynamic> data,
  ) async {
    final response = await _apiClient.post<void>(
      ApiEndpoints.groupItinerary(groupId),
      data: data,
      parser: (_) {},
    );
    if (!response.success) throw Exception('Failed to create itinerary item');
  }

  Future<void> deleteItineraryItem(String groupId, String itemId) async {
    final response = await _apiClient.delete<void>(
      ApiEndpoints.itineraryItem(groupId, itemId),
      parser: (_) {},
    );
    if (!response.success) throw Exception('Failed to delete itinerary item');
  }

  Future<void> leaveGroup(String groupId) async {
    final response = await _apiClient.post<void>(
      ApiEndpoints.groupLeave(groupId),
      parser: (_) {},
    );
    if (!response.success) throw Exception('Failed to leave group');
  }

  Future<void> deleteGroup(String groupId) async {
    final response = await _apiClient.delete<void>(
      ApiEndpoints.groupDelete(groupId),
      parser: (_) {},
    );
    if (!response.success) throw Exception('Failed to delete group');
  }
}
