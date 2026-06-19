import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_spacing.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/features/onboarding/providers/onboarding_provider.dart';
import 'package:mobile/shared/widgets/primary_button.dart';
import 'package:mobile/shared/widgets/secondary_button.dart';
import 'package:mobile/shared/widgets/select_chip.dart';

class LanguagesInterestsStep extends ConsumerWidget {
  const LanguagesInterestsStep({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(onboardingProvider);

    final languageOptions = [
      'English',
      'Hindi',
      'Bengali',
      'Telugu',
      'Marathi',
      'Tamil',
      'Gujarati',
      'Urdu',
      'Kannada',
      'Malayalam',
      'Punjabi',
    ];

    final interestOptions = [
      // How they travel
      'Solo Backpacking',
      'Weekend Getaways',
      'Long-Term Travel',
      'Workations',
      'Road Trips',
      'Train Journeys',

      // Mountains & outdoors
      'Himalayan Treks',
      'Camping & Stargazing',
      'River Rafting',
      'Skiing & Snow',
      'Wildlife & Safaris',

      // Beaches & water
      'Beach Bumming',
      'Scuba & Snorkeling',
      'Island Hopping',

      // Food & local
      'Street Food Crawls',
      'Local Markets',
      'Chai & Conversations',

      // Culture & art
      'Heritage & History',
      'Art & Galleries',
      'Music & Festivals',
      'Spiritual Travel',

      // Photography & content
      'Photography',
      'Aesthetic Spots',

      // Nightlife
      'Nightlife & Clubs',
    ];

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
      child: Column(
        children: [
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Interests & Languages',
            style: AppTextStyles.h3.copyWith(fontWeight: FontWeight.w600),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 6),
          Text(
            'Select what you like and speak',
            style: AppTextStyles.bodyMedium.copyWith(
              color: AppColors.mutedForeground,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: AppSpacing.lg),

          // Languages Section
          Align(
            alignment: Alignment.centerLeft,
            child: Text('Languages', style: AppTextStyles.label),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: Wrap(
              spacing: 8,
              runSpacing: 10,
              children: languageOptions.map((lang) => SelectChip(
                  label: lang,
                  isSelected: state.languages.contains(lang),
                  fillColor: AppColors.surface(context, level: 1),
                  onTap: () => ref
                      .read(onboardingProvider.notifier)
                      .toggleLanguage(lang),
                )).toList(),
            ),
          ),
          const SizedBox(height: AppSpacing.md),

          // Interests Section mirroring web's SelectChip layout
          Align(
            alignment: Alignment.centerLeft,
            child: Text('Interests', style: AppTextStyles.label),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: Wrap(
              spacing: 8,
              runSpacing: 10,
              children: interestOptions.map((interest) => SelectChip(
                  label: interest,
                  isSelected: state.interests.contains(interest),
                  fillColor: AppColors.card,
                  onTap: () => ref
                      .read(onboardingProvider.notifier)
                      .toggleInterest(interest),
                )).toList(),
            ),
          ),

          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Expanded(
                child: SecondaryButton(
                  text: 'Back',
                  icon: LucideIcons.chevronLeft,
                  onPressed: () =>
                      ref.read(onboardingProvider.notifier).setStep(4),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: PrimaryButton(
                  text: 'Continue',
                  onPressed:
                      (state.languages.isNotEmpty && state.interests.isNotEmpty)
                      ? () => ref.read(onboardingProvider.notifier).setStep(6)
                      : null,
                  icon: LucideIcons.chevronRight,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
        ],
      ),
    );
  }
}
