import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_cropper/image_cropper.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_spacing.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/core/widgets/common/user_avatar_fallback.dart';
import 'package:mobile/features/onboarding/providers/onboarding_provider.dart';
import 'package:mobile/shared/widgets/primary_button.dart';
import 'package:mobile/shared/widgets/secondary_button.dart';
import 'package:mobile/shared/widgets/text_input_field.dart';

class MediaBioStep extends ConsumerStatefulWidget {
  const MediaBioStep({super.key});

  @override
  ConsumerState<MediaBioStep> createState() => _MediaBioStepState();
}

class _MediaBioStepState extends ConsumerState<MediaBioStep> {
  late final TextEditingController _bioController;
  final ImagePicker _picker = ImagePicker();
  String? _photoError;

  @override
  void initState() {
    super.initState();
    _bioController = TextEditingController(
      text: ref.read(onboardingProvider).bio,
    );
  }

  void _showImageSourceModal() {
    unawaited(showModalBottomSheet<void>(
      context: context,
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
              style: AppTextStyles.h3.copyWith(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            ListTile(
              visualDensity: VisualDensity.compact,
              dense: true,
              leading: Container(
                padding: const EdgeInsets.all(6),
                child: const Icon(
                  LucideIcons.camera,
                  size: 22,
                  color: AppColors.mutedForeground,
                ),
              ),
              title: Text(
                'Take Photo',
                style: AppTextStyles.bodyMedium.copyWith(
                  fontWeight: FontWeight.w600,
                  color: AppColors.mutedForeground,
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
              leading: Container(
                padding: const EdgeInsets.all(6),
                child: const Icon(
                  LucideIcons.image,
                  size: 22,
                  color: AppColors.mutedForeground,
                ),
              ),
              title: Text(
                'Choose from Gallery',
                style: AppTextStyles.bodyMedium.copyWith(
                  fontWeight: FontWeight.w600,
                  color: AppColors.mutedForeground,
                ),
              ),
              onTap: () {
                context.pop();
                _pickImage(ImageSource.gallery);
              },
            ),
            if (ref.read(onboardingProvider).localProfilePicPath != null ||
                ref.read(onboardingProvider).profilePicUrl != null)
              ListTile(
                visualDensity: VisualDensity.compact,
                dense: true,
                leading: Container(
                  padding: const EdgeInsets.all(6),
                  child: const Icon(
                    LucideIcons.trash2,
                    size: 22,
                    color: AppColors.destructive,
                  ),
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
                  ref
                      .read(onboardingProvider.notifier)
                      .updateMediaBio(url: null, localPath: null);
                  setState(() => _photoError = null);
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
        await _cropImage(pickedFile.path);
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
            toolbarTitle: '', // Clean, minimal look
            toolbarColor: Colors.black,
            toolbarWidgetColor: Colors.white,
            statusBarLight: true,
            backgroundColor: Colors.black,
            activeControlsWidgetColor: AppColors.primary,
            initAspectRatio: CropAspectRatioPreset.square,
            lockAspectRatio: true,
            showCropGrid: false, // Remove distractions for a "calm" feel
            hideBottomControls: true, // Modern, thoughtful minimalist design
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
        ref
            .read(onboardingProvider.notifier)
            .updateMediaBio(localPath: croppedFile.path);
        setState(() => _photoError = null);
      }
    } catch (e) {
      debugPrint('Error cropping image: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(onboardingProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
      child: Column(
        children: [
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Profile picture',
            style: AppTextStyles.h3.copyWith(fontWeight: FontWeight.w600),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 6),
          Text(
            'Add a profile photo — it helps others trust you',
            style: AppTextStyles.bodyMedium.copyWith(
              color: AppColors.mutedForeground,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: AppSpacing.lg),

          // Avatar Selector mirroring web UX
          GestureDetector(
            onTap: _showImageSourceModal,
            child: Stack(
              children: [
                Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: AppColors.surface(context),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: AppColors.borderColor(context),
                    ),
                    image: state.localProfilePicPath != null
                        ? DecorationImage(
                            image: FileImage(File(state.localProfilePicPath!)),
                            fit: BoxFit.cover,
                          )
                        : state.profilePicUrl != null
                        ? DecorationImage(
                            image: NetworkImage(state.profilePicUrl!),
                            fit: BoxFit.cover,
                          )
                        : null,
                  ),
                  child:
                      (state.localProfilePicPath == null &&
                          state.profilePicUrl == null)
                      ? const Center(
                          child: UserAvatarFallback(
                            size: 80,
                            backgroundColor: Colors.transparent,
                          ),
                        )
                      : null,
                ),
                Positioned(
                  bottom: 0,
                  right: 0,
                  child: Container(
                    padding: const EdgeInsets.all(6),
                    decoration: const BoxDecoration(
                      color: AppColors.primary,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black26,
                          blurRadius: 4,
                          offset: Offset(0, 2),
                        ),
                      ],
                    ),
                    child: const Icon(
                      LucideIcons.pencil,
                      color: AppColors.primaryForeground,
                      size: 12,
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),

          // Skip photo for now text button
          TextButton(
            onPressed: () {
              ref
                  .read(onboardingProvider.notifier)
                  .updateMediaBio(url: null, localPath: null);
              setState(() => _photoError = null);
              ref.read(onboardingProvider.notifier).setStep(3);
            },
            style: TextButton.styleFrom(
              minimumSize: Size.zero,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
            ),
            child: Text(
              'Skip photo for now',
              style: AppTextStyles.bodySmall.copyWith(
                color: AppColors.mutedForeground,
                decoration: TextDecoration.underline,
              ),
            ),
          ),

          if (_photoError != null) ...[
            const SizedBox(height: 8),
            Text(
              _photoError!,
              style: AppTextStyles.bodySmall.copyWith(
                color: AppColors.destructive,
                fontWeight: FontWeight.w500,
              ),
              textAlign: TextAlign.center,
            ),
          ],

          const SizedBox(height: AppSpacing.lg),

          TextInputField(
            label: 'Bio',
            hintText: 'Tell us about your travel style...',
            controller: _bioController,
            maxLines: 4,
            onChanged: (v) =>
                ref.read(onboardingProvider.notifier).updateMediaBio(bio: v),
          ),

          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Expanded(
                child: SecondaryButton(
                  text: 'Back',
                  icon: LucideIcons.chevronLeft,
                  onPressed: () =>
                      ref.read(onboardingProvider.notifier).setStep(1),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: PrimaryButton(
                  text: 'Continue',
                  onPressed: () {
                    final hasPhoto = state.localProfilePicPath != null ||
                        state.profilePicUrl != null;
                    if (!hasPhoto) {
                      setState(() {
                        _photoError =
                            "Please add a profile photo to continue, or tap 'Skip photo for now'.";
                      });
                      return;
                    }
                    setState(() => _photoError = null);
                    ref.read(onboardingProvider.notifier).setStep(3);
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

  @override
  void dispose() {
    _bioController.dispose();
    super.dispose();
  }
}
