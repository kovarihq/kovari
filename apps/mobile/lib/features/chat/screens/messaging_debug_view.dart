import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/realtime/socket_service.dart';
import 'package:mobile/core/realtime/socket_state.dart';
import 'package:mobile/features/chat/providers/conversation_runtime_store.dart';
import 'package:mobile/features/chat/providers/message_store.dart';
import 'package:mobile/core/runtime/mutation_journal.dart';

/// Dev-only screen displaying real-time messaging runtime metrics.
///
/// Gate: Only accessible in debug builds. Never ship to production users.
///
/// Surfaces:
/// - Socket connection status
/// - Per-conversation watermarks (lastKnownServerSequence, lastReadSequence,
///   lastDeliveredSequence)
/// - Offline queue depth (MutationJournal pending count)
/// - Active conversation count in ConversationRuntimeStore
/// - Message count per hot conversation window
class MessagingDebugView extends ConsumerWidget {
  const MessagingDebugView({super.key, this.focusChatId});

  /// If provided, shows detailed state for this specific chatId.
  final String? focusChatId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final socketState = ref.watch(socketServiceProvider);
    final runtimeStore = ref.watch(conversationRuntimeStoreProvider);
    final journal = ref.read(mutationJournalProvider);

    final focusRuntime = focusChatId != null ? runtimeStore[focusChatId] : null;
    final focusMessages = focusChatId != null
        ? ref.watch(messageStoreProvider(focusChatId!))
        : null;

    final totalPending = runtimeStore.keys
        .fold<int>(0, (sum, id) => sum + journal.getPendingFor(id).length);

    final socketColor = switch (socketState) {
      SocketState.connected => const Color(0xFF34D399),
      SocketState.connecting || SocketState.recovering => const Color(0xFFFBBF24),
      _ => const Color(0xFFEF4444),
    };

    return Material(
      color: Colors.black,
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0xFF7C3AED),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: const Text(
                      'MESSAGING RUNTIME DEBUG',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontFamily: 'monospace',
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // Socket Status
              _section('SOCKET', [
                _row('State', socketState.name.toUpperCase(), valueColor: socketColor),
              ]),

              // Global Runtime
              _section('RUNTIME STORE', [
                _row('Conversations loaded', '${runtimeStore.length}'),
                _row('Offline queue depth', '$totalPending',
                    valueColor: totalPending > 0 ? const Color(0xFFFBBF24) : null),
              ]),

              // Focus Conversation
              if (focusChatId != null) ...[
                _section('FOCUS: $focusChatId', [
                  _row('Type', focusRuntime?.conversationType.name ?? 'N/A'),
                  _row(
                    'lastKnownServerSeq',
                    '${focusRuntime?.lastKnownServerSequence ?? 0}',
                  ),
                  _row(
                    'lastReadSeq',
                    '${focusRuntime?.lastReadSequence ?? 0}',
                  ),
                  _row(
                    'lastDeliveredSeq',
                    '${focusRuntime?.lastDeliveredSequence ?? 0}',
                  ),
                  _row(
                    'unreadCount',
                    '${focusRuntime?.unreadCount ?? 0}',
                  ),
                  _row(
                    'typingUsers',
                    focusRuntime?.typingUserIds.join(', ') ?? 'none',
                  ),
                  _row(
                    'partnerOnline',
                    '${focusRuntime?.isPartnerOnline ?? false}',
                    valueColor: focusRuntime?.isPartnerOnline == true
                        ? const Color(0xFF34D399)
                        : null,
                  ),
                  _row(
                    'Hot messages in RAM',
                    '${focusMessages?.hotMessages.length ?? 0}',
                  ),
                  _row(
                    'Total messages in RAM',
                    '${focusMessages?.messages.length ?? 0}',
                  ),
                  _row(
                    'Highest CSN',
                    '${focusMessages?.highestKnownSequence ?? 0}',
                  ),
                  _row(
                    'Pending gap',
                    focusMessages?.pendingGap != null
                        ? '${focusMessages!.pendingGap!.$1}–${focusMessages.pendingGap!.$2}'
                        : 'none',
                    valueColor: focusMessages?.pendingGap != null
                        ? const Color(0xFFFBBF24)
                        : null,
                  ),
                ]),
              ],

              // All Runtime Conversations
              _section('ALL CONVERSATIONS', [
                for (final entry in runtimeStore.entries)
                  _row(
                    entry.key.length > 20
                        ? '…${entry.key.substring(entry.key.length - 20)}'
                        : entry.key,
                    'unread:${entry.value.unreadCount} '
                        'seq:${entry.value.lastKnownServerSequence ?? 0} '
                        'type:${entry.value.conversationType.name[0].toUpperCase()}',
                  ),
                if (runtimeStore.isEmpty) _row('(empty)', ''),
              ]),
            ],
          ),
        ),
      ),
    );
  }

  Widget _section(String title, List<Widget> rows) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              color: Color(0xFF7C3AED),
              fontSize: 10,
              fontFamily: 'monospace',
              fontWeight: FontWeight.bold,
              letterSpacing: 1.5,
            ),
          ),
          const SizedBox(height: 4),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFF111111),
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: const Color(0xFF333333)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: rows,
            ),
          ),
          const SizedBox(height: 12),
        ],
      );

  Widget _row(String label, String value, {Color? valueColor}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              label,
              style: const TextStyle(
                color: Color(0xFF9CA3AF),
                fontSize: 11,
                fontFamily: 'monospace',
              ),
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                value,
                textAlign: TextAlign.right,
                style: TextStyle(
                  color: valueColor ?? const Color(0xFFE5E7EB),
                  fontSize: 11,
                  fontFamily: 'monospace',
                  fontWeight: FontWeight.w600,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      );
}
