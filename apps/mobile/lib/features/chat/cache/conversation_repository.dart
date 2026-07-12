import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/realtime/socket_service.dart';

class ConversationRepository {
  final ApiClient _apiClient;
  final SocketService _socketService;

  ConversationRepository({
    required ApiClient apiClient,
    required SocketService socketService,
  })  : _apiClient = apiClient,
        _socketService = socketService;

  Future<Map<String, dynamic>?> fetchMessages({
    required String path,
    required Map<String, dynamic> queryParameters,
  }) async {
    final response = await _apiClient.get<dynamic>(
      path,
      queryParameters: queryParameters,
      parser: (data) => data,
      ignoreCache: true,
    );
    final rawData = response.data;
    if (rawData is List) {
      return <String, dynamic>{'messages': rawData};
    } else if (rawData is Map) {
      return Map<String, dynamic>.from(rawData);
    }
    return null;
  }

  void emitSocket(String event, Map<String, dynamic> data, [Function? callback]) {
    _socketService.emit(event, data, callback);
  }
}
