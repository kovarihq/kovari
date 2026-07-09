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
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/network/cloudinary_service.dart';
import 'package:mobile/core/network/location_service.dart';
import 'package:mobile/core/providers/profile_provider.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_spacing.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/core/widgets/common/user_avatar_fallback.dart';
import 'package:mobile/features/onboarding/data/profile_service.dart';
import 'package:mobile/features/profile/models/user_profile.dart';
import 'package:mobile/shared/utils/url_utils.dart';
import 'package:mobile/shared/widgets/flat_date_picker.dart';
import 'package:mobile/shared/widgets/kovari_snackbar.dart';
import 'package:mobile/shared/widgets/location_autocomplete.dart';
import 'package:mobile/shared/widgets/profile_section_card.dart';
import 'package:mobile/shared/widgets/select_chip.dart';
import 'package:mobile/shared/widgets/select_field.dart';
import 'package:mobile/shared/widgets/text_input_field.dart';

class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key});

  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  late TextEditingController _nameController;
  late TextEditingController _usernameController;
  late TextEditingController _bioController;
  late TextEditingController _professionController;

  String _age = '';
  DateTime? _birthday;
  String _gender = '';
  String _nationality = '';
  String _location = '';
  Map<String, dynamic>? _locationDetails;
  String _religion = '';
  String _smoking = '';
  String _drinking = '';
  String _personality = '';
  String _foodPreference = '';
  List<String> _interests = [];
  List<String> _languages = [];
  List<TravelIntention> _travelIntentions = [];
  final TextEditingController _destinationController = TextEditingController();
  GeoapifyResult? _selectedDestinationDetails;

  bool _isLoading = false;

  // Username check state
  Timer? _debounceTimer;
  bool? _isUsernameAvailable;
  bool _isUsernameChecking = false;

  // Media Profile State
  final ImagePicker _picker = ImagePicker();
  File? _profileImageFile;
  String? _profilePicUrl;

  @override
  void initState() {
    super.initState();
    final profile = ref.read(profileProvider);
    if (profile == null) return;

    _profilePicUrl = profile.profileImage;
    _nameController = TextEditingController(text: profile.name);
    _usernameController = TextEditingController(text: profile.username);
    _isUsernameAvailable = true; // Initially their own username is available
    _bioController = TextEditingController(text: profile.bio);
    _professionController = TextEditingController(text: profile.profession);

    _age = profile.age;
    _birthday = profile.birthday != null
        ? DateTime.tryParse(profile.birthday!)
        : null;
    _gender = profile.gender;
    _nationality = profile.nationality;
    _location = profile.location;
    _religion = profile.religion;
    _smoking = profile.smoking;
    _drinking = profile.drinking;
    _personality = profile.personality;
    _foodPreference = profile.foodPreference;
    _interests = List.from(profile.interests);
    _languages = List.from(profile.languages);
    _travelIntentions = List.from(profile.travelIntentions);
  }

  void _debounceUsernameCheck(String username) {
    _debounceTimer?.cancel();

    if (username.isEmpty || username.length < 3) {
      setState(() {
        _isUsernameAvailable = null;
        _isUsernameChecking = false;
      });
      return;
    }

    final profile = ref.read(profileProvider);
    // If it's their current username, it's available
    if (profile != null && username == profile.username) {
      setState(() {
        _isUsernameAvailable = true;
        _isUsernameChecking = false;
      });
      return;
    }

    setState(() {
      _isUsernameChecking = true;
      _isUsernameAvailable = null;
    });

    _debounceTimer = Timer(const Duration(milliseconds: 500), () async {
      try {
        final profileService = ProfileService(ref.read(apiClientProvider));
        final available = await profileService.checkUsernameAvailable(username);
        if (mounted) {
          setState(() {
            _isUsernameAvailable = available;
            _isUsernameChecking = false;
          });
        }
      } catch (e) {
        if (mounted) {
          setState(() => _isUsernameChecking = false);
        }
      }
    });
  }

  Future<void> _showImageSourceModal() async {
    unawaited(
      showModalBottomSheet<void>(
        context: context,
        backgroundColor: AppColors.surface(context, level: 1),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
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
                  color: AppColors.borderColor(context),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 24),
              Text(
                'Profile Picture',
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
                    color: AppColors.text(context),
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
                    color: AppColors.text(context),
                  ),
                ),
                onTap: () {
                  context.pop();
                  _pickImage(ImageSource.gallery);
                },
              ),
              if (_profileImageFile != null || _profilePicUrl != null)
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
                      _profileImageFile = null;
                      _profilePicUrl = null;
                    });
                  },
                ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _pickImage(ImageSource source) async {
    try {
      final pickedFile = await _picker.pickImage(source: source);
      if (pickedFile != null) {
        await _cropImage(pickedFile.path);
      }
    } catch (e) {
      AppLogger.e('Error picking image: $e');
    }
  }

  Future<void> _cropImage(String filePath) async {
    try {
      final croppedFile = await ImageCropper().cropImage(
        sourcePath: filePath,
        uiSettings: [
          AndroidUiSettings(
            toolbarTitle: '', // Clean, minimal look
            toolbarColor: Colors.black,
            toolbarWidgetColor: Colors.white,
            statusBarLight: true,
            backgroundColor: Colors.black,
            activeControlsWidgetColor: AppColors.primary,
            initAspectRatio: CropAspectRatioPreset.square,
            lockAspectRatio: true,
            showCropGrid: false,
            hideBottomControls: true,
            cropStyle: CropStyle.circle,
            aspectRatioPresets: [CropAspectRatioPreset.square],
          ),
          IOSUiSettings(
            title: '', // Remove title
            aspectRatioLockEnabled: true,
            resetButtonHidden: true,
            rotateButtonsHidden: true,
            rotateClockwiseButtonHidden: true,
            aspectRatioPickerButtonHidden: true,
            doneButtonTitle: 'Done',
            cancelButtonTitle: 'Cancel',
            cropStyle: CropStyle.circle,
            aspectRatioPresets: [CropAspectRatioPreset.square],
          ),
        ],
      );

      if (croppedFile != null) {
        setState(() {
          _profileImageFile = File(croppedFile.path);
        });
      }
    } catch (e) {
      AppLogger.e('Error cropping image: $e');
    }
  }

  @override
  void dispose() {
    _debounceTimer?.cancel();
    _nameController.dispose();
    _usernameController.dispose();
    _bioController.dispose();
    _professionController.dispose();
    _destinationController.dispose();
    super.dispose();
  }

  Future<void> _handleSave() async {
    AppLogger.d('💾 [_handleSave] Triggered');
    setState(() => _isLoading = true);
    if (_isUsernameAvailable == false) {
      KovariSnackbar.error(context, 'Username is already taken');
      setState(() => _isLoading = false);
      return;
    }

    try {
      final apiClient = ref.read(apiClientProvider);
      final profileService = ProfileService(apiClient);
      final cloudinaryService = CloudinaryService(apiClient);

      // 1. Upload new profile photo if exists
      var finalProfilePicUrl = _profilePicUrl;
      if (_profileImageFile != null) {
        try {
          final result = await cloudinaryService.uploadImage(
            _profileImageFile!,
          );
          finalProfilePicUrl = result['secure_url'] as String?;
        } catch (uploadError) {
          throw 'Failed to upload profile photo: $uploadError';
        }
      }

      final updatedData = {
        'name': _nameController.text.trim(),
        'username': _usernameController.text.trim(),
        'bio': _bioController.text.trim(),
        'profession': _professionController.text.trim(),
        'job': _professionController.text.trim(), // Alias for backend
        'age': int.tryParse(_age) ?? 0,
        'birthday': _birthday != null
            ? DateTime.utc(
                _birthday!.year,
                _birthday!.month,
                _birthday!.day,
              ).toIso8601String()
            : null,
        'gender': _gender,
        'nationality': _nationality,
        'location': _location,
        'location_details': _locationDetails,
        'religion': _religion,
        'smoking': _smoking,
        'drinking': _drinking,
        'personality': _personality,
        'foodPreference': _foodPreference,
        'food_preference': _foodPreference, // Alias for backend
        'interests': _interests,
        'languages': _languages,
        'profile_photo': finalProfilePicUrl,
        'avatar': finalProfilePicUrl, // Alias for mobile consistency
        'travel_intentions': _travelIntentions.map((t) => t.toJson()).toList(),
      };

      await profileService.updateProfile(updatedData);

      // Update local provider
      final currentProfile = ref.read(profileProvider);
      if (currentProfile != null) {
        ref
            .read(profileProvider.notifier)
            .setProfile(
              UserProfile.fromJson({
                ...currentProfile.toJson(),
                ...updatedData,
              }),
            );
      }

      if (mounted) {
        KovariSnackbar.success(context, 'Profile updated successfully');
        context.go('/profile');
        // Trigger background network refresh to sync all cached data smoothly
        ref.read(profileProvider.notifier).fetchProfile(ignoreCache: true);
      }
    } catch (e) {
      if (mounted) {
        KovariSnackbar.error(context, 'Failed to update profile: $e');
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      elevation: 0,
      centerTitle: true,
      leadingWidth: 80,
      leading: TextButton(
        onPressed: () => context.pop(),
        style: TextButton.styleFrom(
          minimumSize: const Size(80, 48),
          padding: EdgeInsets.zero,
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        ),
        child: Text(
          'Cancel',
          style: AppTextStyles.bodyMedium.copyWith(
            color: AppColors.text(context),
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      title: Text(
        'Edit Profile',
        style: AppTextStyles.bodyMedium.copyWith(
          fontWeight: FontWeight.w700,
          color: AppColors.text(context),
        ),
      ),
      actions: [
        SizedBox(
          width: 80,
          child: _isLoading
              ? const Center(
                  child: SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor: AlwaysStoppedAnimation<Color>(
                        AppColors.primary,
                      ),
                    ),
                  ),
                )
              : TextButton(
                  onPressed: _handleSave,
                  style: TextButton.styleFrom(
                    minimumSize: const Size(80, 48),
                    padding: EdgeInsets.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  child: Text(
                    'Done',
                    style: AppTextStyles.bodyMedium.copyWith(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
        ),
      ],
      shape: Border(
        bottom: BorderSide(color: AppColors.borderColor(context), width: 0.5),
      ),
    ),
    body: SingleChildScrollView(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
      child: Column(
        children: [
          // Avatar Header
          Center(
            child: GestureDetector(
              onTap: _showImageSourceModal,
              child: Stack(
                children: [
                  Container(
                    width: 100,
                    height: 100,
                    decoration: BoxDecoration(
                      color: AppColors.surface(context, level: 2),
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.borderColor(context)),
                      image: _profileImageFile != null
                          ? DecorationImage(
                              image: FileImage(_profileImageFile!),
                              fit: BoxFit.cover,
                            )
                          : (_profilePicUrl != null &&
                                _profilePicUrl!.isNotEmpty)
                          ? DecorationImage(
                              image: CachedNetworkImageProvider(
                                UrlUtils.getFullImageUrl(_profilePicUrl) ?? '',
                              ),
                              fit: BoxFit.cover,
                            )
                          : null,
                    ),
                    child:
                        (_profileImageFile == null &&
                            (_profilePicUrl == null || _profilePicUrl!.isEmpty))
                        ? const Center(child: UserAvatarFallback(size: 100))
                        : null,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          GestureDetector(
            onTap: _showImageSourceModal,
            child: Text(
              'Change Profile Photo',
              style: AppTextStyles.bodySmall.copyWith(
                color: AppColors.primary,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.xl),

          // 1. General Info
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
            child: ProfileSectionCard(
              title: 'General Info',
              subtitle: 'Update your basic profile details.',
              children: [
                TextInputField(
                  label: 'Name',
                  controller: _nameController,
                  hintText: 'Your full name',
                  fillColor: AppColors.surface(context, level: 2),
                ),
                const SizedBox(height: AppSpacing.md),
                TextInputField(
                  label: 'Username',
                  controller: _usernameController,
                  hintText: 'your_username',
                  fillColor: AppColors.surface(context, level: 2),
                  onChanged: _debounceUsernameCheck,
                  suffixIcon: Padding(
                    padding: const EdgeInsets.all(12),
                    child: _isUsernameChecking
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: AppColors.primary,
                            ),
                          )
                        : (_isUsernameAvailable == true
                              ? const Icon(
                                  LucideIcons.check,
                                  color: AppColors.primary,
                                  size: 18,
                                )
                              : (_isUsernameAvailable == false
                                    ? const Icon(
                                        LucideIcons.circleAlert,
                                        color: AppColors.destructive,
                                        size: 18,
                                      )
                                    : null)),
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                _buildDatePicker(context),
                const SizedBox(height: AppSpacing.md),
                SelectField<String>(
                  label: 'Gender',
                  value: _gender,
                  hintText: 'Select gender',
                  fillColor: AppColors.surface(context, level: 2),
                  options: const [
                    'Male',
                    'Female',
                    'Other',
                    'Prefer not to say',
                  ],
                  itemLabelBuilder: (val) => val,
                  onChanged: (val) => setState(() => _gender = val ?? ''),
                ),
                const SizedBox(height: AppSpacing.md),
                LocationAutocomplete(
                  label: 'Location',
                  initialValue: _location,
                  fillColor: AppColors.surface(context, level: 2),
                  onSelect: (val) => setState(() {
                    _location = val.formatted;
                    _locationDetails = {
                      'city': val.city,
                      'country': val.country,
                      'formatted': val.formatted,
                      'lat': val.lat,
                      'lon': val.lon,
                    };
                  }),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),

          // 2. Professional Info
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
            child: ProfileSectionCard(
              title: 'Professional Info',
              subtitle: 'Update your professional details.',
              children: [
                TextInputField(
                  label: 'Profession',
                  controller: _professionController,
                  hintText: 'What do you do?',
                  fillColor: AppColors.surface(context, level: 2),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),

          // 3. Personal Info
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
            child: ProfileSectionCard(
              title: 'Personal Info',
              subtitle: 'Update your personal details.',
              children: [
                TextInputField(
                  label: 'Bio',
                  controller: _bioController,
                  hintText: 'Tell us about yourself...',
                  maxLines: 4,
                  fillColor: AppColors.surface(context, level: 2),
                ),
                const SizedBox(height: AppSpacing.md),
                SelectField<String>(
                  label: 'Religion',
                  value: _religion,
                  hintText: 'Select Religion',
                  fillColor: AppColors.surface(context, level: 2),
                  options: const [
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
                  ],
                  itemLabelBuilder: (val) => val,
                  onChanged: (val) => setState(() => _religion = val ?? ''),
                ),
                const SizedBox(height: AppSpacing.md),
                SelectField<String>(
                  label: 'Smoking',
                  value: _smoking,
                  hintText: 'Select Smoking',
                  fillColor: AppColors.surface(context, level: 2),
                  options: const [
                    'Yes',
                    'No',
                    'Occasionally',
                    'Prefer not to say',
                  ],
                  itemLabelBuilder: (val) => val,
                  onChanged: (val) => setState(() => _smoking = val ?? ''),
                ),
                const SizedBox(height: AppSpacing.md),
                SelectField<String>(
                  label: 'Drinking',
                  value: _drinking,
                  hintText: 'Select Drinking',
                  fillColor: AppColors.surface(context, level: 2),
                  options: const ['Yes', 'No', 'Socially', 'Prefer not to say'],
                  itemLabelBuilder: (val) => val,
                  onChanged: (val) => setState(() => _drinking = val ?? ''),
                ),

                const SizedBox(height: AppSpacing.md),
                SelectField<String>(
                  label: 'Personality',
                  value: _personality,
                  hintText: 'Select Personality',
                  fillColor: AppColors.surface(context, level: 2),
                  options: const [
                    'Introvert',
                    'Extrovert',
                    'Ambivert',
                    'Prefer not to say',
                  ],
                  itemLabelBuilder: (val) => val,
                  onChanged: (val) => setState(() => _personality = val ?? ''),
                ),
                const SizedBox(height: AppSpacing.md),
                SelectField<String>(
                  label: 'Food Preference',
                  value: _foodPreference,
                  hintText: 'Select Food Preference',
                  fillColor: AppColors.surface(context, level: 2),
                  options: const [
                    'Vegetarian',
                    'Vegan',
                    'Non-vegetarian',
                    'Pescatarian',
                    'Halal',
                    'Kosher',
                    'No preference',
                  ],
                  itemLabelBuilder: (val) => val,
                  onChanged: (val) =>
                      setState(() => _foodPreference = val ?? ''),
                ),
                const SizedBox(height: AppSpacing.md),
                _buildMultiSelectSection(
                  'Interests',
                  const [
                    'Solo Backpacking',
                    'Weekend Getaways',
                    'Long-Term Travel',
                    'Workations',
                    'Road Trips',
                    'Train Journeys',
                    'Himalayan Treks',
                    'Camping & Stargazing',
                    'River Rafting',
                    'Skiing & Snow',
                    'Wildlife & Safaris',
                    'Beach Bumming',
                    'Scuba & Snorkeling',
                    'Island Hopping',
                    'Street Food Crawls',
                    'Local Markets',
                    'Chai & Conversations',
                    'Heritage & History',
                    'Art & Galleries',
                    'Music & Festivals',
                    'Spiritual Travel',
                    'Photography',
                    'Aesthetic Spots',
                    'Nightlife & Clubs',
                  ],
                  _interests,
                  (val) => setState(
                    () => _interests.contains(val)
                        ? _interests.remove(val)
                        : _interests.add(val),
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                _buildMultiSelectSection(
                  'Languages',
                  const [
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
                  ],
                  _languages,
                  (val) => setState(
                    () => _languages.contains(val)
                        ? _languages.remove(val)
                        : _languages.add(val),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.lg),

          // 4. Travel Intentions
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
            child: ProfileSectionCard(
              title: 'Travel Plans',
              subtitle: 'Add up to 3 destinations you want to visit.',
              children: [
                // Added destinations chips
                if (_travelIntentions.isNotEmpty) ...[
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: List.generate(_travelIntentions.length, (index) {
                      final intent = _travelIntentions[index];
                      return Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.secondaryColor(context),
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              intent.destination,
                              style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                                color: AppColors.text(context),
                              ),
                            ),
                            const SizedBox(width: 6),
                            GestureDetector(
                              onTap: () => setState(
                                () => _travelIntentions.removeAt(index),
                              ),
                              child: Icon(
                                LucideIcons.x,
                                size: 14,
                                color: AppColors.text(context, isMuted: true),
                              ),
                            ),
                          ],
                        ),
                      );
                    }),
                  ),
                  const SizedBox(height: AppSpacing.md),
                ],

                // Destination input — only when < 3 added
                if (_travelIntentions.length < 3)
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: LocationAutocomplete(
                          label: 'Add Destination',
                          controller: _destinationController,
                          hintText: 'Enter your destination',
                          fillColor: AppColors.surface(context, level: 2),
                          onSelect: (result) {
                            _selectedDestinationDetails = result;
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      Padding(
                        padding: const EdgeInsets.only(bottom: 2),
                        child: SizedBox(
                          height: 44,
                          child: OutlinedButton(
                            style: OutlinedButton.styleFrom(
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              side: BorderSide(
                                color: AppColors.borderColor(context),
                              ),
                              padding: const EdgeInsets.symmetric(
                                horizontal: 18,
                              ),
                            ),
                            onPressed: () {
                              final val = _destinationController.text.trim();
                              if (val.isEmpty) return;
                              final details = _selectedDestinationDetails;
                              final label =
                                  details?.city ??
                                  details?.formatted.split(',')[0].trim() ??
                                  val;
                              setState(() {
                                _travelIntentions.add(
                                  TravelIntention(
                                    destination: label,
                                    destinationDetails: details != null
                                        ? DestinationDetails(
                                            city: details.city,
                                            country: details.country,
                                            lat: details.lat,
                                            lon: details.lon,
                                          )
                                        : null,
                                  ),
                                );
                              });
                              _destinationController.clear();
                              _selectedDestinationDetails = null;
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

                if (_travelIntentions.isEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      'No destinations added yet.',
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.text(context, isMuted: true),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    ),
  );

  Widget _buildDatePicker(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Padding(
        padding: const EdgeInsets.only(left: 4),
        child: Text(
          'Birthday',
          style: AppTextStyles.label.copyWith(
            color: AppColors.text(context, isMuted: true),
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      const SizedBox(height: 6),
      InkWell(
        onTap: () => _showDatePicker(context),
        child: Container(
          height: 44,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: AppColors.surface(context, level: 2),
            borderRadius: const BorderRadius.all(Radius.circular(12)),
            border: Border.all(color: AppColors.borderColor(context)),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                _birthday == null
                    ? 'Select Date'
                    : DateFormat('dd MMM yyyy').format(_birthday!),
                style: AppTextStyles.bodyMedium.copyWith(
                  color: _birthday == null
                      ? AppColors.text(context, isMuted: true)
                      : AppColors.text(context),
                ),
              ),
            ],
          ),
        ),
      ),
    ],
  );

  void _showDatePicker(BuildContext context) {
    unawaited(
      showModalBottomSheet<void>(
        context: context,
        backgroundColor: AppColors.surface(context, level: 1),
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        builder: (context) {
          var tempDate =
              _birthday ??
              DateTime.now().subtract(const Duration(days: 365 * 18));
          return Container(
            height: 320,
            padding: const EdgeInsets.symmetric(vertical: 16),
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      TextButton(
                        onPressed: () => context.pop(),
                        child: Text(
                          'Cancel',
                          style: AppTextStyles.bodyMedium.copyWith(
                            color: AppColors.text(context, isMuted: true),
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      Text(
                        'Birthday',
                        style: AppTextStyles.h3.copyWith(
                          fontWeight: FontWeight.bold,
                          color: AppColors.text(context),
                        ),
                      ),
                      TextButton(
                        onPressed: () {
                          setState(() {
                            _birthday = tempDate;
                            // Recalculate age if needed
                            final now = DateTime.now();
                            var age = now.year - _birthday!.year;
                            if (now.month < _birthday!.month ||
                                (now.month == _birthday!.month &&
                                    now.day < _birthday!.day)) {
                              age--;
                            }
                            _age = age.toString();
                          });
                          context.pop();
                        },
                        child: Text(
                          'Done',
                          style: AppTextStyles.bodyMedium.copyWith(
                            color: AppColors.primary,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                Divider(color: AppColors.borderColor(context), thickness: 0.5),
                Expanded(
                  child: FlatDatePicker(
                    initialDate: tempDate,
                    onDateChanged: (date) => tempDate = date,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildMultiSelectSection(
    String label,
    List<String> options,
    List<String> selected,
    void Function(String) onToggle,
  ) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        label,
        style: TextStyle(
          fontSize: 12,
          color: AppColors.text(context, isMuted: true),
          fontWeight: FontWeight.w500,
        ),
      ),
      const SizedBox(height: 8),
      Wrap(
        spacing: 8,
        runSpacing: 8,
        children: options.map((opt) {
          final isSelected = selected.contains(opt);
          return SelectChip(
            label: opt,
            isSelected: isSelected,
            onTap: () => onToggle(opt),
            fillColor: AppColors.surface(context, level: 2),
          );
        }).toList(),
      ),
    ],
  );
}
