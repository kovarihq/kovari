import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/core/widgets/common/user_avatar_fallback.dart';
import 'package:mobile/features/explore/models/match_user.dart';
import 'package:mobile/features/explore/providers/explore_provider.dart';
import 'package:mobile/shared/widgets/app_card.dart';
import 'package:mobile/shared/widgets/primary_button.dart';
import 'package:mobile/shared/widgets/secondary_button.dart';

class SoloMatchCard extends ConsumerStatefulWidget {
  const SoloMatchCard({super.key, required this.match});
  final MatchUser match;

  @override
  ConsumerState<SoloMatchCard> createState() => _SoloMatchCardState();
}

class _SoloMatchCardState extends ConsumerState<SoloMatchCard> {
  String _activeTab = 'left';

  bool _isPreferNotToSay(String? val) {
    if (val == null) return false;
    final clean = val.toLowerCase().replaceAll('_', ' ');
    return clean == 'prefer not to say';
  }

  String _formatDateRange() {
    if (widget.match.startDate == null || widget.match.endDate == null)
      return '';
    final start = DateFormat('MMM d').format(widget.match.startDate!);
    final end = DateFormat('MMM d, yyyy').format(widget.match.endDate!);
    return "$start - $end";
  }

  @override
  Widget build(BuildContext context) {
    final match = widget.match;
    final name = match.name;
    final age = match.age;
    final bio = match.bio;

    final hasTripDetails =
        match.destination.isNotEmpty &&
        match.destination != 'Global' &&
        match.destination != 'Any';

    final locationDisplay = match.location.isNotEmpty
        ? match.location.split(',')[0].trim()
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
                            ? AppColors.activeIndicatorColor(context)
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
                            ? AppColors.activeIndicatorColor(context)
                            : AppColors.secondaryColor(context),
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Name, Age, Location Header
            Text(
              name,
              style: AppTextStyles.h3.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.text(context),
              ),
            ),
            Text(
              age != null ? '$age, $locationDisplay' : locationDisplay,
              style: AppTextStyles.bodyMedium.copyWith(
                fontWeight: FontWeight.w500,
                color: AppColors.text(context, isMuted: true),
              ),
            ),
            const SizedBox(height: 10),

            // Active Tab Content
            Expanded(
              child: SingleChildScrollView(
                physics: const BouncingScrollPhysics(),
                child: _activeTab == 'left'
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Avatar (Centered & Aspect Ratio 1:1)
                          Center(
                            child: Container(
                              width: double.infinity,
                              constraints: const BoxConstraints(maxHeight: 350),
                              decoration: BoxDecoration(
                                color: AppColors.surface(context, level: 2),
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(
                                  color: AppColors.borderColor(context),
                                ),
                              ),
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(15),
                                child: AspectRatio(
                                  aspectRatio: 1 / 1,
                                  child: match.image.isNotEmpty
                                      ? CachedNetworkImage(
                                          imageUrl: match.image,
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
                                              (
                                                context,
                                                url,
                                                dynamic error,
                                              ) => UserAvatarFallback(
                                                name: match.name,
                                                backgroundColor: AppColors
                                                    .primary
                                                    .withValues(alpha: 0.1),
                                                iconColor: AppColors.primary,
                                                shape: BoxShape.rectangle,
                                                borderRadius:
                                                    BorderRadius.circular(16),
                                                fontSize: 64,
                                              ),
                                        )
                                      : UserAvatarFallback(
                                          shape: BoxShape.rectangle,
                                          borderRadius: BorderRadius.circular(
                                            16,
                                          ),
                                          size: 100,
                                        ),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),

                          // Match Percentage
                          if (match.score != null) ...[
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.baseline,
                              textBaseline: TextBaseline.alphabetic,
                              children: [
                                Text(
                                  '${(match.score! <= 1 ? match.score! * 100 : match.score!).round()}%',
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

                          // Interests (Wrapped Tags)
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: match.interests.take(4).map((interest) {
                              return Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 14,
                                  vertical: 6,
                                ),
                                decoration: BoxDecoration(
                                  color: AppColors.secondaryColor(context),
                                  border: Border.all(
                                    color: AppColors.borderColor(context),
                                  ),
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Text(
                                  interest.isNotEmpty
                                      ? interest[0].toUpperCase() +
                                            interest.substring(1)
                                      : interest,
                                  style: AppTextStyles.bodySmall.copyWith(
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.text(context),
                                  ),
                                ),
                              );
                            }).toList(),
                          ),
                        ],
                      )
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Wants to Visit (Travel Intentions)
                          if (match.travelIntentions.isNotEmpty) ...[
                            _buildGroupedSection(
                              title: 'Wants to visit',
                              content: Wrap(
                                spacing: 8,
                                runSpacing: 4,
                                children: [
                                  for (
                                    var i = 0;
                                    i < match.travelIntentions.length;
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
                                      match.travelIntentions[i]['destination']
                                              ?.toString() ??
                                          '',
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

                          // Trip Details
                          if (hasTripDetails) ...[
                            _buildGroupedSection(
                              title: 'Trip Details',
                              content: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    "${match.destination.split(',')[0].trim()} • ₹${NumberFormat.decimalPattern('en_IN').format(match.budget ?? 0)}",
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
                          ],

                          // About Me
                          _buildGroupedSection(
                            title: 'About Me',
                            content: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                if (match.gender != null &&
                                    !_isPreferNotToSay(match.gender)) ...[
                                  Text(
                                    match.gender![0].toUpperCase() +
                                        match.gender!.substring(1),
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
                                            if (match.profession != null &&
                                                !_isPreferNotToSay(
                                                  match.profession,
                                                ))
                                              match.profession!
                                                  .replaceAll('_', ' ')
                                                  .trim(),
                                            if (match.religion != null &&
                                                !_isPreferNotToSay(
                                                  match.religion,
                                                ))
                                              match.religion!.trim(),
                                            if (match.personality != null &&
                                                !_isPreferNotToSay(
                                                  match.personality,
                                                ))
                                              match.personality!.trim(),
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
                                if (match.languages.isNotEmpty) ...[
                                  const SizedBox(height: 4),
                                  Text(
                                    match.languages.join(', '),
                                    style: AppTextStyles.bodyMedium.copyWith(
                                      fontWeight: FontWeight.bold,
                                      color: AppColors.text(context),
                                    ),
                                  ),
                                ],
                                if (bio != null && bio.isNotEmpty) ...[
                                  const SizedBox(height: 6),
                                  Text(
                                    bio,
                                    style: AppTextStyles.bodyMedium.copyWith(
                                      color: AppColors.text(
                                        context,
                                        isMuted: true,
                                      ),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),

                          // My Interests
                          if (match.interests.isNotEmpty) ...[
                            _buildGroupedSection(
                              title: 'My Interests',
                              content: Wrap(
                                spacing: 8,
                                runSpacing: 4,
                                children: [
                                  for (
                                    var i = 0;
                                    i < match.interests.length;
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
                                      match.interests[i][0].toUpperCase() +
                                          match.interests[i].substring(1),
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
                          if ((match.foodPreference != null &&
                                  !_isPreferNotToSay(match.foodPreference)) ||
                              (match.smoking != null &&
                                  !_isPreferNotToSay(match.smoking)) ||
                              (match.drinking != null &&
                                  !_isPreferNotToSay(match.drinking))) ...[
                            _buildGroupedSection(
                              title: 'Lifestyle',
                              content: (() {
                                final foodText =
                                    match.foodPreference != null &&
                                        !_isPreferNotToSay(match.foodPreference)
                                    ? match.foodPreference!.replaceAll('_', ' ')
                                    : null;
                                final smokingText =
                                    match.smoking != null &&
                                        !_isPreferNotToSay(match.smoking)
                                    ? "Smoking: ${match.smoking}"
                                    : null;
                                final drinkingText =
                                    match.drinking != null &&
                                        !_isPreferNotToSay(match.drinking)
                                    ? "Drinking: ${match.drinking}"
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
                    text: 'Connect',
                    height: 48,
                    borderRadius: 16,
                    onPressed: () => ref
                        .read(exploreProvider.notifier)
                        .handleInterested(match.id),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: SecondaryButton(
                    text: 'Skip',
                    height: 48,
                    borderRadius: 16,
                    onPressed: () =>
                        ref.read(exploreProvider.notifier).handlePass(match.id),
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
        color: AppColors.secondaryColor(context),
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
