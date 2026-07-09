import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_spacing.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/features/onboarding/providers/onboarding_provider.dart';
import 'package:mobile/shared/widgets/primary_button.dart';
import 'package:mobile/shared/widgets/secondary_button.dart';

const _languageOptions = [
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

const _interestOptions = [
  // How they travel
  'Solo Backpacking', 'Weekend Getaways', 'Long-Term Travel',
  'Workations', 'Road Trips', 'Train Journeys',
  // Mountains & outdoors
  'Himalayan Treks', 'Camping & Stargazing', 'River Rafting',
  'Skiing & Snow', 'Wildlife & Safaris',
  // Beaches & water
  'Beach Bumming', 'Scuba & Snorkeling', 'Island Hopping',
  // Food & local
  'Street Food Crawls', 'Local Markets', 'Chai & Conversations',
  // Culture & art
  'Heritage & History', 'Art & Galleries', 'Music & Festivals',
  'Spiritual Travel',
  // Photography
  'Photography', 'Aesthetic Spots',
  // Nightlife
  'Nightlife & Clubs',
];

class LanguagesInterestsStep extends ConsumerWidget {
  const LanguagesInterestsStep({super.key});

  // ─── Bottom sheet picker ──────────────────────────────────────────────────
  void _showPickerSheet(
    BuildContext context,
    WidgetRef ref, {
    required String title,
    required List<String> options,
    required List<String> selected,
    required void Function(String) onToggle,
  }) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _PickerSheet(
        title: title,
        options: options,
        selected: selected,
        onToggle: onToggle,
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(onboardingProvider);
    final notifier = ref.read(onboardingProvider.notifier);

    final hasLanguage = state.languages.isNotEmpty;
    final hasInterest = state.interests.isNotEmpty;

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
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

          // ── Languages ────────────────────────────────────────────────────
          Text('Languages', style: AppTextStyles.label),
          const SizedBox(height: 8),
          _SelectorTrigger(
            label: hasLanguage
                ? '${state.languages.length} selected'
                : 'Select languages…',
            onTap: () => _showPickerSheet(
              context,
              ref,
              title: 'Languages',
              options: _languageOptions,
              selected: state.languages,
              onToggle: notifier.toggleLanguage,
            ),
          ),
          if (hasLanguage) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: state.languages
                  .map(
                    (lang) => _SelectedChip(
                      label: lang,
                      onRemove: () => notifier.toggleLanguage(lang),
                    ),
                  )
                  .toList(),
            ),
          ],

          const SizedBox(height: AppSpacing.md),

          // ── Interests ────────────────────────────────────────────────────
          Text('Interests', style: AppTextStyles.label),
          const SizedBox(height: 8),
          _SelectorTrigger(
            label: hasInterest
                ? '${state.interests.length} selected'
                : 'Select interests…',
            onTap: () => _showPickerSheet(
              context,
              ref,
              title: 'Interests',
              options: _interestOptions,
              selected: state.interests,
              onToggle: notifier.toggleInterest,
            ),
          ),
          if (hasInterest) ...[
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: state.interests
                  .map(
                    (interest) => _SelectedChip(
                      label: interest,
                      onRemove: () => notifier.toggleInterest(interest),
                    ),
                  )
                  .toList(),
            ),
          ],

          // ── Validation hint ───────────────────────────────────────────────
          if (!hasLanguage || !hasInterest) ...[
            const SizedBox(height: 12),
            Text(
              'Please select at least one language and one interest.',
              style: AppTextStyles.bodySmall.copyWith(
                color: AppColors.mutedForeground,
              ),
            ),
          ],

          const SizedBox(height: AppSpacing.lg),

          // ── Nav buttons ──────────────────────────────────────────────────
          Row(
            children: [
              Expanded(
                child: SecondaryButton(
                  text: 'Back',
                  icon: LucideIcons.chevronLeft,
                  onPressed: () => notifier.setStep(4),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: PrimaryButton(
                  text: 'Continue',
                  onPressed: (hasLanguage && hasInterest)
                      ? () => notifier.setStep(6)
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

// ─── Trigger button ──────────────────────────────────────────────────────────

class _SelectorTrigger extends StatelessWidget {
  const _SelectorTrigger({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: AppColors.surface(context, level: 1),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppColors.borderColor(context)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              label,
              style: AppTextStyles.bodyMedium.copyWith(
                color: AppColors.text(context, isMuted: true),
              ),
            ),
            Icon(
              LucideIcons.chevronsUpDown,
              size: 16,
              color: AppColors.mutedForeground,
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Selected chip ───────────────────────────────────────────────────────────

class _SelectedChip extends StatelessWidget {
  const _SelectedChip({required this.label, required this.onRemove});
  final String label;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: AppColors.primary.withOpacity(0.1),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.primary.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            label,
            style: AppTextStyles.bodySmall.copyWith(
              color: AppColors.primary,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(width: 4),
          GestureDetector(
            onTap: onRemove,
            child: Icon(LucideIcons.x, size: 12, color: AppColors.primary),
          ),
        ],
      ),
    );
  }
}

// ─── Bottom-sheet picker ──────────────────────────────────────────────────────

class _PickerSheet extends StatefulWidget {
  const _PickerSheet({
    required this.title,
    required this.options,
    required this.selected,
    required this.onToggle,
  });
  final String title;
  final List<String> options;
  final List<String> selected;
  final void Function(String) onToggle;

  @override
  State<_PickerSheet> createState() => _PickerSheetState();
}

class _PickerSheetState extends State<_PickerSheet> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final filtered = widget.options
        .where((o) => o.toLowerCase().contains(_query.toLowerCase()))
        .toList();

    return DraggableScrollableSheet(
      initialChildSize: 0.65,
      minChildSize: 0.4,
      maxChildSize: 0.9,
      builder: (ctx, scrollController) => Container(
        decoration: BoxDecoration(
          color: AppColors.surface(context, level: 1),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(
          children: [
            // drag handle
            const SizedBox(height: 8),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.borderColor(context),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                widget.title,
                style: AppTextStyles.h3.copyWith(fontWeight: FontWeight.w600),
              ),
            ),
            const SizedBox(height: 12),

            // search field
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: TextField(
                controller: _searchController,
                onChanged: (v) => setState(() => _query = v),
                decoration: InputDecoration(
                  hintText: 'Search…',
                  hintStyle: TextStyle(color: AppColors.mutedForeground),
                  prefixIcon: Icon(
                    LucideIcons.search,
                    size: 16,
                    color: AppColors.mutedForeground,
                  ),
                  suffixIcon: _query.isNotEmpty
                      ? GestureDetector(
                          onTap: () {
                            _searchController.clear();
                            setState(() => _query = '');
                          },
                          child: Icon(
                            LucideIcons.x,
                            size: 14,
                            color: AppColors.mutedForeground,
                          ),
                        )
                      : null,
                  filled: true,
                  fillColor: AppColors.surface(context),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 10,
                  ),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(
                      color: AppColors.borderColor(context),
                    ),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(
                      color: AppColors.borderColor(context),
                    ),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(color: AppColors.primary),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 8),
            Divider(height: 1, color: AppColors.borderColor(context)),

            // list
            Expanded(
              child: filtered.isEmpty
                  ? Center(
                      child: Text(
                        'No results',
                        style: AppTextStyles.bodyMedium.copyWith(
                          color: AppColors.mutedForeground,
                        ),
                      ),
                    )
                  : ListView.builder(
                      controller: scrollController,
                      itemCount: filtered.length,
                      itemBuilder: (_, i) {
                        final item = filtered[i];
                        final isSelected = widget.selected.contains(item);
                        return ListTile(
                          dense: true,
                          visualDensity: VisualDensity.compact,
                          title: Text(item, style: AppTextStyles.bodyMedium),
                          trailing: isSelected
                              ? Icon(
                                  LucideIcons.check,
                                  size: 16,
                                  color: AppColors.primary,
                                )
                              : null,
                          onTap: () {
                            widget.onToggle(item);
                            setState(() {}); // refresh tick marks
                          },
                        );
                      },
                    ),
            ),

            // Done button
            Padding(
              padding: EdgeInsets.fromLTRB(
                16,
                8,
                16,
                MediaQuery.of(context).padding.bottom + 12,
              ),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () => Navigator.of(context).pop(),
                  style: FilledButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  child: Text(
                    'Done  (${widget.selected.length} selected)',
                    style: const TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
