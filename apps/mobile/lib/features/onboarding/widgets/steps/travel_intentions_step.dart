import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/network/location_service.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_radius.dart';
import 'package:mobile/core/theme/app_spacing.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/features/onboarding/providers/onboarding_provider.dart';
import 'package:mobile/shared/widgets/location_autocomplete.dart';
import 'package:mobile/shared/widgets/primary_button.dart';
import 'package:mobile/shared/widgets/secondary_button.dart';

class TravelIntentionsStep extends ConsumerStatefulWidget {
  const TravelIntentionsStep({super.key});

  @override
  ConsumerState<TravelIntentionsStep> createState() => _TravelIntentionsStepState();
}

class _TravelIntentionsStepState extends ConsumerState<TravelIntentionsStep> {
  final TextEditingController _destinationController = TextEditingController();
  GeoapifyResult? _selectedDetails;
  String? _intentError;

  @override
  void dispose() {
    _destinationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(onboardingProvider);

    final suggestions = [
      'Goa',
      'Manali',
      'Rishikesh',
      'Spiti Valley',
      'Leh Ladakh',
      'Kerala',
      'Pondicherry',
      'Ooty',
    ];

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
      child: Column(
        children: [
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Where do you want to go?',
            style: AppTextStyles.h3.copyWith(fontWeight: FontWeight.w600),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 6),
          Text(
            "Add up to 3 destinations you're thinking about. We'll match you with travelers heading the same way.",
            style: AppTextStyles.bodyMedium.copyWith(
              color: AppColors.mutedForeground,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: AppSpacing.lg),

          // Chosen Destinations List
          if (state.travelIntents.isNotEmpty) ...[
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: List.generate(state.travelIntents.length, (index) {
                final intent = state.travelIntents[index];
                return Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.08),
                    border: Border.all(
                      color: AppColors.primary.withValues(alpha: 0.3),
                    ),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        intent['destination'] as String,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: AppColors.primary,
                        ),
                      ),
                      const SizedBox(width: 6),
                      GestureDetector(
                        onTap: () {
                          ref
                              .read(onboardingProvider.notifier)
                              .removeTravelIntent(index);
                        },
                        child: Icon(
                          LucideIcons.x,
                          size: 14,
                          color: AppColors.primary.withValues(alpha: 0.6),
                        ),
                      ),
                    ],
                  ),
                );
              }),
            ),
            const SizedBox(height: AppSpacing.md),
          ],

          // Destination input (only if less than 3)
          if (state.travelIntents.length < 3) ...[
            Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: LocationAutocomplete(
                    label: 'Destination',
                    controller: _destinationController,
                    hintText: 'Enter your destination',
                    onSelect: (result) {
                      _selectedDetails = result;
                    },
                  ),
                ),
                const SizedBox(width: 8),
                Padding(
                  padding: const EdgeInsets.only(bottom: 2),
                  child: SizedBox(
                    height: 40,
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(
                        shape: RoundedRectangleBorder(
                          borderRadius: AppRadius.large,
                        ),
                        side: BorderSide(
                          color: AppColors.borderColor(context),
                        ),
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                      ),
                      onPressed: () {
                        final val = _destinationController.text.trim();
                        if (val.isEmpty) return;

                        ref.read(onboardingProvider.notifier).addTravelIntent(
                              _selectedDetails?.city ?? _selectedDetails?.formatted.split(',')[0] ?? val,
                              details: _selectedDetails,
                            );

                        // Clear input and error
                        _destinationController.clear();
                        _selectedDetails = null;
                        setState(() => _intentError = null);
                      },
                      child: Text(
                        'Add',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: AppColors.text(context),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
          ],

          // Suggestions (only if list is empty)
          if (state.travelIntents.isEmpty) ...[
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Popular among travelers',
                style: AppTextStyles.bodySmall.copyWith(
                  color: AppColors.mutedForeground,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: suggestions.map((dest) => InkWell(
                      onTap: () {
                        ref
                            .read(onboardingProvider.notifier)
                            .addTravelIntent(dest);
                        setState(() => _intentError = null);
                      },
                      borderRadius: BorderRadius.circular(20),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          border: Border.all(
                            color: AppColors.borderColor(context),
                          ),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          dest,
                          style: AppTextStyles.bodySmall.copyWith(
                            color: AppColors.text(context, isMuted: true),
                          ),
                        ),
                      ),
                    )).toList(),
              ),
            ),
            const SizedBox(height: AppSpacing.md),
          ],

          Text(
            state.travelIntents.isEmpty
                ? 'Please add at least one destination to continue.'
                : '${state.travelIntents.length}/3 added',
            style: AppTextStyles.bodySmall.copyWith(
              color: AppColors.mutedForeground,
            ),
            textAlign: TextAlign.center,
          ),

          if (_intentError != null) ...[
            const SizedBox(height: 8),
            Text(
              _intentError!,
              style: AppTextStyles.bodySmall.copyWith(
                color: AppColors.destructive,
                fontWeight: FontWeight.w500,
              ),
              textAlign: TextAlign.center,
            ),
          ],

          const SizedBox(height: AppSpacing.lg),

          // Navigation buttons
          Row(
            children: [
              Expanded(
                child: SecondaryButton(
                  text: 'Back',
                  icon: LucideIcons.chevronLeft,
                  onPressed: () {
                    ref.read(onboardingProvider.notifier).setStep(6);
                  },
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: PrimaryButton(
                  text: 'Continue',
                  onPressed: () {
                    if (state.travelIntents.isEmpty) {
                      setState(() {
                        _intentError = 'Please add at least one travel destination to continue.';
                      });
                      return;
                    }
                    setState(() => _intentError = null);
                    ref.read(onboardingProvider.notifier).setStep(8);
                  },
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
