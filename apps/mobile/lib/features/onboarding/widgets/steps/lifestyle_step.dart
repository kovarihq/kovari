import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_spacing.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/features/onboarding/providers/onboarding_provider.dart';
import 'package:mobile/shared/widgets/primary_button.dart';
import 'package:mobile/shared/widgets/secondary_button.dart';
import 'package:mobile/shared/widgets/select_field.dart';

class LifestyleStep extends ConsumerWidget {
  const LifestyleStep({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(onboardingProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
      child: Column(
        children: [
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Lifestyle',
            style: AppTextStyles.h3.copyWith(fontWeight: FontWeight.w600),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 6),
          Text(
            'Personality and food preference',
            style: AppTextStyles.bodyMedium.copyWith(
              color: AppColors.mutedForeground,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: AppSpacing.lg),

          SelectField<String>(
            label: 'Personality',
            value: state.personality,
            hintText: 'Select personality',
            options: const [
              'Introvert',
              'Extrovert',
              'Ambivert',
              'Mixed / Not sure',
              'Prefer not to say',
            ],
            itemLabelBuilder: (v) => v,
            onChanged: (v) => ref
                .read(onboardingProvider.notifier)
                .updateLifestyle(personality: v),
          ),
          const SizedBox(height: AppSpacing.md),

          SelectField<String>(
            label: 'Food Preference',
            value: state.foodPreference,
            hintText: 'Select food preference',
            options: const [
              'Vegetarian',
              'Vegan',
              'Non-vegetarian',
              'Pescatarian',
              'Halal',
              'Kosher',
              'No preference',
            ],
            itemLabelBuilder: (v) => v,
            onChanged: (v) =>
                ref.read(onboardingProvider.notifier).updateLifestyle(food: v),
          ),

          const SizedBox(height: AppSpacing.lg),
          Row(
            children: [
              Expanded(
                child: SecondaryButton(
                  text: 'Back',
                  icon: LucideIcons.chevronLeft,
                  onPressed: () =>
                      ref.read(onboardingProvider.notifier).setStep(5),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: PrimaryButton(
                  text: 'Continue',
                  onPressed:
                      (state.personality != null &&
                          state.foodPreference != null &&
                          state.personality!.isNotEmpty &&
                          state.foodPreference!.isNotEmpty)
                      ? () => ref.read(onboardingProvider.notifier).setStep(7)
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
