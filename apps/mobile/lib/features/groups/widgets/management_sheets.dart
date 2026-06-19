import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/features/groups/models/group.dart';
import 'package:mobile/features/groups/providers/entity_stores.dart';
import 'package:mobile/features/groups/providers/group_details_provider.dart';
import 'package:mobile/features/groups/widgets/edit_group_sheets.dart';
import 'package:mobile/features/groups/widgets/settings_widgets.dart';
import 'package:mobile/shared/widgets/kovari_avatar.dart';
import 'package:mobile/shared/widgets/kovari_confirm_dialog.dart';
import 'package:mobile/shared/widgets/kovari_snackbar.dart';
import 'package:mobile/shared/widgets/text_input_field.dart';
import 'package:share_plus/share_plus.dart';

/// 👥 Manage Group Members (Admin only view with Remove options)
class GroupMembersManagementSheet extends ConsumerWidget {

  const GroupMembersManagementSheet({
    super.key,
    required this.group,
    required this.isAdmin,
  });
  final GroupModel group;
  final bool isAdmin;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final membersState = ref.watch(memberStoreProvider.select((s) => s[group.id]));

    return SettingsBottomSheet(
      title: 'Group Members',
      children: [
        (() {
          if (membersState == null || (membersState.isHydrating && !membersState.hasData)) {
            return const Center(
              child: Padding(
                padding: EdgeInsets.symmetric(vertical: 50),
                child: SizedBox(
                  height: 20,
                  width: 20,
                  child: CircularProgressIndicator(strokeWidth: 3),
                ),
              ),
            );
          }
          if (membersState.error != null && !membersState.hasData) {
            return Center(child: Text('Error loading members'));
          }

          final members = membersState.data ?? [];
          return KovariGroupContainer(
            backgroundColor: AppColors.surface(context, level: 1),
            children: () {
              final sortedMembers = [...members]
                ..sort((a, b) {
                  // 1. Role priority (Admin first)
                  if (a.role == 'admin' && b.role != 'admin') return -1;
                  if (a.role != 'admin' && b.role == 'admin') return 1;

                  // 2. Alphabetical priority
                  return a.name.toLowerCase().compareTo(b.name.toLowerCase());
                });

              return sortedMembers.map((member) {
                final isOtherAdmin = member.role == 'admin';

                return Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                  child: Row(
                    children: [
                      KovariAvatar(imageUrl: member.avatar, size: 42),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              member.name,
                              style: AppTextStyles.bodyMedium.copyWith(
                                fontSize: 14,
                                fontWeight: FontWeight.w500,
                                color: AppColors.text(context),
                              ),
                            ),
                            // const SizedBox(height: 1),
                            Text(
                              '@${member.username}',
                              style: AppTextStyles.bodySmall.copyWith(
                                fontSize: 13,
                                color: AppColors.text(context, isMuted: true),
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (member.role == 'admin')
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 10,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: AppColors.primary.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(
                              100,
                            ), // Pill shape
                          ),
                          child: Text(
                            'Admin',
                            style: AppTextStyles.bodySmall.copyWith(
                              color: AppColors.primary,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              letterSpacing: 0.2,
                            ),
                          ),
                        ),
                      if (isAdmin && !isOtherAdmin)
                        GestureDetector(
                          onTap: () => _confirmRemove(context, ref, member),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 5,
                              vertical: 4,
                            ),
                            child: Text(
                              'Remove',
                              style: AppTextStyles.bodySmall.copyWith(
                                color: AppColors.destructive,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                letterSpacing: 0.2,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                );
              }).toList();
            }(),
          );
        })(),
      ],
    );
  }

  void _confirmRemove(BuildContext context, WidgetRef ref, GroupMember member) {
    showKovariConfirmDialog(
      context: context,
      title: 'Remove Member?',
      content: 'Are you sure you want to remove ${member.name} from the group?',
      confirmLabel: 'Remove',
      isDestructive: true,
      onConfirm: () {
        ref
            .read(groupActionsProvider(group.id))
            .removeMember(member.id, member.clerkId ?? '');
      },
    );
  }
}

/// 📥 Manage Join Requests
class JoinRequestsSheet extends ConsumerStatefulWidget {
  const JoinRequestsSheet({super.key, required this.group});
  final GroupModel group;

  @override
  ConsumerState<JoinRequestsSheet> createState() => _JoinRequestsSheetState();
}

class _JoinRequestsSheetState extends ConsumerState<JoinRequestsSheet> {
  final Set<String> _processingIds = {};

  Future<void> _handleAction(
    String userId,
    String? requestId,
    bool approve,
  ) async {
    if (_processingIds.contains(userId)) return;

    setState(() => _processingIds.add(userId));
    try {
      if (approve) {
        await ref
            .read(groupActionsProvider(widget.group.id))
            .approveRequest(userId);
        if (mounted) {
          KovariSnackbar.success(context, 'Member approved!');
        }
      } else if (requestId != null) {
        await ref
            .read(groupActionsProvider(widget.group.id))
            .rejectRequest(requestId);
        if (mounted) {
          KovariSnackbar.info(context, 'Request rejected.');
        }
      }
    } catch (e) {
      if (mounted) {
        KovariSnackbar.error(context, 'Action failed: $e');
      }
    } finally {
      if (mounted) setState(() => _processingIds.remove(userId));
    }
  }

  @override
  Widget build(BuildContext context) {
    final requestsAsync = ref.watch(joinRequestsProvider(widget.group.id));

    return SettingsBottomSheet(
      title: 'Join Requests',
      children: [
        requestsAsync.when(
          data: (requests) {
            if (requests.isEmpty) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(vertical: 50),
                  child: Text(
                    'No pending requests.',
                    style: AppTextStyles.bodyMedium.copyWith(
                      color: AppColors.text(context, isMuted: true),
                    ),
                  ),
                ),
              );
            }
            return KovariGroupContainer(
              backgroundColor: AppColors.surface(context, level: 1),
              children: requests.map((request) {
                final isProcessing = _processingIds.contains(request.userId);

                return Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                  child: Row(
                    children: [
                      KovariAvatar(imageUrl: request.avatar, size: 40),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              request.name,
                              style: AppTextStyles.bodyMedium.copyWith(
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            Text(
                              '@${request.username}',
                              style: AppTextStyles.bodySmall.copyWith(
                                fontSize: 12,
                                color: AppColors.text(context, isMuted: true),
                              ),
                            ),
                          ],
                        ),
                      ),
                      Opacity(
                        opacity: isProcessing ? 0.6 : 1.0,
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            GestureDetector(
                              onTap: isProcessing
                                  ? null
                                  : () => _handleAction(
                                      request.userId,
                                      null,
                                      true,
                                    ),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 7,
                                ),
                                decoration: BoxDecoration(
                                  color: AppColors.primary,
                                  borderRadius: BorderRadius.circular(100),
                                ),
                                child: Text(
                                  'Accept',
                                  style: AppTextStyles.bodySmall.copyWith(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w600,
                                    fontSize: 11,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 6),
                            GestureDetector(
                              onTap: isProcessing
                                  ? null
                                  : () => _handleAction(
                                      request.userId,
                                      request.id,
                                      false,
                                    ),
                              child: Container(
                                padding: const EdgeInsets.all(7),
                                decoration: BoxDecoration(
                                  color: Colors.transparent,
                                  borderRadius: BorderRadius.circular(100),
                                  border: Border.all(
                                    color: AppColors.mutedForeground.withValues(
                                      alpha: 0.3,
                                    ),
                                  ),
                                ),
                                child: Icon(
                                  LucideIcons.x,
                                  color: AppColors.text(context, isMuted: true),
                                  size: 15,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                );
              }).toList(),
            );
          },
          loading: () => const Center(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 50),
              child: SizedBox(
                height: 20,
                width: 20,
                child: CircularProgressIndicator(strokeWidth: 3),
              ),
            ),
          ),
          error: (e, _) => Center(child: Text('Error: $e')),
        ),
      ],
    );
  }
}

/// ✉️ Invite Members (Email/Username/Link)
class InviteMembersSheet extends ConsumerStatefulWidget {
  const InviteMembersSheet({super.key, required this.group});
  final GroupModel group;

  @override
  ConsumerState<InviteMembersSheet> createState() => _InviteMembersSheetState();
}

class _InviteMembersSheetState extends ConsumerState<InviteMembersSheet> {
  final TextEditingController _inviteController = TextEditingController();
  final TextEditingController _linkController = TextEditingController();
  String _inviteLink = '';
  bool _isSending = false;

  @override
  void initState() {
    super.initState();
    _fetchLink();
  }

  Future<void> _fetchLink() async {
    final link = await ref
        .read(groupActionsProvider(widget.group.id))
        .getInviteLink();
    if (mounted) {
      setState(() {
        _inviteLink = link;
        _linkController.text = link.isNotEmpty ? link : 'Generate Link';
      });
    }
  }

  bool _isValidEmail(String input) =>
      RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(input.trim());

  bool _isValidUsername(String input) =>
      RegExp(r'^[a-zA-Z0-9_]{3,20}$').hasMatch(input.trim());

  bool get _canInvite {
    final trimmed = _inviteController.text.trim();
    return trimmed.isNotEmpty &&
        (_isValidEmail(trimmed) || _isValidUsername(trimmed));
  }

  Future<void> _handleInvite() async {
    if (!_canInvite) {
      return;
    }
    setState(() => _isSending = true);
    try {
      await ref
          .read(groupActionsProvider(widget.group.id))
          .inviteMember(_inviteController.text.trim());
      if (mounted) {
        KovariSnackbar.success(context, 'Invitation sent!');
        _inviteController.clear();
      }
    } catch (e) {
      if (mounted) {
        KovariSnackbar.error(context, 'Error: $e');
      }
    } finally {
      if (mounted) setState(() => _isSending = false);
    }
  }

  Future<void> _copyLink() async {
    if (_inviteLink.isEmpty) {
      return;
    }

    try {
      // 1. Copy to clipboard
      await Clipboard.setData(ClipboardData(text: _inviteLink));

      if (!mounted) {
        return;
      }

      // 2. Tactile feedback
      unawaited(Feedback.forTap(context));

      // 3. Native Share (Raw URL only for maximum directness)
      // ignore: deprecated_member_use
      await Share.share(_inviteLink, subject: 'Trip Invitation');

      if (mounted) {
        KovariSnackbar.success(context, 'Link copied & sharing opened!');
      }
    } catch (e) {
      if (mounted) {
        KovariSnackbar.error(context, 'Error sharing link: $e');
      }
    }
  }

  @override
  Widget build(BuildContext context) => SettingsBottomSheet(
      title: 'Invite Member',
      isSubmitting: _isSending,
      onSave: _canInvite ? _handleInvite : null,
      buttonLabel: 'Send Invitation',
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 20),
          child: Text(
            'Invite people to plan and coordinate your trip together.',
            style: AppTextStyles.bodySmall.copyWith(
              color: AppColors.text(context, isMuted: true),
              fontSize: 13,
            ),
          ),
        ),
        TextInputField(
          label: 'Email or Username',
          controller: _inviteController,
          hintText: 'Enter email or username',
          onChanged: (val) => setState(() {}),
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 14,
            vertical: 12,
          ),
          fillColor: AppColors.surface(context, level: 1),
        ),
        const SizedBox(height: 20),
        TextInputField(
          label: 'Share a link',
          controller: _linkController,
          readOnly: true,
          onTap: _copyLink,
          hintText: 'Generating Link...',
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 14,
            vertical: 12,
          ),
          fillColor: AppColors.surface(context, level: 1),
          suffixIcon: IconButton(
            onPressed: _copyLink,
            icon: const Icon(
              LucideIcons.copy,
              size: 18,
              color: AppColors.primary,
            ),
          ),
        ),
        const SizedBox(height: 8),
      ],
    );
}
