import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/features/groups/models/group.dart';
import 'package:mobile/features/groups/providers/entity_stores.dart';
import 'package:mobile/features/groups/providers/group_details_provider.dart';
import 'package:mobile/features/groups/widgets/edit_group_sheets.dart';
import 'package:mobile/features/groups/widgets/management_sheets.dart';
import 'package:mobile/features/groups/widgets/settings_widgets.dart';
import 'package:mobile/shared/widgets/kovari_confirm_dialog.dart';

class SettingsTab extends ConsumerWidget {

  const SettingsTab({
    super.key,
    required this.group,
    required this.onViewMembers,
  });
  final GroupModel group;
  final VoidCallback onViewMembers;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final membershipState = ref.watch(membershipStoreProvider.select((s) => s[group.id]));
    final dateStr = group.dateRange.start != null
        ? "${DateFormat('MMM d').format(DateTime.parse(group.dateRange.start!))} - ${group.dateRange.end != null ? DateFormat('MMM d').format(DateTime.parse(group.dateRange.end!)) : 'Ongoing'}"
        : 'Not set';

    return Container(
      color: AppColors.backgroundColor(context),
      child: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          KovariSection(
            title: 'Group Info',
            children: [
              KovariListRow(
                icon: LucideIcons.image,
                label: 'Cover Image',
                subtitle: 'Update the primary image for your group',
                onTap: () =>
                    _showEditSheet(context, EditCoverPhotoSheet(group: group)),
              ),
              KovariListRow(
                icon: LucideIcons.info,
                label: 'Group Details',
                subtitle: 'Name, description, destination',
                onTap: () =>
                    _showEditSheet(context, EditBasicInfoSheet(group: group)),
              ),
              KovariListRow(
                icon: LucideIcons.calendar,
                label: 'Dates & Budget',
                subtitle:
                    "$dateStr${group.budget != null ? ' · \$${group.budget}' : ''}",
                onTap: () => _showEditSheet(
                  context,
                  EditTravelDetailsSheet(group: group),
                ),
              ),
            ],
          ),
          KovariSection(
            title: 'Management',
            children: [
              KovariListRow(
                icon: LucideIcons.users,
                label: 'Manage Members',
                subtitle: 'Add, remove, or change roles',
                onTap: () => _showEditSheet(
                  context,
                  GroupMembersManagementSheet(
                    group: group,
                    isAdmin: membershipState?.data?.isAdmin ?? false,
                  ),
                ),
              ),
              KovariListRow(
                icon: LucideIcons.userPlus,
                label: 'Invite Members',
                subtitle: 'Share link or invite by username',
                onTap: () =>
                    _showEditSheet(context, InviteMembersSheet(group: group)),
              ),
              if (membershipState?.data?.isAdmin == true ||
                  membershipState?.data?.isCreator == true)
                KovariListRow(
                  icon: LucideIcons.inbox,
                  label: 'Join Requests',
                  subtitle: 'Review pending membership requests',
                  onTap: () =>
                      _showEditSheet(context, JoinRequestsSheet(group: group)),
                ),
            ],
          ),
          KovariSection(
            title: 'Preferences',
            children: [
              KovariListRow(
                icon: LucideIcons.shieldCheck,
                label: 'Privacy & Policies',
                subtitle:
                    "${group.privacy == 'public' ? 'Public' : 'Private'} Group${group.smokingPolicy == 'true' || group.drinkingPolicy == 'true' ? ' · Strict Policies' : ''}",
                onTap: () =>
                    _showEditSheet(context, EditPoliciesSheet(group: group)),
              ),
            ],
          ),
          KovariSection(
            title: 'Actions',
            children: [
              KovariListRow(
                icon: LucideIcons.logOut,
                iconColor: AppColors.destructive,
                label: 'Leave Group',
                labelColor: AppColors.destructive,
                onTap: () => _showLeaveConfirmation(context, ref),
              ),
              if (membershipState?.data?.isCreator == true)
                KovariListRow(
                  icon: LucideIcons.trash2,
                  iconColor: AppColors.destructive,
                  label: 'Delete Group',
                  labelColor: AppColors.destructive,
                  onTap: () => _showDeleteConfirmation(context, ref),
                ),
            ],
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }

  void _showEditSheet(BuildContext context, Widget sheet) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => sheet,
    );
  }

  void _showLeaveConfirmation(BuildContext context, WidgetRef ref) {
    showKovariConfirmDialog(
      context: context,
      title: 'Leave Group?',
      content: 'Are you sure you want to leave this travel group?',
      confirmLabel: 'Leave',
      isDestructive: true,
      onConfirm: () {
        ref.read(groupActionsProvider(group.id)).leaveGroup();
        context.pop(); // Close the settings sheet/screen
      },
    );
  }

  void _showDeleteConfirmation(BuildContext context, WidgetRef ref) {
    showKovariConfirmDialog(
      context: context,
      title: 'Delete Group?',
      content:
          'This action is permanent and will delete all trip data and chats for everyone.',
      confirmLabel: 'Delete',
      isDestructive: true,
      onConfirm: () {
        ref.read(groupActionsProvider(group.id)).deleteGroup();
        context.pop(); // Close settings
      },
    );
  }
}
