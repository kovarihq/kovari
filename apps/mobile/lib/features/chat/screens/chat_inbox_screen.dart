import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/navigation/routes.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_radius.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/core/widgets/skeletons/kovari_skeletons.dart';
import 'package:mobile/features/chat/models/conversation_entity.dart';
import 'package:mobile/features/chat/providers/conversation_runtime_store.dart';
import 'package:mobile/features/chat/screens/chat_screen.dart';
import 'package:mobile/shared/widgets/app_card.dart';
import 'package:mobile/shared/widgets/kovari_avatar.dart';
import 'package:mobile/shared/widgets/kovari_refresh_indicator.dart';

class ChatInboxScreen extends ConsumerStatefulWidget {
  const ChatInboxScreen({super.key});

  @override
  ConsumerState<ChatInboxScreen> createState() => _ChatInboxScreenState();
}

class _ChatInboxScreenState extends ConsumerState<ChatInboxScreen> {
  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(conversationRuntimeStoreProvider.notifier).fetchInbox();
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _clearSearch() {
    _searchController.clear();
    setState(() => _searchQuery = '');
  }

  @override
  Widget build(BuildContext context) {
    final conversations = ref.watch(conversationRuntimeStoreProvider);
    final isLoading = ref.watch(inboxLoadingProvider);

    // Sort by lastMessageAt descending
    final sorted = conversations.values.toList()
      ..sort((a, b) {
        final at = a.lastMessageAt;
        final bt = b.lastMessageAt;
        if (at == null && bt == null) return 0;
        if (at == null) return 1;
        if (bt == null) return -1;
        return bt.compareTo(at);
      });

    final filtered = _searchQuery.isEmpty
        ? sorted
        : sorted
              .where(
                (c) => (c.metadata?.displayName ?? '').toLowerCase().contains(
                  _searchQuery.toLowerCase(),
                ),
              )
              .toList();

    return Column(
      children: [
        // ── Sticky Header (Search Bar) ──────────────────────────────────
        Container(
          padding: EdgeInsets.fromLTRB(
            16,
            MediaQuery.of(context).padding.top + 16,
            16,
            16,
          ),
          decoration: BoxDecoration(color: AppColors.surface(context)),
          child: SizedBox(
            height: 44,
            child: TextField(
              controller: _searchController,
              onChanged: (val) => setState(() => _searchQuery = val),
              style: TextStyle(
                fontSize: 13,
                color: AppColors.text(context),
                fontWeight: FontWeight.w400,
              ),
              decoration: InputDecoration(
                filled: true,
                fillColor: AppColors.surface(context, level: 2),
                hintText: 'Search',
                hintStyle: TextStyle(
                  color: AppColors.text(context, isMuted: true),
                  fontSize: 13,
                  fontWeight: FontWeight.w400,
                ),
                prefixIcon: _searchQuery.isNotEmpty
                    ? IconButton(
                        icon: Icon(
                          LucideIcons.x,
                          size: 16,
                          color: AppColors.text(context, isMuted: true),
                        ),
                        onPressed: _clearSearch,
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                      )
                    : Icon(
                        LucideIcons.search,
                        size: 18,
                        color: AppColors.text(context, isMuted: true),
                      ),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(32),
                  borderSide: BorderSide(color: AppColors.borderColor(context)),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(32),
                  borderSide: BorderSide(color: AppColors.borderColor(context)),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(32),
                  borderSide: BorderSide(color: AppColors.borderColor(context)),
                ),
                contentPadding: const EdgeInsets.symmetric(horizontal: 12),
              ),
            ),
          ),
        ),

        // ── Scrollable Content ──────────────────────────────────────────
        Expanded(
          child: KovariRefreshIndicator(
            onRefresh: () => ref
                .read(conversationRuntimeStoreProvider.notifier)
                .fetchInbox(forceRefresh: true),
            child: CustomScrollView(
              physics: const BouncingScrollPhysics(
                parent: AlwaysScrollableScrollPhysics(),
              ),
              keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
              slivers: [
                // ── Loading Skeletons ─────────────────────────────────────
                if (isLoading && conversations.isEmpty)
                  SliverPadding(
                    padding: const EdgeInsets.symmetric(horizontal: 16.0),
                    sliver: SliverToBoxAdapter(
                      child: AppCard(
                        padding: EdgeInsets.zero,
                        child: ClipRRect(
                          borderRadius: AppRadius.large,
                          child: Column(
                            children: List.generate(
                              10,
                              (i) => Column(
                                children: [
                                  const KovariSkeletonChatListItem(),
                                  if (i < 9)
                                    Divider(
                                      height: 1,
                                      color: AppColors.borderColor(context),
                                    ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  )
                else if (filtered.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(
                      child: Text(
                        _searchQuery.isEmpty
                            ? 'No conversations yet.'
                            : 'No conversations found.',
                        style: AppTextStyles.bodyMedium.copyWith(
                          color: AppColors.text(context, isMuted: true),
                        ),
                      ),
                    ),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.only(
                      left: 16.0,
                      right: 16.0,
                      bottom: 16.0,
                    ),
                    sliver: SliverToBoxAdapter(
                      child: AppCard(
                        padding: EdgeInsets.zero,
                        child: ClipRRect(
                          borderRadius: AppRadius.large,
                          clipBehavior: Clip.antiAliasWithSaveLayer,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              for (int i = 0; i < filtered.length; i++) ...[
                                RepaintBoundary(
                                  child: _ConversationTile(
                                    state: filtered[i],
                                    onTap: () {
                                      context.push(
                                        '/chat/${filtered[i].chatId}',
                                      );
                                    },
                                  ),
                                ),
                                if (i < filtered.length - 1)
                                  Divider(
                                    height: 1,
                                    color: AppColors.borderColor(context),
                                  ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),

                const SliverToBoxAdapter(child: SizedBox(height: 110)),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

// ── Conversation Tile ────────────────────────────────────────────────────────

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({required this.state, required this.onTap});

  final ConversationRuntimeState state;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final metadata = state.metadata;
    if (metadata == null) return const SizedBox.shrink();

    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            // ── Avatar + Presence Dot ──────────────────────────────────
            KovariAvatar(
              imageUrl: metadata.displayAvatar,
              size: 40,
              fullName: metadata.displayName,
              isOnline: state.isPartnerOnline && !metadata.isGroup,
              borderColor: AppColors.surface(context, level: 1),
            ),
            const SizedBox(width: 12),

            // ── Content ────────────────────────────────────────────────
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Name + Timestamp
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(
                        child: Text(
                          metadata.displayName,
                          style: AppTextStyles.bodySmall.copyWith(
                            fontWeight: FontWeight.w600,
                            color: AppColors.text(context),
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        _formatTimestamp(state.lastMessageAt),
                        style: AppTextStyles.bodySmall.copyWith(
                          color: AppColors.text(context, isMuted: true),
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 1),

                  // Subtitle + Unread Badge
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Expanded(child: _buildSubtitle(context)),
                      if (state.unreadCount > 0)
                        Container(
                          margin: const EdgeInsets.only(left: 8),
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 2,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.primary,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          constraints: const BoxConstraints(
                            minWidth: 20,
                            minHeight: 20,
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            state.unreadCount > 99
                                ? '99+'
                                : '${state.unreadCount}',
                            style: AppTextStyles.bodySmall.copyWith(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSubtitle(BuildContext context) {
    final metadata = state.metadata;
    // Typing indicator (TTL-backed, auto-expires)
    final typingUsers = state.typingUserIds;
    if (typingUsers.isNotEmpty) {
      final String name = metadata?.isGroup == true
          ? (typingUsers.length == 1
                ? 'Someone'
                : '${typingUsers.length} people')
          : (metadata?.displayName ?? 'User');
      return Text(
        '$name is typing…',
        style: AppTextStyles.bodySmall.copyWith(
          color: AppColors.primary,
          fontSize: 12,
        ),
      );
    }

    final snippet = state.lastMessageSnippet;
    final mediaType = state.lastMessageMediaType;

    // No messages yet — new conversation
    if (snippet == null && (mediaType == null || mediaType == 'init')) {
      return Text(
        'Start a conversation!',
        style: AppTextStyles.bodySmall.copyWith(
          color: AppColors.primary,
          fontWeight: FontWeight.w500,
          fontSize: 12,
        ),
      );
    }

    // Media messages
    if (mediaType == 'image') {
      return Row(
        children: [
          Icon(
            LucideIcons.image,
            size: 14,
            color: AppColors.text(context, isMuted: true),
          ),
          const SizedBox(width: 4),
          Text(
            'Photo',
            style: AppTextStyles.bodySmall.copyWith(
              color: AppColors.text(context, isMuted: true),
              fontSize: 12,
            ),
          ),
        ],
      );
    }
    if (mediaType == 'video') {
      return Row(
        children: [
          Icon(
            LucideIcons.video,
            size: 14,
            color: AppColors.text(context, isMuted: true),
          ),
          const SizedBox(width: 4),
          Text(
            'Video',
            style: AppTextStyles.bodySmall.copyWith(
              color: AppColors.text(context, isMuted: true),
              fontSize: 12,
            ),
          ),
        ],
      );
    }

    // Text message — show snippet or neutral fallback
    final displayText = snippet?.isNotEmpty == true ? snippet! : 'Message';
    return Text(
      displayText,
      style: AppTextStyles.bodySmall.copyWith(
        color: AppColors.text(context, isMuted: true),
        fontSize: 12,
      ),
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
    );
  }

  String _formatTimestamp(DateTime? dt) {
    if (dt == null) return '';
    final now = DateTime.now();
    final diff = now.difference(dt);

    if (diff.inMinutes < 1) return 'now';
    if (diff.inHours < 1) return '${diff.inMinutes}m';
    if (diff.inDays < 1) return DateFormat.jm().format(dt);
    if (diff.inDays < 7) return DateFormat.E().format(dt); // Mon, Tue…
    return DateFormat.MMMd().format(dt); // Jan 5
  }
}
