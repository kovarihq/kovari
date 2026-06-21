/// 🛡️ Safe list parser — drops malformed items without crashing.
///
/// Rules:
/// - Ignores null entries
/// - Ignores non-Map entries
/// - Always returns a non-null typed list
List<T> safeParseList<T>(
  dynamic rawList,
  T Function(Map<String, dynamic>) parser, {
  String? requestId,
}) {
  if (rawList == null) return [];
  if (rawList is! List) {
    return [];
  }

  final result = <T>[];
  for (final item in rawList) {
    if (item is! Map<String, dynamic>) continue;
    try {
      result.add(parser(item));
    } catch (e, stack) {
      print('❌ [safeParseList] Parsing error for $T: $e\n$stack');
    }
  }

  return result;
}
