import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/widgets/skeletons/kovari_skeletons.dart';
import 'package:mobile/features/groups/models/group.dart';
import 'package:mobile/features/groups/providers/entity_stores.dart';
import 'package:mobile/features/groups/providers/group_details_provider.dart';
import 'package:mobile/features/groups/widgets/modals/itinerary_form_modal.dart';
import 'package:mobile/features/groups/models/hydrated_state.dart';
import 'package:mobile/shared/widgets/kovari_avatar.dart';
import 'package:mobile/shared/widgets/kovari_confirm_dialog.dart';
import 'package:mobile/shared/widgets/kovari_popover.dart';
import 'package:mobile/shared/widgets/kovari_refresh_indicator.dart';

class ItineraryTab extends ConsumerStatefulWidget {
  const ItineraryTab({super.key, required this.group});
  final GroupModel group;

  @override
  ConsumerState<ItineraryTab> createState() => _ItineraryTabState();
}

class _ItineraryTabState extends ConsumerState<ItineraryTab>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final itineraryState = ref.watch(
      itineraryStoreProvider.select((s) => s[widget.group.id]),
    );
    final membersState = ref.watch(
      memberStoreProvider.select((s) => s[widget.group.id]),
    );
    final membershipState = ref.watch(
      membershipStoreProvider.select((s) => s[widget.group.id]),
    );
    final optimisticStore = ref.watch(optimisticStoreProvider);
    final optimisticItinerary = optimisticStore[widget.group.id];

    if ((itineraryState == null || !itineraryState.hasData) &&
        optimisticItinerary == null) {
      return const KovariSkeletonItineraryBoard();
    }

    final baseItinerary = itineraryState?.data ?? [];
    final itinerary = optimisticItinerary ?? baseItinerary;
    final members = membersState?.data ?? [];

    // Group by status
    final todo = itinerary.where((i) => i.status == 'pending').toList();
    final inProgress = itinerary.where((i) => i.status == 'confirmed').toList();
    final done = itinerary.where((i) => i.status == 'completed').toList();
    final cancelled = itinerary.where((i) => i.status == 'cancelled').toList();

    return KovariRefreshIndicator(
      onRefresh: () async {
        // Hydration logic is handled by the scheduler; just request intent
        ref.read(itineraryStoreProvider.notifier).subscribe(widget.group.id);
      },
      child: CustomScrollView(
        key: PageStorageKey(
          'itinerary_${widget.group.id}',
        ), // 🛡️ [Replay Engine] Scroll restoration
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                const Text(
                  'Itinerary Board',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 4),
                Text(
                  "Plan and organize your group's travel activities",
                  style: TextStyle(
                    color: AppColors.text(context, isMuted: true),
                    fontSize: 13,
                  ),
                ),
                const SizedBox(height: 20),
                _buildItinerarySection(
                  context,
                  ref,
                  'To do',
                  'pending',
                  todo,
                  const Color(0xFFF59E0B),
                  members,
                  membershipState,
                ),
                _buildItinerarySection(
                  context,
                  ref,
                  'In Progress',
                  'confirmed',
                  inProgress,
                  const Color(0xFF007AFF),
                  members,
                  membershipState,
                ),
                _buildItinerarySection(
                  context,
                  ref,
                  'Done',
                  'completed',
                  done,
                  const Color(0xFF34C759),
                  members,
                  membershipState,
                ),
                _buildItinerarySection(
                  context,
                  ref,
                  'Cancelled',
                  'cancelled',
                  cancelled,
                  const Color(0xFFF31260),
                  members,
                  membershipState,
                ),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildItinerarySection(
    BuildContext context,
    WidgetRef ref,
    String title,
    String targetStatus,
    List<ItineraryItem> items,
    Color dotColor,
    List<GroupMember> groupMembers,
    HydratedState<MembershipInfo>? membershipState,
  ) => DragTarget<ItineraryItem>(
    onWillAcceptWithDetails: (details) => details.data.status != targetStatus,
    onAcceptWithDetails: (details) async {
      final item = details.data;
      final messenger = ScaffoldMessenger.of(context);
      try {
        await ref
            .read(groupActionsProvider(widget.group.id))
            .updateItineraryStatus(item, targetStatus);
      } catch (e) {
        var errorMessage = 'Failed to update item';
        if (e is DioException) {
          final data = e.response?.data;
          if (data is Map && data.containsKey('error')) {
            errorMessage = "${data['error']}";
          } else {
            errorMessage = e.message ?? errorMessage;
          }
        }
        messenger.showSnackBar(
          SnackBar(
            content: Text(errorMessage),
            backgroundColor: Colors.redAccent,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    },
    builder: (context, candidateData, rejectedData) {
      final isOver = candidateData.isNotEmpty;
      return Container(
        margin: const EdgeInsets.only(bottom: 20),
        decoration: BoxDecoration(
          color: AppColors.surface(context, level: 1),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isOver ? AppColors.primary : AppColors.borderColor(context),
            width: isOver ? 2 : 1,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: AppColors.surface(context, level: 1),
                border: Border(
                  bottom: BorderSide(color: AppColors.borderColor(context)),
                ),
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(20),
                  topRight: Radius.circular(20),
                ),
              ),
              child: Row(
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: dotColor,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    title,
                    style: const TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      '${items.length}',
                      style: TextStyle(
                        color: AppColors.text(context, isMuted: true),
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  const Spacer(),
                  if (membershipState?.data?.isCreator == true ||
                      membershipState?.data?.isAdmin == true ||
                      (membershipState?.data?.isMember == true &&
                          membershipState?.data?.hasPendingRequest != true))
                    IconButton(
                      icon: const Icon(LucideIcons.plus, size: 18),
                      color: AppColors.text(context, isMuted: true),
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                      onPressed: () {
                        showModalBottomSheet<void>(
                          context: context,
                          isScrollControlled: true,
                          backgroundColor: Colors.transparent,
                          useRootNavigator: true,
                          builder: (context) => ItineraryFormModal(
                            groupId: widget.group.id,
                            initialStatus: targetStatus,
                          ),
                        );
                      },
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Column(
                children: [
                  if (items.isEmpty)
                    const SizedBox(height: 12)
                  else
                    ...items.map(
                      (item) => Padding(
                        padding: const EdgeInsets.fromLTRB(14, 8, 14, 8),
                        child: _buildDraggableItineraryItem(
                          context,
                          ref,
                          item,
                          groupMembers,
                          membershipState,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      );
    },
  );

  Widget _buildDraggableItineraryItem(
    BuildContext context,
    WidgetRef ref,
    ItineraryItem item,
    List<GroupMember> groupMembers,
    HydratedState<MembershipInfo>? membershipState,
  ) => LongPressDraggable<ItineraryItem>(
    data: item,
    feedback: SizedBox(
      width: 300, // Approximate width of the card
      child: Material(
        elevation: 3.0,
        borderRadius: BorderRadius.circular(16),
        child: _buildItineraryItemCard(
          context,
          ref,
          item,
          groupMembers,
          membershipState,
        ),
      ),
    ),
    childWhenDragging: Opacity(
      opacity: 0.4,
      child: _buildItineraryItemCard(
        context,
        ref,
        item,
        groupMembers,
        membershipState,
      ),
    ),
    child: _buildItineraryItemCard(
      context,
      ref,
      item,
      groupMembers,
      membershipState,
    ),
  );

  Widget _buildItineraryItemCard(
    BuildContext context,
    WidgetRef ref,
    ItineraryItem item,
    List<GroupMember> groupMembers,
    HydratedState<MembershipInfo>? membershipState,
  ) {
    final dt = DateTime.parse(item.datetime).toLocal();
    final daySuffix = _getOrdinalSuffix(dt.day);
    final formattedDate =
        "${DateFormat('MMMM d').format(dt)}$daySuffix, ${dt.year}";

    return Card(
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: AppColors.borderColor(context)),
      ),
      color: AppColors.surface(context, level: 1),
      child: Padding(
        padding: const EdgeInsets.only(
          left: 14,
          right: 14,
          top: 14,
          bottom: 14,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    _buildStatusBadge(context, item.status),
                    const SizedBox(width: 8),
                    _buildPriorityBadge(context, item.priority),
                  ],
                ),
                if (membershipState?.data?.isCreator == true ||
                    membershipState?.data?.isAdmin == true ||
                    (membershipState?.data?.isMember == true &&
                        membershipState?.data?.hasPendingRequest != true))
                  KovariPopover(
                    width: 120,
                    offset: const Offset(-102, 24),
                    items: [
                      KovariMenuAction(
                        icon: LucideIcons.pencil,
                        label: 'Edit',
                        labelFontSize: 14,
                        onTap: () {
                          showModalBottomSheet<void>(
                            context: context,
                            isScrollControlled: true,
                            backgroundColor: Colors.transparent,
                            useRootNavigator: true,
                            builder: (context) => ItineraryFormModal(
                              groupId: widget.group.id,
                              initialItem: item,
                            ),
                          );
                        },
                      ),
                      KovariMenuAction(
                        icon: LucideIcons.trash2,
                        label: 'Delete',
                        labelFontSize: 14,
                        isDestructive: true,
                        onTap: () {
                          showKovariConfirmDialog(
                            context: context,
                            title: 'Delete itinerary item?',
                            content:
                                'Are you sure you want to delete "${item.title}"? This action cannot be undone.',
                            confirmLabel: 'Delete',
                            isDestructive: true,
                            onConfirm: () async {
                              try {
                                await ref
                                    .read(groupActionsProvider(widget.group.id))
                                    .deleteItineraryItem(item.id);
                              } catch (e) {
                                if (!context.mounted) return;
                                ScaffoldMessenger.of(context).showSnackBar(
                                  SnackBar(
                                    content: Text('Failed to delete: $e'),
                                  ),
                                );
                              }
                            },
                          );
                        },
                      ),
                    ],
                    child: Icon(
                      LucideIcons.ellipsis,
                      size: 18,
                      color: AppColors.text(context, isMuted: true),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              item.title,
              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
            ),
            if (item.description.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                item.description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 13,
                  color: AppColors.text(context, isMuted: true),
                  height: 1.4,
                ),
              ),
            ],
            const SizedBox(height: 10),
            Row(
              children: [
                Icon(
                  LucideIcons.calendar,
                  size: 14,
                  color: AppColors.text(context, isMuted: true),
                ),
                const SizedBox(width: 8),
                Text(
                  formattedDate,
                  style: TextStyle(
                    fontSize: 13,
                    color: AppColors.text(context, isMuted: true),
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(width: 16),
                Icon(
                  LucideIcons.clock,
                  size: 14,
                  color: AppColors.text(context, isMuted: true),
                ),
                const SizedBox(width: 8),
                Text(
                  DateFormat('hh:mm a').format(dt).toLowerCase(),
                  style: TextStyle(
                    fontSize: 13,
                    color: AppColors.text(context, isMuted: true),
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Row(
              children: [
                Icon(
                  LucideIcons.mapPin,
                  size: 14,
                  color: AppColors.text(context, isMuted: true),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    item.location,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 13,
                      color: AppColors.text(context, isMuted: true),
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            if (item.notes != null && item.notes!.isNotEmpty) ...[
              Row(
                children: [
                  Icon(
                    LucideIcons.fileText,
                    size: 14,
                    color: AppColors.text(context, isMuted: true),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      item.notes!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        color: AppColors.text(context, isMuted: true),
                        height: 1.4,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
            ],
            Row(
              children: [
                Text(
                  'Assignees :',
                  style: TextStyle(
                    fontSize: 13,
                    color: AppColors.text(context, isMuted: true),
                    fontWeight: FontWeight.w500,
                  ),
                ),
                const SizedBox(width: 10),
                if (item.assignedTo != null && item.assignedTo!.isNotEmpty)
                  _buildAvatarStack(context, item.assignedTo, groupMembers)
                else
                  Text(
                    'No assignees',
                    style: TextStyle(
                      fontSize: 13,
                      color: AppColors.text(context, isMuted: true),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _getOrdinalSuffix(int day) {
    if (day >= 11 && day <= 13) {
      return 'th';
    }
    switch (day % 10) {
      case 1:
        return 'st';
      case 2:
        return 'nd';
      case 3:
        return 'rd';
      default:
        return 'th';
    }
  }

  Widget _buildAvatarStack(
    BuildContext context,
    List<String>? assignedIds,
    List<GroupMember> allMembers,
  ) {
    if (assignedIds == null || assignedIds.isEmpty) {
      return const SizedBox.shrink();
    }
    final idsToShow = assignedIds.take(3).toList();
    final avatars = <Widget>[];
    for (var i = 0; i < idsToShow.length; i++) {
      final assignedId = idsToShow[i];
      final member = allMembers.cast<GroupMember?>().firstWhere(
        (m) => m?.id == assignedId || m?.username == assignedId,
        orElse: () => null,
      );
      avatars.add(
        Positioned(
          left: i * 16.0,
          child: DecoratedBox(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: AppColors.surface(context, level: 1),
                width: 2,
              ),
            ),
            child: KovariAvatar(imageUrl: member?.avatar, size: 28),
          ),
        ),
      );
    }
    if (assignedIds.length > 3) {
      avatars.add(
        Positioned(
          left: 3 * 16.0,
          child: Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: AppColors.mutedColor(context),
              shape: BoxShape.circle,
              border: Border.all(
                color: AppColors.surface(context, level: 1),
                width: 2,
              ),
            ),
            child: Center(
              child: Text(
                '+${assignedIds.length - 3}',
                style: const TextStyle(
                  fontSize: 10,
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
        ),
      );
    }
    return SizedBox(
      height: 32,
      width: (idsToShow.length * 16.0) + (assignedIds.length > 3 ? 34 : 14),
      child: Stack(clipBehavior: Clip.none, children: avatars),
    );
  }

  Widget _buildPriorityBadge(BuildContext context, String priority) {
    var bgColor = const Color(0xFFF4F4F5);
    var textColor = const Color(0xFF71717A);
    var label = priority.toUpperCase();
    final isDark = AppColors.isDark(context);
    switch (priority.toLowerCase()) {
      case 'medium':
        bgColor = isDark
            ? const Color(0xFF422006).withValues(alpha: 0.3)
            : const Color.fromARGB(255, 255, 247, 216);
        textColor = isDark
            ? const Color(0xFFFACC15)
            : const Color.fromARGB(255, 193, 148, 0);
        label = 'Medium';
        break;
      case 'high':
        bgColor = isDark
            ? const Color(0xFF064E3B).withValues(alpha: 0.3)
            : const Color(0xFFDCFCE7);
        textColor = isDark ? const Color(0xFF4ADE80) : const Color(0xFF15803D);
        label = 'High';
        break;
      case 'low':
        bgColor = isDark ? const Color(0xFF27272A) : const Color(0xFFF4F4F5);
        textColor = isDark ? const Color(0xFFA1A1AA) : const Color(0xFF71717A);
        label = 'Low';
        break;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: textColor,
          fontSize: 12,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  Widget _buildStatusBadge(BuildContext context, String status) {
    Color color = Colors.grey;
    var bgColor = Colors.grey.withValues(alpha: 0.1);
    var label = status.toUpperCase();
    final isDark = AppColors.isDark(context);
    switch (status.toLowerCase()) {
      case 'confirmed':
        color = isDark ? const Color(0xFF60A5FA) : const Color(0xFF1D4ED8);
        bgColor = isDark
            ? const Color(0xFF1E3A8A).withValues(alpha: 0.3)
            : const Color(0xFFEFF6FF);
        label = 'In Progress';
        break;
      case 'completed':
        color = isDark ? const Color(0xFF4ADE80) : const Color(0xFF15803D);
        bgColor = isDark
            ? const Color(0xFF064E3B).withValues(alpha: 0.3)
            : const Color(0xFFF0FDF4);
        label = 'Completed';
        break;
      case 'pending':
        color = isDark
            ? const Color(0xFFFACC15)
            : const Color.fromARGB(255, 193, 148, 0);
        bgColor = isDark
            ? const Color(0xFF422006).withValues(alpha: 0.3)
            : const Color.fromARGB(255, 255, 247, 216);
        label = 'Not Started';
        break;
      case 'cancelled':
        color = isDark ? const Color(0xFFF87171) : const Color(0xFFB91C1C);
        bgColor = isDark
            ? const Color(0xFF7F1D1D).withValues(alpha: 0.3)
            : const Color(0xFFFEF2F2);
        label = 'Cancelled';
        break;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
