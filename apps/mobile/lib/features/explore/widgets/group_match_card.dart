import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/core/widgets/common/user_avatar_fallback.dart';
import 'package:mobile/features/explore/providers/explore_provider.dart';
import 'package:mobile/features/groups/models/group.dart';
import 'package:mobile/shared/widgets/app_card.dart';
import 'package:mobile/shared/widgets/primary_button.dart';
import 'package:mobile/shared/widgets/secondary_button.dart';

class GroupMatchCard extends ConsumerStatefulWidget {
  const GroupMatchCard({super.key, required this.group});
  final GroupModel group;

  @override
  ConsumerState<GroupMatchCard> createState() => _GroupMatchCardState();
}

class _GroupMatchCardState extends ConsumerState<GroupMatchCard> {
  String _activeTab = 'left';

  bool _isPreferNotToSay(String? val) {
    if (val == null) return false;
    final clean = val.toLowerCase().replaceAll('_', ' ');
    return clean == 'prefer not to say';
  }

  String _formatDateRange() {
    final startStr = widget.group.dateRange.start;
    final endStr = widget.group.dateRange.end;
    if (startStr == null && endStr == null) return 'Dates TBD';
    final startDate = startStr != null ? DateTime.tryParse(startStr) : null;
    final endDate = endStr != null ? DateTime.tryParse(endStr) : null;
    if (startDate != null && endDate != null) {
      return "${DateFormat('MMM d').format(startDate)} - ${DateFormat('MMM d, yyyy').format(endDate)}";
    }
    return 'Dates TBD';
  }

  String? _formatSmokingPolicy(String? p) {
    if (p == null || _isPreferNotToSay(p)) return null;
    final s = p.toLowerCase();
    if (s.contains('non-smokers') ||
        s.contains('non-smoking') ||
        s.contains('no')) {
      return "No smoking";
    }
    return "Smoking allowed";
  }

  String? _formatDrinkingPolicy(String? p) {
    if (p == null || _isPreferNotToSay(p)) return null;
    final s = p.toLowerCase();
    if (s.contains('non-drinkers') ||
        s.contains('non-drinking') ||
        s.contains('no')) {
      return "No alcohol";
    }
    return "Alcohol allowed";
  }

  @override
  Widget build(BuildContext context) {
    final group = widget.group;
    final name = group.name;
    final description = group.description;
    final coverImage = group.coverImage;
    final memberCount = group.memberCount;
    final creator = group.creator;

    final creatorLocationDisplay =
        creator.location != null && creator.location!.isNotEmpty
        ? creator.location!.split(',')[0].trim()
        : 'Unknown';

    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      borderRadius: BorderRadius.circular(24),
      border: const Border(),
      boxShadow: const [],
      child: GestureDetector(
        onHorizontalDragEnd: (details) {
          if (details.primaryVelocity == null) return;
          if (details.primaryVelocity! < 0) {
            if (_activeTab == 'left') {
              setState(() => _activeTab = 'right');
            }
          } else if (details.primaryVelocity! > 0) {
            if (_activeTab == 'right') {
              setState(() => _activeTab = 'left');
            }
          }
        },
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Story Indicators
            Row(
              children: [
                Expanded(
                  child: GestureDetector(
                    onTap: () => setState(() => _activeTab = 'left'),
                    child: Container(
                      height: 4,
                      decoration: BoxDecoration(
                        color: _activeTab == 'left'
                            ? AppColors.mutedColor(context)
                            : AppColors.secondaryColor(context),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: GestureDetector(
                    onTap: () => setState(() => _activeTab = 'right'),
                    child: Container(
                      height: 4,
                      decoration: BoxDecoration(
                        color: _activeTab == 'right'
                            ? AppColors.mutedColor(context)
                            : AppColors.secondaryColor(context),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Header: tab-dependent title
            if (_activeTab == 'left') ...[
              Text(
                name,
                style: AppTextStyles.h3.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.text(context),
                ),
              ),
              Text(
                description != null && description.isNotEmpty
                    ? description
                    : 'No description provided.',
                style: AppTextStyles.bodyMedium.copyWith(
                  color: AppColors.text(context, isMuted: true),
                  fontStyle: description != null && description.isNotEmpty
                      ? FontStyle.normal
                      : FontStyle.italic,
                ),
              ),
            ] else ...[
              Text(
                'Created by ${creator.name}',
                style: AppTextStyles.h3.copyWith(
                  fontWeight: FontWeight.w800,
                  color: AppColors.text(context),
                ),
              ),
              Text(
                creator.age != null
                    ? '${creator.age}, $creatorLocationDisplay'
                    : creatorLocationDisplay,
                style: AppTextStyles.bodyMedium.copyWith(
                  fontWeight: FontWeight.w500,
                  color: AppColors.text(context, isMuted: true),
                ),
              ),
            ],
            const SizedBox(height: 12),

            // Active Tab Content
            Expanded(
              child: SingleChildScrollView(
                physics: const BouncingScrollPhysics(),
                child: _activeTab == 'left'
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Cover Image (Centered & Aspect Ratio 4:3)
                          Center(
                            child: Container(
                              width: double.infinity,
                              constraints: const BoxConstraints(maxHeight: 280),
                              decoration: BoxDecoration(
                                color: AppColors.surface(context, level: 2),
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(
                                  color: AppColors.borderColor(context),
                                ),
                              ),
                              clipBehavior: Clip.antiAlias,
                              child: AspectRatio(
                                aspectRatio: 4 / 3,
                                child:
                                    coverImage != null && coverImage.isNotEmpty
                                    ? CachedNetworkImage(
                                        imageUrl: coverImage,
                                        fit: BoxFit.cover,
                                        placeholder: (context, url) =>
                                            const UserAvatarFallback(
                                              shape: BoxShape.rectangle,
                                              borderRadius: BorderRadius.all(
                                                Radius.circular(16),
                                              ),
                                              size: 100,
                                            ),
                                        errorWidget:
                                            (context, url, dynamic error) =>
                                                const UserAvatarFallback(
                                                  shape: BoxShape.rectangle,
                                                  borderRadius:
                                                      BorderRadius.all(
                                                        Radius.circular(16),
                                                      ),
                                                  size: 100,
                                                ),
                                      )
                                    : UserAvatarFallback(
                                        shape: BoxShape.rectangle,
                                        borderRadius: BorderRadius.circular(16),
                                        size: 100,
                                      ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),
                          if (group.score != null) ...[
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.baseline,
                              textBaseline: TextBaseline.alphabetic,
                              children: [
                                Text(
                                  '${(group.score! <= 1 ? group.score! * 100 : group.score!).round()}%',
                                  style: AppTextStyles.h2.copyWith(
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.text(context),
                                  ),
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  'similar',
                                  style: AppTextStyles.bodyMedium.copyWith(
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.text(context),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                          ],

                          _buildGroupedSection(
                            title: 'Trip Details',
                            content: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  "${group.destination.split(',')[0].trim()}${group.budget != null ? ' • ₹${NumberFormat.decimalPattern('en_IN').format(group.budget)}' : ''}",
                                  style: AppTextStyles.bodyMedium.copyWith(
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.text(context),
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  _formatDateRange(),
                                  style: AppTextStyles.bodyMedium.copyWith(
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.text(context),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),

                          // Group Members
                          _buildGroupedSection(
                            title: 'Group Members',
                            content: Wrap(
                              spacing: 8,
                              runSpacing: 4,
                              children: [
                                Text(
                                  'Created by ${creator.name}',
                                  style: AppTextStyles.bodyMedium.copyWith(
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.text(context),
                                  ),
                                ),
                                Text(
                                  '•',
                                  style: AppTextStyles.bodyMedium.copyWith(
                                    color: AppColors.text(
                                      context,
                                      isMuted: true,
                                    ),
                                  ),
                                ),
                                Text(
                                  '$memberCount members',
                                  style: AppTextStyles.bodyMedium.copyWith(
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.text(context),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),

                          // Group Interests
                          if (group.tags != null && group.tags!.isNotEmpty) ...[
                            _buildGroupedSection(
                              title: 'Group Interests',
                              content: Wrap(
                                spacing: 8,
                                runSpacing: 4,
                                children: [
                                  for (
                                    var i = 0;
                                    i < group.tags!.length;
                                    i++
                                  ) ...[
                                    if (i > 0)
                                      Text(
                                        '•',
                                        style: AppTextStyles.bodyMedium
                                            .copyWith(
                                              color: AppColors.text(
                                                context,
                                                isMuted: true,
                                              ),
                                            ),
                                      ),
                                    Text(
                                      group.tags![i][0].toUpperCase() +
                                          group.tags![i].substring(1),
                                      style: AppTextStyles.bodyMedium.copyWith(
                                        fontWeight: FontWeight.bold,
                                        color: AppColors.text(context),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                            const SizedBox(height: 12),
                          ],

                          // Languages
                          if (group.languages != null &&
                              group.languages!.isNotEmpty) ...[
                            _buildGroupedSection(
                              title: 'Languages',
                              content: Wrap(
                                spacing: 8,
                                runSpacing: 4,
                                children: [
                                  for (
                                    var i = 0;
                                    i < group.languages!.length;
                                    i++
                                  ) ...[
                                    if (i > 0)
                                      Text(
                                        '•',
                                        style: AppTextStyles.bodyMedium
                                            .copyWith(
                                              color: AppColors.text(
                                                context,
                                                isMuted: true,
                                              ),
                                            ),
                                      ),
                                    Text(
                                      group.languages![i],
                                      style: AppTextStyles.bodyMedium.copyWith(
                                        fontWeight: FontWeight.bold,
                                        color: AppColors.text(context),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                            const SizedBox(height: 12),
                          ],

                          // Lifestyle
                          if ((group.smokingPolicy != null &&
                                  !_isPreferNotToSay(group.smokingPolicy)) ||
                              (group.drinkingPolicy != null &&
                                  !_isPreferNotToSay(
                                    group.drinkingPolicy,
                                  ))) ...[
                            _buildGroupedSection(
                              title: 'Lifestyle',
                              content: (() {
                                final smokingVal = _formatSmokingPolicy(
                                  group.smokingPolicy,
                                );
                                final drinkingVal = _formatDrinkingPolicy(
                                  group.drinkingPolicy,
                                );

                                final items = [
                                  if (smokingVal != null)
                                    "Smoking: $smokingVal",
                                  if (drinkingVal != null)
                                    "Drinking: $drinkingVal",
                                ];

                                return Wrap(
                                  spacing: 8,
                                  runSpacing: 4,
                                  children: [
                                    for (var i = 0; i < items.length; i++) ...[
                                      if (i > 0)
                                        Text(
                                          '•',
                                          style: AppTextStyles.bodyMedium
                                              .copyWith(
                                                color: AppColors.text(
                                                  context,
                                                  isMuted: true,
                                                ),
                                              ),
                                        ),
                                      Text(
                                        items[i],
                                        style: AppTextStyles.bodyMedium
                                            .copyWith(
                                              fontWeight: FontWeight.bold,
                                              color: AppColors.text(context),
                                            ),
                                      ),
                                    ],
                                  ],
                                );
                              })(),
                            ),
                          ],
                        ],
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Creator Avatar Image (Centered & Aspect Ratio 4:3)
                          Center(
                            child: Container(
                              width: double.infinity,
                              constraints: const BoxConstraints(maxHeight: 280),
                              decoration: BoxDecoration(
                                color: AppColors.surface(context, level: 2),
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(
                                  color: AppColors.borderColor(context),
                                ),
                              ),
                              clipBehavior: Clip.antiAlias,
                              child: AspectRatio(
                                aspectRatio: 4 / 3,
                                child:
                                    creator.avatar != null &&
                                        creator.avatar!.isNotEmpty
                                    ? CachedNetworkImage(
                                        imageUrl: creator.avatar!,
                                        fit: BoxFit.cover,
                                        placeholder: (context, url) =>
                                            const UserAvatarFallback(
                                              shape: BoxShape.rectangle,
                                              borderRadius: BorderRadius.all(
                                                Radius.circular(16),
                                              ),
                                              size: 100,
                                            ),
                                        errorWidget:
                                            (context, url, dynamic error) =>
                                                const UserAvatarFallback(
                                                  shape: BoxShape.rectangle,
                                                  borderRadius:
                                                      BorderRadius.all(
                                                        Radius.circular(16),
                                                      ),
                                                  size: 100,
                                                ),
                                      )
                                    : UserAvatarFallback(
                                        shape: BoxShape.rectangle,
                                        borderRadius: BorderRadius.circular(16),
                                        size: 100,
                                      ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),

                          // Creator About Me Section
                          _buildGroupedSection(
                            title: 'About Creator',
                            content: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if (creator.gender != null &&
                                    !_isPreferNotToSay(creator.gender)) ...[
                                  Text(
                                    creator.gender![0].toUpperCase() +
                                        creator.gender!.substring(1),
                                    style: AppTextStyles.bodyMedium.copyWith(
                                      fontWeight: FontWeight.bold,
                                      color: AppColors.text(context),
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                ],
                                (() {
                                  final items =
                                      [
                                            if (creator.profession != null &&
                                                !_isPreferNotToSay(
                                                  creator.profession,
                                                ))
                                              creator.profession!
                                                  .replaceAll('_', ' ')
                                                  .trim(),
                                            if (creator.religion != null &&
                                                !_isPreferNotToSay(
                                                  creator.religion,
                                                ))
                                              creator.religion!.trim(),
                                            if (creator.personality != null &&
                                                !_isPreferNotToSay(
                                                  creator.personality,
                                                ))
                                              creator.personality!.trim(),
                                          ]
                                          .map(
                                            (item) =>
                                                item[0].toUpperCase() +
                                                item.substring(1),
                                          )
                                          .toList();

                                  if (items.isEmpty)
                                    return const SizedBox.shrink();

                                  return Wrap(
                                    spacing: 8,
                                    runSpacing: 4,
                                    children: [
                                      for (
                                        var i = 0;
                                        i < items.length;
                                        i++
                                      ) ...[
                                        if (i > 0)
                                          Text(
                                            '•',
                                            style: AppTextStyles.bodyMedium
                                                .copyWith(
                                                  color: AppColors.text(
                                                    context,
                                                    isMuted: true,
                                                  ),
                                                ),
                                          ),
                                        Text(
                                          items[i],
                                          style: AppTextStyles.bodyMedium
                                              .copyWith(
                                                fontWeight: FontWeight.bold,
                                                color: AppColors.text(context),
                                              ),
                                        ),
                                      ],
                                    ],
                                  );
                                })(),
                                if (creator.languages.isNotEmpty) ...[
                                  const SizedBox(height: 4),
                                  Text(
                                    creator.languages.join(', '),
                                    style: AppTextStyles.bodyMedium.copyWith(
                                      fontWeight: FontWeight.bold,
                                      color: AppColors.text(context),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),

                          // Creator Interests Section
                          if (creator.interests.isNotEmpty) ...[
                            _buildGroupedSection(
                              title: 'Creator Interests',
                              content: Wrap(
                                spacing: 8,
                                runSpacing: 4,
                                children: [
                                  for (
                                    var i = 0;
                                    i < creator.interests.length;
                                    i++
                                  ) ...[
                                    if (i > 0)
                                      Text(
                                        '•',
                                        style: AppTextStyles.bodyMedium
                                            .copyWith(
                                              color: AppColors.text(
                                                context,
                                                isMuted: true,
                                              ),
                                            ),
                                      ),
                                    Text(
                                      creator.interests[i][0].toUpperCase() +
                                          creator.interests[i].substring(1),
                                      style: AppTextStyles.bodyMedium.copyWith(
                                        fontWeight: FontWeight.bold,
                                        color: AppColors.text(context),
                                      ),
                                    ),
                                  ],
                                ],
                              ),
                            ),
                            const SizedBox(height: 12),
                          ],

                          // Creator Lifestyle Section
                          if ((creator.foodPreference != null &&
                                  !_isPreferNotToSay(creator.foodPreference)) ||
                              (creator.smoking != null &&
                                  !_isPreferNotToSay(creator.smoking)) ||
                              (creator.drinking != null &&
                                  !_isPreferNotToSay(creator.drinking))) ...[
                            _buildGroupedSection(
                              title: 'Creator Lifestyle',
                              content: (() {
                                final foodText =
                                    creator.foodPreference != null &&
                                        !_isPreferNotToSay(
                                          creator.foodPreference,
                                        )
                                    ? creator.foodPreference!.replaceAll(
                                        '_',
                                        ' ',
                                      )
                                    : null;
                                final smokingText =
                                    creator.smoking != null &&
                                        !_isPreferNotToSay(creator.smoking)
                                    ? "Smoking: ${creator.smoking}"
                                    : null;
                                final drinkingText =
                                    creator.drinking != null &&
                                        !_isPreferNotToSay(creator.drinking)
                                    ? "Drinking: ${creator.drinking}"
                                    : null;

                                final items =
                                    [foodText, smokingText, drinkingText]
                                        .whereType<String>()
                                        .map(
                                          (s) =>
                                              s[0].toUpperCase() +
                                              s.substring(1),
                                        )
                                        .toList();

                                return Wrap(
                                  spacing: 8,
                                  runSpacing: 4,
                                  children: [
                                    for (var i = 0; i < items.length; i++) ...[
                                      if (i > 0)
                                        Text(
                                          '•',
                                          style: AppTextStyles.bodyMedium
                                              .copyWith(
                                                color: AppColors.text(
                                                  context,
                                                  isMuted: true,
                                                ),
                                              ),
                                        ),
                                      Text(
                                        items[i],
                                        style: AppTextStyles.bodyMedium
                                            .copyWith(
                                              fontWeight: FontWeight.bold,
                                              color: AppColors.text(context),
                                            ),
                                      ),
                                    ],
                                  ],
                                );
                              })(),
                            ),
                          ],
                        ],
                      ),
              ),
            ),

            // Actions Row
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: PrimaryButton(
                    text: 'Interested',
                    height: 48,
                    borderRadius: 16,
                    onPressed: () => ref
                        .read(exploreProvider.notifier)
                        .handleInterested(group.id),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: SecondaryButton(
                    text: 'Skip',
                    height: 48,
                    borderRadius: 16,
                    onPressed: () =>
                        ref.read(exploreProvider.notifier).handlePass(group.id),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGroupedSection({
    required String title,
    required Widget content,
  }) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.mutedColor(context),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title.toUpperCase(),
            style: AppTextStyles.bodySmall.copyWith(
              fontWeight: FontWeight.bold,
              color: AppColors.text(context, isMuted: true),
              letterSpacing: 1.2,
            ),
          ),
          const SizedBox(height: 6),
          content,
        ],
      ),
    );
  }
}
