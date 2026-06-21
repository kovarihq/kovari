import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/navigation/routes.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/features/profile/models/safety_report.dart';
import 'package:mobile/features/profile/providers/safety_provider.dart';
import 'package:mobile/shared/utils/url_utils.dart';
import 'package:mobile/shared/widgets/kovari_avatar.dart';
import 'package:mobile/shared/widgets/text_input_field.dart';

class ReportTargetSearchScreen extends ConsumerStatefulWidget { // 'user' or 'group'

  const ReportTargetSearchScreen({super.key, required this.targetType});
  final String targetType;

  @override
  ConsumerState<ReportTargetSearchScreen> createState() =>
      _ReportTargetSearchScreenState();
}

class _ReportTargetSearchScreenState
    extends ConsumerState<ReportTargetSearchScreen> {
  final TextEditingController _searchController = TextEditingController();
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    // Initial search for defaults
    Future.microtask(() {
      ref.read(safetyProvider.notifier).searchTargets(widget.targetType, '');
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  void _onSearchChanged(String query) {
    if (_debounce?.isActive ?? false) _debounce!.cancel();
    _debounce = Timer(const Duration(milliseconds: 500), () {
      ref.read(safetyProvider.notifier).searchTargets(widget.targetType, query);
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(safetyProvider);

    return Scaffold(
      body: Column(
        children: [
          Container(
            color: Theme.of(context).colorScheme.surfaceContainer,
            child: SafeArea(bottom: false, child: _buildHeader(context)),
          ),
          _buildSearchBar(context),
          Expanded(child: _buildResultsList(context, state)),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context) => Container(
      padding: const EdgeInsets.only(left: 4, right: 16, top: 16, bottom: 16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainer,
        border: Border(
          bottom: BorderSide(color: Theme.of(context).colorScheme.outline),
        ),
      ),
      child: Row(
        children: [
          _buildBackButton(context),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              'Safety',
              style: AppTextStyles.h3.copyWith(color: AppColors.text(context)),
            ),
          ),
        ],
      ),
    );

  Widget _buildBackButton(BuildContext context) => GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () => context.pop(),
      child: Container(
        padding: const EdgeInsets.all(8),
        child: Icon(
          LucideIcons.arrowLeft,
          size: 20,
          color: AppColors.text(context),
        ),
      ),
    );

  Widget _buildSearchBar(BuildContext context) => Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 6),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Report a ${widget.targetType == 'user' ? 'User' : 'Group'}',
            style: AppTextStyles.h2.copyWith(
              fontSize: 15,
              fontWeight: FontWeight.w600,
              color: AppColors.text(context),
              letterSpacing: 0,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Select the ${widget.targetType == 'user' ? 'profile' : 'group'} you want to report',
            style: TextStyle(
              fontSize: 14,
              color: AppColors.text(context, isMuted: true),
            ),
          ),
          const SizedBox(height: 20),
          TextInputField(
            fillColor: AppColors.surface(context, level: 1),
            label: '',
            controller: _searchController,
            onChanged: _onSearchChanged,
            hintText:
                'Search ${widget.targetType == 'user' ? 'users' : 'groups'}...',
            prefixIcon: Icon(
              LucideIcons.search,
              size: 18,
              color: AppColors.text(context, isMuted: true),
            ),
            suffixIcon: _searchController.text.isNotEmpty
                ? IconButton(
                    icon: Icon(
                      LucideIcons.x,
                      size: 18,
                      color: AppColors.text(context, isMuted: true),
                    ),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    splashRadius: 16,
                    onPressed: () {
                      _searchController.clear();
                      ref
                          .read(safetyProvider.notifier)
                          .searchTargets(widget.targetType, '');
                      setState(() {});
                    },
                  )
                : const SizedBox(width: 40, height: 40),
          ),
        ],
      ),
    );

  Widget _buildResultsList(BuildContext context, SafetyState state) {
    if (state.isSearchLoading && state.searchResults.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.searchError != null && state.searchResults.isEmpty) {
      return Center(
        child: Text(
          state.searchError!,
          style: const TextStyle(color: AppColors.destructive),
        ),
      );
    }

    final results = state.searchResults;

    if (results.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              'No ${widget.targetType == 'user' ? 'users' : 'groups'} found',
              style: TextStyle(
                color: AppColors.text(context, isMuted: true),
                fontSize: 15,
                fontWeight: FontWeight.w400,
              ),
            ),
            const SizedBox(height: 60), // Space for bottom
          ],
        ),
      );
    }

    return ListView.builder(
      itemCount: results.length,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      itemBuilder: (context, index) {
        final target = results[index];

        return Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: InkWell(
            onTap: () => _onSelectTarget(target),
            child: Container(
              padding: const EdgeInsets.only(
                left: 16,
                right: 16,
                top: 12,
                bottom: 12,
              ),
              decoration: BoxDecoration(
                color: AppColors.surface(context, level: 1),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: AppColors.borderColor(context),
                ),
              ),
              child: Row(
                children: [
                  KovariAvatar(
                    imageUrl: UrlUtils.getFullImageUrl(target.imageUrl ?? ''),
                    size: 40,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          target.name,
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                            color: AppColors.text(context),
                          ),
                        ),
                        if (target.username != null)
                          Text(
                            '@${target.username}',
                            style: TextStyle(
                              fontSize: 13,
                              color: AppColors.text(context, isMuted: true),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  void _onSelectTarget(SafetyTarget target) {
    SubmitReportRouteData(
      targetType: widget.targetType,
      targetId: target.id,
      targetName: target.name,
    ).push<void>(context);
  }
}
