import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/utils/safe_parser.dart';
import 'package:mobile/features/profile/models/safety_report.dart';

class SafetyService {
  SafetyService(this._apiClient);
  final ApiClient _apiClient;

  Future<List<SafetyReport>> fetchMyReports() async {
    final response = await _apiClient.get<List<SafetyReport>>(
      'reports/my-reports',
      parser: (data) {
        final reportsJson = data is Map<String, dynamic>
            ? (data['reports'] as List? ?? <dynamic>[])
            : <dynamic>[];
        return safeParseList(reportsJson, SafetyReport.fromJson);
      },
      ignoreCache: true,
    );
    return response.data ?? [];
  }

  Future<List<SafetyTarget>> searchTargets(String type, String query) async {
    final response = await _apiClient.get<List<SafetyTarget>>(
      'reports/targets',
      queryParameters: {'type': type, 'q': query},
      parser: (data) {
        final targetsJson = data is Map<String, dynamic>
            ? (data['targets'] as List? ?? <dynamic>[])
            : <dynamic>[];
        return safeParseList(targetsJson, SafetyTarget.fromJson);
      },
      ignoreCache: true,
    );
    return response.data ?? [];
  }

  Future<Map<String, dynamic>> submitReport({
    required String targetType,
    required String targetId,
    required String reason,
    String? evidenceUrl,
    String? evidencePublicId,
  }) async {
    final payload = {
      'targetType': targetType,
      'targetId': targetId,
      'reason': reason,
      'evidenceUrl': evidenceUrl,
      'evidencePublicId': evidencePublicId,
    };

    final response = await _apiClient.post<Map<String, dynamic>>(
      'flags',
      data: payload,
      parser: (data) =>
          data is Map<String, dynamic> ? data : <String, dynamic>{},
    );
    return response.data ?? <String, dynamic>{};
  }

  Future<void> blockUser({required String targetId}) async {
    final response = await _apiClient.post<dynamic>(
      'users/block',
      data: {'targetId': targetId, 'action': 'block'},
      parser: (data) => data,
    );
    final rawMap = response.raw;
    if (rawMap is Map<String, dynamic> && rawMap['success'] == true) {
      return;
    }
    throw Exception(response.error?.message ?? 'Failed to block user');
  }

  Future<void> unblockUser({required String targetId}) async {
    final response = await _apiClient.post<dynamic>(
      'users/block',
      data: {'targetId': targetId, 'action': 'unblock'},
      parser: (data) => data,
    );
    final rawMap = response.raw;
    if (rawMap is Map<String, dynamic> && rawMap['success'] == true) {
      return;
    }
    throw Exception(response.error?.message ?? 'Failed to unblock user');
  }

  Future<({bool iBlockedThem, bool theyBlockedMe})> checkBlockStatus({
    required String targetId,
  }) async {
    final response = await _apiClient.get<dynamic>(
      'users/block',
      queryParameters: {'targetId': targetId},
      parser: (data) => data,
      ignoreCache: true,
    );
    final rawMap = response.raw;
    if (rawMap is Map<String, dynamic>) {
      return (
        iBlockedThem: rawMap['iBlockedThem'] == true,
        theyBlockedMe: rawMap['theyBlockedMe'] == true,
      );
    }
    return (iBlockedThem: false, theyBlockedMe: false);
  }

  Future<bool> checkReportStatus({
    required String targetType,
    required String targetId,
  }) async {
    final response = await _apiClient.get<dynamic>(
      'flags/check',
      queryParameters: {'targetType': targetType, 'targetId': targetId},
      parser: (data) => data,
      ignoreCache: true,
    );
    final rawMap = response.raw;
    if (rawMap is Map<String, dynamic>) {
      return rawMap['hasActiveReport'] == true;
    }
    return false;
  }
}

final safetyServiceProvider = Provider<SafetyService>((ref) {
  final apiClient = ref.watch(apiClientProvider);
  return SafetyService(apiClient);
});
