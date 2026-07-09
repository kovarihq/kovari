/// 🛡️ API Contract State
enum ContractState { clean, filtered, degraded }

/// 🛡️ API Error Shape
class ApiError {

  const ApiError({required this.message, required this.code, this.requestId});

  factory ApiError.fromJson(Map<String, dynamic> json) => ApiError(
      message: (json['message'] ?? 'Unknown error').toString(),
      code: (json['code'] ?? 'UNKNOWN').toString(),
      requestId: json['requestId']?.toString(),
    );
  final String message;
  final String code;
  final String? requestId;
}

/// 🛡️ API Meta Shape
class ApiMeta {

  const ApiMeta({
    this.degraded = false,
    this.contractState = ContractState.clean,
    this.reason = '',
    this.droppedCount,
  });

  factory ApiMeta.fromJson(Map<String, dynamic> json) {
    final stateStr = (json['contractState'] ?? 'clean').toString();
    final state = ContractState.values.firstWhere(
      (e) => e.name == stateStr,
      orElse: () => ContractState.clean,
    );
    return ApiMeta(
      degraded: json['degraded'] == true,
      contractState: state,
      reason: (json['reason'] ?? '').toString(),
      droppedCount: json['droppedCount'] as int?,
    );
  }

  factory ApiMeta.degraded({String reason = 'unknown'}) => ApiMeta(
      degraded: true,
      contractState: ContractState.degraded,
      reason: reason,
    );
  final bool degraded;
  final ContractState contractState;
  final String reason;
  final int? droppedCount;
}

/// 🛡️ Standardized API Response
class ApiResponse<T> {

  const ApiResponse({
    required this.success,
    required this.meta,
    this.data,
    this.raw,
    this.error,
    this.requestId,
  });

  /// Parse a full standard response envelope
  factory ApiResponse.fromJson(
    Map<String, dynamic> json,
    T Function(dynamic) fromDataJson, {
    String? requestId,
  }) {
    try {
      // Validate top-level shape
      if (!json.containsKey('success')) {
        return ApiResponse.fallback(reason: 'malformed', requestId: requestId);
      }

      final rawData = json['data'];
      if (rawData == null) {
        return ApiResponse.fallback(reason: 'empty_body', requestId: requestId);
      }

      // Parse meta
      final rawMeta = json['meta'];
      final meta = rawMeta is Map<String, dynamic>
          ? ApiMeta.fromJson(rawMeta)
          : const ApiMeta();

      // Parse data
      final data = fromDataJson(rawData);

      final resolvedRequestId = requestId ?? json['requestId']?.toString();

      return ApiResponse(
        success: json['success'] == true,
        data: data,
        raw: rawData,
        meta: meta,
        error: json['error'] != null && json['error'] is Map<String, dynamic>
            ? ApiError.fromJson(json['error'] as Map<String, dynamic>)
            : null,
        requestId: resolvedRequestId,
      );
    } catch (e) {
      return ApiResponse.fallback(reason: 'malformed', requestId: requestId);
    }
  }

  /// Synthetic fallback — always safe, never crashes
  factory ApiResponse.fallback({
    String reason = 'network',
    String? requestId,
    dynamic raw,
    ApiError? error,
  }) => ApiResponse(
      success: true, // flow continues safely
      raw: raw,
      meta: ApiMeta.degraded(reason: reason),
      error: error,
      requestId: requestId,
    );
  final bool success;
  final T? data;
  final dynamic raw;
  final ApiMeta meta;
  final ApiError? error;
  final String? requestId;

  bool get isDegraded => meta.degraded;
  bool get isClean => meta.contractState == ContractState.clean;
}
