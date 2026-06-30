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
        // Source priority rules: Server-acked "sent" overrides local optimistic "pending" status
        final isServerAck = m.status == 'sent' && existing.status == 'pending';
        if (m.sequence > existing.sequence || isServerAck) {
          map[m.id] = m;
          updated++;
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
