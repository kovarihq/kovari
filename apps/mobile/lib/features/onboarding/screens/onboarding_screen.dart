import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/navigation/routes.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/core/providers/profile_provider.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_radius.dart';
import 'package:mobile/core/theme/app_spacing.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/features/onboarding/providers/onboarding_provider.dart';
import 'package:mobile/features/onboarding/widgets/steps/gender_birth_step.dart';
import 'package:mobile/features/onboarding/widgets/steps/identity_step.dart';
import 'package:mobile/features/onboarding/widgets/steps/languages_interests_step.dart';
import 'package:mobile/features/onboarding/widgets/steps/lifestyle_step.dart';
import 'package:mobile/features/onboarding/widgets/steps/location_job_step.dart';
import 'package:mobile/features/onboarding/widgets/steps/media_bio_step.dart';
import 'package:mobile/features/onboarding/widgets/steps/policy_step.dart';
import 'package:mobile/features/onboarding/widgets/steps/success_step.dart';
import 'package:mobile/features/onboarding/widgets/steps/travel_intentions_step.dart';

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final PageController _pageController = PageController();

  Future<void> _handleDevReset() async {
    await ref.read(authProvider.notifier).logout();

    if (mounted) {
      const LoginRouteData().go(context);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(onboardingProvider);
    const totalSteps = 8;
    final bool isComplete = state.currentStep > totalSteps;

    // Synchronize PageView with currentStep state (only for active steps)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!isComplete &&
          _pageController.hasClients &&
          _pageController.page?.round() != (state.currentStep - 1)) {
        _pageController.animateToPage(
          state.currentStep - 1,
          duration: const Duration(milliseconds: 400),
          curve: Curves.easeInOut,
        );
      }
    });

    // List of active onboarding steps
    const steps = <Widget>[
      IdentityStep(),
      MediaBioStep(),
      GenderBirthStep(),
      LocationJobStep(),
      LanguagesInterestsStep(),
      LifestyleStep(),
      TravelIntentionsStep(),
      PolicyStep(),
    ];

    final profile = ref.watch(profileProvider);
    final bool isInternalUser = profile?.isInternal ?? false;

    return Scaffold(
      backgroundColor: AppColors.surface(context),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            child: Container(
              margin: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: AppSpacing.xl,
              ),
              decoration: BoxDecoration(
                color: AppColors.surface(context, level: 1),
                borderRadius: AppRadius.extraLarge,
                border: Border.all(color: AppColors.borderColor(context)),
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Progress Indicator (Step X of Y) - Only shown during active steps
                  if (!isComplete)
                    Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.lg,
                        vertical: AppSpacing.lg,
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          GestureDetector(
                            onLongPress: () {
                              if (isInternalUser) {
                                showDialog<void>(
                                  context: context,
                                  builder: (context) => AlertDialog(
                                    title: const Text('Dev Reset'),
                                    content: const Text(
                                      'Clear session and return to Login? (Dev only)',
                                    ),
                                    actions: [
                                      TextButton(
                                        onPressed: () => context.pop(),
                                        child: const Text('Cancel'),
                                      ),
                                      TextButton(
                                        onPressed: () {
                                          context.pop();
                                          _handleDevReset();
                                        },
                                        child: const Text(
                                          'Reset',
                                          style: TextStyle(
                                            color: Colors.red,
                                            fontWeight: FontWeight.bold,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                );
                              }
                            },
                            child: Text(
                              'Step ${state.currentStep} of $totalSteps',
                              style: AppTextStyles.label.copyWith(
                                fontWeight: FontWeight.w500,
                                color: AppColors.text(context, isMuted: true),
                              ),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: List.generate(
                              totalSteps,
                              (index) => Expanded(
                                child: Container(
                                  height: 6,
                                  margin: EdgeInsets.only(
                                    right: index == totalSteps - 1 ? 0 : 4,
                                  ),
                                  decoration: BoxDecoration(
                                    color: (index + 1) <= state.currentStep
                                        ? AppColors.primary
                                        : AppColors.borderColor(context),
                                    borderRadius: BorderRadius.circular(3),
                                  ),
                                ),
                              ),
                            ).toList(),
                          ),
                        ],
                      ),
                    ),

                  // Dynamic Height Step Container
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 300),
                    child: KeyedSubtree(
                      key: ValueKey('step_${state.currentStep}'),
                      child: isComplete
                          ? const SuccessStep()
                          : steps[state.currentStep - 1],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }
}
