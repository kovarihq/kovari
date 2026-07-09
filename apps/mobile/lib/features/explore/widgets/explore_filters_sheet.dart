import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/features/explore/models/explore_state.dart';
import 'package:mobile/features/explore/providers/explore_provider.dart';
import 'package:mobile/shared/widgets/kovari_switch_tile.dart';
import 'package:mobile/shared/widgets/location_autocomplete.dart';
import 'package:mobile/shared/widgets/primary_button.dart';
import 'package:mobile/shared/widgets/secondary_button.dart';
import 'package:mobile/shared/widgets/select_chip.dart';
import 'package:mobile/shared/widgets/select_field.dart';

class ExploreFiltersSheet extends ConsumerStatefulWidget {
  const ExploreFiltersSheet({super.key});

  @override
  ConsumerState<ExploreFiltersSheet> createState() =>
      _ExploreFiltersSheetState();
}

class _ExploreFiltersSheetState extends ConsumerState<ExploreFiltersSheet> {
  late SearchData _searchData;
  late ExploreFilters _filters;

  @override
  void initState() {
    super.initState();
    final state = ref.read(exploreProvider);
    _searchData = state.searchData;
    _filters = state.filters;
  }

  static const List<String> languageOptions = [
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

  @override
  Widget build(BuildContext context) => Container(
      height: MediaQuery.of(context).size.height * 0.85,
      padding: EdgeInsets.only(
        top: 12,
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      decoration: BoxDecoration(
        color: AppColors.isDark(context)
            ? AppColors.cardDark
            : AppColors.background,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        children: [
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.text(
                  context,
                  isMuted: true,
                ).withValues(alpha: 0.5),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              children: [
                _buildSectionTitle(context, 'Destination'),
                LocationAutocomplete(
                  label: '',
                  initialValue: _searchData.destination,
                  hintText: 'Where do you want to go?',
                  onSelect: (result) {
                    setState(() {
                      _searchData = _searchData.copyWith(
                        destination: result.formatted,
                        destinationDetails: {
                          'lat': result.lat,
                          'lon': result.lon,
                          'city': result.city,
                          'country': result.country,
                        },
                      );
                    });
                  },
                ),
                const SizedBox(height: 24),
                _buildSectionTitle(context, 'Travel Dates'),
                Row(
                  children: [
                    Expanded(
                      child: SecondaryButton(
                        isDate: true,
                        backgroundColor: AppColors.cardColor(context),
                        text: DateFormat(
                          'MMM dd, yyyy',
                        ).format(_searchData.startDate),
                        onPressed: () async {
                          final date = await showDatePicker(
                            context: context,
                            initialDate: _searchData.startDate,
                            firstDate: DateTime.now(),
                            lastDate: DateTime.now().add(
                              const Duration(days: 365),
                            ),
                          );
                          if (date != null) {
                            setState(() {
                              _searchData = _searchData.copyWith(
                                startDate: date,
                              );
                            });
                          }
                        },
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: SecondaryButton(
                        isDate: true,
                        backgroundColor: AppColors.cardColor(context),
                        text: DateFormat(
                          'MMM dd, yyyy',
                        ).format(_searchData.endDate),
                        onPressed: () async {
                          final date = await showDatePicker(
                            context: context,
                            initialDate: _searchData.endDate,
                            firstDate: _searchData.startDate,
                            lastDate: DateTime.now().add(
                              const Duration(days: 365),
                            ),
                          );
                          if (date != null) {
                            setState(() {
                              _searchData = _searchData.copyWith(endDate: date);
                            });
                          }
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                _buildSectionTitle(context, 'Budget Range'),
                Slider(
                  value: _searchData.budget,
                  min: 5000,
                  max: 50000,
                  divisions: 45,
                  onChanged: (value) {
                    setState(() {
                      _searchData = _searchData.copyWith(budget: value);
                    });
                  },
                ),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('₹5,000', style: AppTextStyles.label),
                    Text(
                      '₹${NumberFormat('#,###').format(_searchData.budget)}',
                      style: AppTextStyles.label.copyWith(
                        color: AppColors.primary,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    Text('₹50,000+', style: AppTextStyles.label),
                  ],
                ),
                const SizedBox(height: 24),
                _buildSectionTitle(context, 'Quick Select'),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [10000, 20000, 35000, 50000].map((budget) {
                      final isSelected = _searchData.budget == budget;
                      return Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: SelectChip(
                          label: budget == 50000
                              ? '₹50k+'
                              : '₹${NumberFormat('#,###').format(budget)}',
                          isSelected: isSelected,
                          onTap: () => setState(
                            () => _searchData = _searchData.copyWith(
                              budget: budget.toDouble(),
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ),
                const SizedBox(height: 24),
                if (_searchData.travelMode == TravelMode.solo) ...[
                  _buildSectionTitle(
                    context,
                    'Age Range: ${_filters.ageRange[0]} - ${_filters.ageRange[1]}',
                  ),
                  RangeSlider(
                    values: RangeValues(
                      _filters.ageRange[0].toDouble(),
                      _filters.ageRange[1].toDouble(),
                    ),
                    min: 18,
                    max: 80,
                    divisions: 62,
                    onChanged: (values) {
                      setState(() {
                        _filters = _filters.copyWith(
                          ageRange: [values.start.round(), values.end.round()],
                        );
                      });
                    },
                  ),
                  const SizedBox(height: 20),
                  _buildSectionTitle(context, 'Gender Preference'),
                  SelectField<String>(
                    label: '',
                    value: _filters.gender,
                    hintText: 'Select gender',
                    options: const ['Any', 'Male', 'Female', 'Other'],
                    itemLabelBuilder: (val) => val,
                    onChanged: (val) => setState(
                      () => _filters = _filters.copyWith(gender: val ?? 'Any'),
                    ),
                  ),
                  const SizedBox(height: 24),
                  _buildSectionTitle(context, 'Personality'),
                  SelectField<String>(
                    label: '',
                    value: _filters.personality,
                    hintText: 'Select personality',
                    options: const [
                      'Any',
                      'Extrovert',
                      'Introvert',
                      'Ambivert',
                    ],
                    itemLabelBuilder: (val) => val,
                    onChanged: (val) => setState(
                      () => _filters = _filters.copyWith(
                        personality: val ?? 'Any',
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  _buildSectionTitle(context, 'Religion'),
                  SelectField<String>(
                    label: '',
                    value: _filters.religion,
                    hintText: 'Select religion',
                    options: const [
                      'Any',
                      'Hindu',
                      'Muslim',
                      'Christian',
                      'Sikh',
                      'Buddhist',
                      'Jain',
                      'Agnostic',
                      'Other',
                    ],
                    itemLabelBuilder: (val) => val,
                    onChanged: (val) => setState(
                      () => _filters = _filters.copyWith(
                        religion: val ?? 'Any',
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                ],
                _buildSectionTitle(context, 'Languages'),
                _buildChips(
                  options: languageOptions,
                  selected: _filters.languages,
                  onSelected: (val) {
                    final languages = List<String>.from(_filters.languages);
                    if (languages.contains(val)) {
                      languages.remove(val);
                    } else {
                      languages.add(val);
                    }
                    setState(
                      () => _filters = _filters.copyWith(languages: languages),
                    );
                  },
                  multiple: true,
                ),
                const SizedBox(height: 24),
                KovariSwitchTile(
                  label: _filters.smoking == 'No'
                      ? 'Strictly non-smoking'
                      : "I'm okay with smoking",
                  value: _filters.smoking == 'No',
                  onChanged: (val) => setState(
                    () => _filters = _filters.copyWith(
                      smoking: val ? 'No' : 'Yes',
                    ),
                  ),
                ),
                KovariSwitchTile(
                  label: _filters.drinking == 'No'
                      ? 'Strictly non-drinking'
                      : "I'm okay with drinking",
                  value: _filters.drinking == 'No',
                  onChanged: (val) => setState(
                    () => _filters = _filters.copyWith(
                      drinking: val ? 'No' : 'Yes',
                    ),
                  ),
                ),
              ],
            ),
          ),
          _buildFooter(),
        ],
      ),
    );

  Widget _buildFooter() => Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: AppColors.surface(context, level: 1),
        border: Border(
          top: BorderSide(color: AppColors.borderColor(context)),
        ),
      ),
      child: SafeArea(
        child: PrimaryButton(
          text: 'Apply Filters',
          onPressed: () {
            ref.read(exploreProvider.notifier).updateSearchData(_searchData);
            ref.read(exploreProvider.notifier).updateFilters(_filters);
            ref.read(exploreProvider.notifier).performSearch();
            context.pop();
          },
        ),
      ),
    );

  Widget _buildSectionTitle(
    BuildContext context,
    String title, {
    bool isHeader = false,
  }) => Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(
        title,
        style: (isHeader ? AppTextStyles.bodyMedium : AppTextStyles.bodySmall)
            .copyWith(
              fontWeight: FontWeight.bold,
              color: isHeader
                  ? AppColors.text(context)
                  : AppColors.text(context, isMuted: true),
            ),
      ),
    );

  Widget _buildChips({
    required List<String> options,
    required List<String> selected,
    required void Function(String) onSelected,
    bool multiple = false,
  }) => Wrap(
      spacing: 8,
      runSpacing: 8,
      children: options.map((option) => SelectChip(
          label: option,
          isSelected: selected.contains(option),
          onTap: () => onSelected(option),
        )).toList(),
    );
}
