import 'conversation_cache_models.dart';

class MergeResult {
  final List<CachedMessage> messages;
  final int inserted;
  final int updated;
  final int ignored;
  final int duplicatesRemoved;

  MergeResult({
    required this.messages,
    required this.inserted,
    required this.updated,
    required this.ignored,
    required this.duplicatesRemoved,
  });
}

class ConversationConflictResolver {
  static int _getStatusPriority(String status) {
    switch (status) {
      case 'failed':
        return 0;
      case 'pending':
        return 1;
      case 'sent':
        return 2;
      case 'delivered':
        return 3;
      case 'seen':
        return 4;
      default:
        return 1;
    }
  }

  static MergeResult merge({
    required List<CachedMessage> cached,
    required List<CachedMessage> incoming,
  }) {
    final Map<String, CachedMessage> map = {};
    int duplicatesRemoved = 0;
    
    for (final m in cached) {
      if (map.containsKey(m.id)) {
        duplicatesRemoved++;
        final existing = map[m.id]!;
        if (m.sequence > existing.sequence) {
          map[m.id] = m;
        } else if (m.sequence == existing.sequence) {
          final incomingPriority = _getStatusPriority(m.status);
          final existingPriority = _getStatusPriority(existing.status);
          if (incomingPriority > existingPriority) {
            map[m.id] = m;
          }
        }
      } else {
        map[m.id] = m;
      }
    }

    int inserted = 0;
    int updated = 0;
    int ignored = 0;

    for (final m in incoming) {
      final existing = map[m.id];
      if (existing == null) {
        map[m.id] = m;
        inserted++;
      } else {
        final incomingPriority = _getStatusPriority(m.status);
        final existingPriority = _getStatusPriority(existing.status);
        
        if (m.sequence > existing.sequence) {
          map[m.id] = m;
          updated++;
        } else if (m.sequence == existing.sequence) {
          if (incomingPriority > existingPriority) {
            map[m.id] = m;
            updated++;
          } else {
            ignored++;
          }
        } else {
          ignored++;
        }
      }
    }

    final mergedList = map.values.toList();
    mergedList.sort((a, b) => a.sequence.compareTo(b.sequence));

    return MergeResult(
      messages: mergedList,
      inserted: inserted,
      updated: updated,
      ignored: ignored,
      duplicatesRemoved: duplicatesRemoved,
    );
  }
}
