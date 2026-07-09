import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/navigation/routes.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_spacing.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/core/providers/profile_provider.dart';
import 'package:mobile/shared/widgets/primary_button.dart';

class SuccessStep extends ConsumerWidget {
  const SuccessStep({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.lg,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: AppSpacing.sm),
            // Checkmark circle — matches web step 9 CheckIcon badge
            Container(
              width: 48,
              height: 48,
              decoration: const BoxDecoration(
                color: AppColors.primary,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                LucideIcons.check,
                size: 24,
                color: AppColors.primaryForeground,
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              'Welcome aboard! 🎉',
              style: AppTextStyles.h3.copyWith(fontWeight: FontWeight.w600),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              "Your profile has been successfully created. You're all set to get started!",
              style: AppTextStyles.bodyMedium.copyWith(
                color: AppColors.mutedForeground,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: AppSpacing.lg),
            PrimaryButton(
              text: 'Get Started',
              onPressed: () {
                final currentProfile = ref.read(profileProvider);
                if (currentProfile != null) {
                  ref.read(profileProvider.notifier).setProfile(
                        currentProfile.copyWith(onboardingCompleted: true),
                      );
                }
                const HomeRouteData().go(context);
              },
            ),
          ],
        ),
      );
}
