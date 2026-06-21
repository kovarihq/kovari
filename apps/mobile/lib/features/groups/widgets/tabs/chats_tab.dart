import 'package:flutter/material.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/features/chat/screens/chat_screen.dart';
import 'package:mobile/features/groups/models/group.dart';

class ChatsTab extends StatelessWidget {
  const ChatsTab({super.key, required this.group});
  final GroupModel group;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 16),
      child: Card(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
          side: BorderSide(color: AppColors.borderColor(context)),
        ),
        color: AppColors.surface(context, level: 1),
        clipBehavior: Clip.antiAlias,
        child: ChatScreen(chatId: group.id, hideHeader: true),
      ),
    );
  }
}
