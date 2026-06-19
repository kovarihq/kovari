import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_spacing.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/features/onboarding/providers/onboarding_provider.dart';
import 'package:mobile/shared/widgets/app_card.dart';
import 'package:mobile/shared/widgets/primary_button.dart';
import 'package:mobile/shared/widgets/secondary_button.dart';
import 'package:mobile/shared/widgets/select_field.dart';
import 'package:url_launcher/url_launcher.dart';

class PolicyStep extends ConsumerStatefulWidget {
  const PolicyStep({super.key});

  @override
  ConsumerState<PolicyStep> createState() => _PolicyStepState();
}

class _PolicyStepState extends ConsumerState<PolicyStep> {
  bool _showPreferences = false;

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(onboardingProvider);

    const religionOptions = [
      'Christianity',
      'Islam',
      'Hinduism',
      'Buddhism',
      'Judaism',
      'Sikhism',
      'Atheist',
      'Agnostic',
      'Other',
      'Prefer not to say',
    ];

    const smokingOptions = [
      'Yes',
      'No',
      'Occasionally',
      'Prefer not to say',
    ];

    const drinkingOptions = [
      'Yes',
      'No',
      'Socially',
      'Prefer not to say',
    ];

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Almost there',
            style: AppTextStyles.h3.copyWith(fontWeight: FontWeight.w600),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 6),
          Text(
            "A few optional preferences, then you're in.",
            style: AppTextStyles.bodyMedium.copyWith(
              color: AppColors.mutedForeground,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: AppSpacing.lg),

          // Collapsible optional preferences trigger
          TextButton(
            onPressed: () {
              setState(() {
                _showPreferences = !_showPreferences;
              });
            },
            style: TextButton.styleFrom(
              minimumSize: Size.zero,
              padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: Text(
              _showPreferences
                  ? 'Hide optional preferences'
                  : 'Add preferences — religion, smoking, drinking',
              style: AppTextStyles.bodySmall.copyWith(
                color: AppColors.mutedForeground,
                decoration: TextDecoration.underline,
              ),
            ),
          ),

          if (_showPreferences) ...[
            const SizedBox(height: AppSpacing.md),
            SelectField<String>(
              label: 'Religion (Optional)',
              value: state.religion,
              hintText: 'Select religion',
              options: religionOptions,
              itemLabelBuilder: (v) => v,
              onChanged: (v) => ref
                  .read(onboardingProvider.notifier)
                  .updateLifestyle(religion: v),
            ),
            const SizedBox(height: AppSpacing.md),
            Row(
              children: [
                Expanded(
                  child: SelectField<String>(
                    label: 'Smoking (Optional)',
                    value: state.smoking,
                    hintText: 'Select',
                    options: smokingOptions,
                    itemLabelBuilder: (v) => v,
                    onChanged: (v) => ref
                        .read(onboardingProvider.notifier)
                        .updateLifestyle(smoking: v),
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: SelectField<String>(
                    label: 'Drinking (Optional)',
                    value: state.drinking,
                    hintText: 'Select',
                    options: drinkingOptions,
                    itemLabelBuilder: (v) => v,
                    onChanged: (v) => ref
                        .read(onboardingProvider.notifier)
                        .updateLifestyle(drinking: v),
                  ),
                ),
              ],
            ),
          ],

          const SizedBox(height: AppSpacing.lg),
          const Divider(height: 1, color: AppColors.border),
          const SizedBox(height: AppSpacing.lg),

          AppCard(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Column(
              children: [
                _buildPolicyItem(
                  context: context,
                  title: 'Terms of Service',
                  onTap: () => launchUrl(
                    Uri.parse('https://kovari.in/terms'),
                    mode: LaunchMode.externalApplication,
                  ),
                ),
                const Divider(height: 24, color: AppColors.border),
                _buildPolicyItem(
                  context: context,
                  title: 'Privacy Policy',
                  onTap: () => launchUrl(
                    Uri.parse('https://kovari.in/privacy'),
                    mode: LaunchMode.externalApplication,
                  ),
                ),
                const Divider(height: 24, color: AppColors.border),
                _buildPolicyItem(
                  context: context,
                  title: 'Community Guidelines',
                  onTap: () => launchUrl(
                    Uri.parse('https://kovari.in/community-guidelines'),
                    mode: LaunchMode.externalApplication,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: AppSpacing.lg),

          Row(
            children: [
              Checkbox(
                value: state.policyAccepted,
                onChanged: (v) => ref
                    .read(onboardingProvider.notifier)
                    .setPolicyAccepted(v ?? false),
                activeColor: AppColors.primary,
                side: const BorderSide(color: AppColors.muted),
              ),
              Expanded(
                child: Text(
                  'I agree to all terms and policies mentioned above.',
                  style: AppTextStyles.bodySmall.copyWith(
                    color: AppColors.foreground,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Expanded(
                child: SecondaryButton(
                  text: 'Back',
                  icon: LucideIcons.chevronLeft,
                  onPressed: () =>
                      ref.read(onboardingProvider.notifier).setStep(7),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: PrimaryButton(
                  text: 'Complete',
                  isLoading: state.isSubmitting,
                  onPressed: state.policyAccepted
                      ? () async {
                          final success = await ref
                              .read(onboardingProvider.notifier)
                              .submit();
                          if (success && context.mounted) {
                            return;
                          } else if (state.errorMessage != null &&
                              context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(state.errorMessage!),
                                backgroundColor: AppColors.destructive,
                              ),
                            );
                          }
                        }
                      : null,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
        ],
      ),
    );
  }

  Widget _buildPolicyItem({
    required BuildContext context,
    required String title,
    required VoidCallback onTap,
  }) => InkWell(
    onTap: onTap,
    child: Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          title,
          style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w500),
        ),
        const Icon(
          LucideIcons.chevronRight,
          size: 16,
          color: AppColors.mutedForeground,
        ),
      ],
    ),
  );
}
