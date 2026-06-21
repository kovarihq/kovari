import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/network/cloudinary_service.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/features/groups/models/group.dart';
import 'package:mobile/features/groups/providers/group_details_provider.dart';
import 'package:mobile/shared/utils/url_utils.dart';
import 'package:mobile/shared/widgets/kovari_snackbar.dart';
import 'package:mobile/shared/widgets/kovari_switch_tile.dart';
import 'package:mobile/shared/widgets/location_autocomplete.dart';
import 'package:mobile/shared/widgets/primary_button.dart';
import 'package:mobile/shared/widgets/text_input_field.dart';

/// Base class for Settings Bottom Sheets to ensure consistent iOS look
class SettingsBottomSheet extends StatelessWidget {

  const SettingsBottomSheet({
    super.key,
    required this.title,
    required this.children,
    this.onSave,
    this.isSubmitting = false,
    this.buttonLabel = 'Save Changes',
    this.bottomSpacing = 16,
  });
  final String title;
  final List<Widget> children;
  final VoidCallback? onSave;
  final bool isSubmitting;
  final String buttonLabel;
  final double bottomSpacing;

  @override
  Widget build(BuildContext context) => Container(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 12,
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
      ),
      decoration: BoxDecoration(
        color: AppColors.isDark(context)
            ? AppColors.cardDark
            : AppColors.background,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
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
          Flexible(
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ...children,
                  SizedBox(height: bottomSpacing),
                ],
              ),
            ),
          ),
          if (onSave != null)
            PrimaryButton(
              text: buttonLabel,
              onPressed: isSubmitting ? null : onSave!,
              isLoading: isSubmitting,
            ),
        ],
      ),
    );
}

/// 📝 Edit Basic Info (Name, Destination, Description)
class EditBasicInfoSheet extends ConsumerStatefulWidget {
  const EditBasicInfoSheet({super.key, required this.group});
  final GroupModel group;

  @override
  ConsumerState<EditBasicInfoSheet> createState() => _EditBasicInfoSheetState();
}

class _EditBasicInfoSheetState extends ConsumerState<EditBasicInfoSheet> {
  late TextEditingController _nameController;
  late TextEditingController _descController;
  late String _destination;
  dynamic _destinationDetails;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.group.name);
    _descController = TextEditingController(text: widget.group.description);
    _destination = widget.group.destination;
  }

  Future<void> _handleSave() async {
    setState(() => _isSaving = true);
    try {
      await ref.read(groupActionsProvider(widget.group.id)).updateGroup({
        'name': _nameController.text,
        'description': _descController.text,
        'destination': _destination,
        if (_destinationDetails != null)
          'destination_details': _destinationDetails,
      });

      if (mounted) context.pop();
    } catch (e) {
      if (mounted) {
        KovariSnackbar.error(context, 'Error: $e');
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) => SettingsBottomSheet(
      title: 'Group Details',
      isSubmitting: _isSaving,
      onSave: _handleSave,
      children: [
        TextInputField(
          label: 'Group Name',
          controller: _nameController,
          hintText: 'Enter group name',
          fillColor: AppColors.surface(context, level: 1),
          contentPadding: const EdgeInsets.only(
            left: 12,
            right: 12,
            top: 10,
            bottom: 10,
          ),
        ),
        const SizedBox(height: 16),
        LocationAutocomplete(
          label: 'Destination',
          initialValue: _destination,
          onSelect: (result) {
            setState(() {
              _destination = result.formatted;
              _destinationDetails = {
                'latitude': result.lat,
                'longitude': result.lon,
                'place_id': result.placeId,
                'city': result.city,
                'country': result.country,
              };
            });
          },
          fillColor: AppColors.surface(context, level: 1),
          contentPadding: const EdgeInsets.only(
            left: 12,
            right: 12,
            top: 10,
            bottom: 10,
          ),
        ),
        const SizedBox(height: 16),
        TextInputField(
          label: 'Description',
          controller: _descController,
          hintText: "What's this trip about?",
          maxLines: 3,
          fillColor: AppColors.surface(context, level: 1),
          contentPadding: const EdgeInsets.only(
            left: 12,
            right: 12,
            top: 10,
            bottom: 10,
          ),
        ),
      ],
    );
}

/// 🖼️ Edit Group Cover Photo
class EditCoverPhotoSheet extends ConsumerStatefulWidget {
  const EditCoverPhotoSheet({super.key, required this.group});
  final GroupModel group;

  @override
  ConsumerState<EditCoverPhotoSheet> createState() =>
      _EditCoverPhotoSheetState();
}

class _EditCoverPhotoSheetState extends ConsumerState<EditCoverPhotoSheet> {
  final ImagePicker _picker = ImagePicker();
  File? _coverImageFile;
  late String? _currentCoverUrl;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _currentCoverUrl = widget.group.coverImage;
  }

  void _showImageSourceModal() {
    unawaited(showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.backgroundColor(context),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.text(
                  context,
                  isMuted: true,
                ).withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 24),
            Text(
              'Change Cover Photo',
              style: AppTextStyles.bodyMedium.copyWith(
                fontWeight: FontWeight.bold,
                fontSize: 18,
                color: AppColors.text(context),
              ),
            ),
            const SizedBox(height: 16),
            ListTile(
              visualDensity: VisualDensity.compact,
              dense: true,
              leading: Icon(
                LucideIcons.camera,
                size: 22,
                color: AppColors.text(context, isMuted: true),
              ),
              title: Text(
                'Take Photo',
                style: AppTextStyles.bodyMedium.copyWith(
                  fontWeight: FontWeight.w600,
                  color: AppColors.text(context, isMuted: true),
                ),
              ),
              onTap: () {
                context.pop();
                _pickImage(ImageSource.camera);
              },
            ),
            ListTile(
              visualDensity: VisualDensity.compact,
              dense: true,
              leading: Icon(
                LucideIcons.image,
                size: 22,
                color: AppColors.text(context, isMuted: true),
              ),
              title: Text(
                'Choose from Gallery',
                style: AppTextStyles.bodyMedium.copyWith(
                  fontWeight: FontWeight.w600,
                  color: AppColors.text(context, isMuted: true),
                ),
              ),
              onTap: () {
                context.pop();
                _pickImage(ImageSource.gallery);
              },
            ),
            if (_coverImageFile != null || _currentCoverUrl != null)
              ListTile(
                visualDensity: VisualDensity.compact,
                dense: true,
                leading: const Icon(
                  LucideIcons.trash2,
                  size: 22,
                  color: AppColors.destructive,
                ),
                title: Text(
                  'Remove Photo',
                  style: AppTextStyles.bodyMedium.copyWith(
                    color: AppColors.destructive,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                onTap: () {
                  context.pop();
                  setState(() {
                    _coverImageFile = null;
                    _currentCoverUrl = null;
                  });
                },
              ),
            const SizedBox(height: 16),
          ],
        ),
      ),
    ));
  }

  Future<void> _pickImage(ImageSource source) async {
    try {
      final pickedFile = await _picker.pickImage(source: source);
      if (pickedFile != null) {
        unawaited(_cropImage(pickedFile.path));
      }
    } catch (e) {
      debugPrint('Error picking image: $e');
    }
  }

  Future<void> _cropImage(String filePath) async {
    try {
      final croppedFile = await ImageCropper().cropImage(
        sourcePath: filePath,
        uiSettings: [
          AndroidUiSettings(
            toolbarTitle: 'Crop Cover',
            toolbarColor: Colors.black,
            toolbarWidgetColor: Colors.white,
            activeControlsWidgetColor: AppColors.primary,
            lockAspectRatio: true,
            initAspectRatio: CropAspectRatioPreset.ratio16x9,
            hideBottomControls: true,
            showCropGrid: false,
          ),
          IOSUiSettings(
            title: '',
            aspectRatioLockEnabled: true,
            resetButtonHidden: true,
            rotateButtonsHidden: true,
            aspectRatioPickerButtonHidden: true,
            doneButtonTitle: 'Done',
            cancelButtonTitle: 'Cancel',
          ),
        ],
        aspectRatio: const CropAspectRatio(ratioX: 2, ratioY: 1),
      );

      if (croppedFile != null) {
        setState(() {
          _coverImageFile = File(croppedFile.path);
        });
      }
    } catch (e) {
      debugPrint('Error cropping image: $e');
    }
  }

  Future<void> _handleSave() async {
    if (_coverImageFile == null &&
        _currentCoverUrl == widget.group.coverImage) {
      context.pop();
      return;
    }

    setState(() => _isSaving = true);
    try {
      var updatedUrl = _currentCoverUrl;

      if (_coverImageFile != null) {
        final cloudinary = ref.read(cloudinaryServiceProvider);
        final result = await cloudinary.uploadImage(
          _coverImageFile!,
          folder: 'groups',
        );
        updatedUrl = result['secure_url'] as String?;
      }

      await ref.read(groupActionsProvider(widget.group.id)).updateGroup({
        'cover_image': updatedUrl,
      });

      if (mounted) context.pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) => SettingsBottomSheet(
      title: 'Cover Photo',
      isSubmitting: _isSaving,
      onSave: _handleSave,
      children: [
        GestureDetector(
          onTap: _showImageSourceModal,
          child: Container(
            width: double.infinity,
            height: 200,
            decoration: BoxDecoration(
              color: AppColors.surface(context, level: 1),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.borderColor(context)),
              image: _coverImageFile != null
                  ? DecorationImage(
                      image: FileImage(_coverImageFile!),
                      fit: BoxFit.cover,
                    )
                  : (_currentCoverUrl != null
                        ? DecorationImage(
                            image: CachedNetworkImageProvider(
                              UrlUtils.getFullImageUrl(_currentCoverUrl) ?? '',
                            ),
                            fit: BoxFit.cover,
                          )
                        : null),
            ),
            child: _coverImageFile == null && _currentCoverUrl == null
                ? Center(
                    child: Icon(
                      LucideIcons.imagePlus,
                      size: 48,
                      color: AppColors.text(context, isMuted: true),
                    ),
                  )
                : Align(
                    alignment: Alignment.bottomRight,
                    child: Container(
                      margin: const EdgeInsets.all(12),
                      padding: const EdgeInsets.all(10),
                      decoration: const BoxDecoration(
                        color: Colors.black54,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        LucideIcons.pencil,
                        size: 16,
                        color: Colors.white,
                      ),
                    ),
                  ),
          ),
        ),
        const SizedBox(height: 12),
        Center(
          child: Text(
            'Tap the image to change',
            style: AppTextStyles.bodySmall.copyWith(
              color: AppColors.text(context, isMuted: true),
            ),
          ),
        ),
      ],
    );
}

/// 📅 Edit Travel Details (Dates, Budget)
class EditTravelDetailsSheet extends ConsumerStatefulWidget {
  const EditTravelDetailsSheet({super.key, required this.group});
  final GroupModel group;

  @override
  ConsumerState<EditTravelDetailsSheet> createState() =>
      _EditTravelDetailsSheetState();
}

class _EditTravelDetailsSheetState
    extends ConsumerState<EditTravelDetailsSheet> {
  late DateTime _startDate;
  late DateTime _endDate;
  late TextEditingController _budgetController;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _startDate = widget.group.dateRange.start != null
        ? DateTime.parse(widget.group.dateRange.start!)
        : DateTime.now();
    _endDate = widget.group.dateRange.end != null
        ? DateTime.parse(widget.group.dateRange.end!)
        : DateTime.now().add(const Duration(days: 7));
    _budgetController = TextEditingController(
      text: widget.group.budget?.toString() ?? '0',
    );
  }

  Future<void> _handleSave() async {
    if (_startDate.isAfter(_endDate)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('End date must be after start date')),
      );
      return;
    }

    setState(() => _isSaving = true);
    try {
      await ref.read(groupActionsProvider(widget.group.id)).updateGroup({
        'start_date': DateFormat('yyyy-MM-dd').format(_startDate),
        'end_date': DateFormat('yyyy-MM-dd').format(_endDate),
        'budget': int.tryParse(_budgetController.text) ?? 0,
      });
      if (mounted) context.pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  Future<void> _selectDate(BuildContext context, bool isStartDate) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: isStartDate ? _startDate : _endDate,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 730)),
      builder: (context, child) => Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: AppColors.primary,
              onSurface: AppColors.foreground,
            ),
          ),
          child: child!,
        ),
    );

    if (picked != null) {
      setState(() {
        if (isStartDate) {
          _startDate = picked;
          if (_endDate.isBefore(_startDate) ||
              _endDate.isAtSameMomentAs(_startDate)) {
            _endDate = _startDate.add(const Duration(days: 1));
          }
        } else {
          _endDate = picked;
        }
      });
    }
  }

  Widget _buildDatePicker(String label, DateTime date, VoidCallback onTap) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 4),
          child: Text(
            label,
            style: AppTextStyles.bodySmall.copyWith(
              color: AppColors.text(context, isMuted: true),
              fontSize: 12,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        const SizedBox(height: 6),
        InkWell(
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: AppColors.surface(context, level: 1),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.borderColor(context)),
            ),
            child: Row(
              children: [
                Icon(
                  LucideIcons.calendar,
                  size: 16,
                  color: AppColors.text(context, isMuted: true),
                ),
                const SizedBox(width: 8),
                Text(
                  DateFormat('MMM d, yyyy').format(date),
                  style: AppTextStyles.bodyMedium.copyWith(
                    fontWeight: FontWeight.w500,
                    color: AppColors.text(context),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );

  @override
  Widget build(BuildContext context) => SettingsBottomSheet(
      title: 'Travel Details',
      isSubmitting: _isSaving,
      onSave: _handleSave,
      children: [
        _buildDatePicker(
          'Start Date',
          _startDate,
          () => _selectDate(context, true),
        ),
        const SizedBox(height: 16),
        _buildDatePicker(
          'End Date',
          _endDate,
          () => _selectDate(context, false),
        ),
        const SizedBox(height: 16),
        TextInputField(
          label: 'Estimated Budget',
          controller: _budgetController,
          keyboardType: TextInputType.number,
          hintText: 'Enter budget amount',
          fillColor: AppColors.surface(context, level: 1),
          prefixIconConstraints: const BoxConstraints(
            
          ),
          contentPadding: const EdgeInsets.only(
            right: 12,
            top: 10,
            bottom: 10,
          ),
          prefixIcon: Padding(
            padding: const EdgeInsets.only(left: 12, right: 4),
            child: Icon(
              LucideIcons.indianRupee,
              size: 16,
              color: AppColors.text(context, isMuted: true),
            ),
          ),
        ),
      ],
    );
}

/// 🛡️ Edit Privacy & Policies
class EditPoliciesSheet extends ConsumerStatefulWidget {
  const EditPoliciesSheet({super.key, required this.group});
  final GroupModel group;

  @override
  ConsumerState<EditPoliciesSheet> createState() => _EditPoliciesSheetState();
}

class _EditPoliciesSheetState extends ConsumerState<EditPoliciesSheet> {
  late bool _isPublic;
  late bool _nonSmokers;
  late bool _nonDrinkers;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _isPublic = widget.group.privacy == 'public';
    _nonSmokers =
        widget.group.smokingPolicy ==
        'true'; // Backend boolean mapped to string
    _nonDrinkers = widget.group.drinkingPolicy == 'true';
  }

  Future<void> _handleSave() async {
    setState(() => _isSaving = true);
    try {
      await ref.read(groupActionsProvider(widget.group.id)).updateGroup({
        'is_public': _isPublic,
        'non_smokers': _nonSmokers,
        'non_drinkers': _nonDrinkers,
      });
      if (mounted) context.pop();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) => SettingsBottomSheet(
      title: 'Privacy & Policies',
      isSubmitting: _isSaving,
      onSave: _handleSave,
      bottomSpacing: 2,
      children: [
        _buildToggleRow(
          'Public Group',
          'Anyone can find and request to join',
          _isPublic,
          (val) => setState(() => _isPublic = val),
        ),
        _buildToggleRow(
          'Strictly Non-Smoking',
          'Members must not smoke during trip',
          _nonSmokers,
          (val) => setState(() => _nonSmokers = val),
        ),
        _buildToggleRow(
          'Strictly Non-Drinking',
          'Sober-friendly trip environment',
          _nonDrinkers,
          (val) => setState(() => _nonDrinkers = val),
        ),
      ],
    );

  Widget _buildToggleRow(
    String title,
    String subtitle,
    bool value,
    void Function(bool) onChanged,
  ) => KovariSwitchTile(
      label: title,
      subtitle: subtitle,
      titleStyle: AppTextStyles.bodySmall.copyWith(
        color: AppColors.text(context),
        fontSize: 12,
        fontWeight: FontWeight.w500,
      ),
      value: value,
      onChanged: onChanged,
      margin: const EdgeInsets.only(bottom: 12),
      fillColor: AppColors.surface(context, level: 1),
    );
}
