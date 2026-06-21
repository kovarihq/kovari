import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/navigation/routes.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/core/providers/profile_provider.dart';
import 'package:mobile/core/providers/theme_provider.dart';
import 'package:mobile/core/services/haptic_service.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/core/utils/api_error_handler.dart';
import 'package:mobile/features/auth/services/auth_service.dart';
import 'package:mobile/features/profile/providers/settings_provider.dart';
import 'package:mobile/shared/widgets/kovari_confirm_dialog.dart';
import 'package:mobile/shared/widgets/kovari_snackbar.dart';
import 'package:mobile/shared/widgets/primary_button.dart';
import 'package:mobile/shared/widgets/secondary_button.dart';
import 'package:url_launcher/url_launcher.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen>
    with SingleTickerProviderStateMixin {
  late TabController _themeTabController;
  bool _isPasswordLoading = false;
  bool _isEmailLoading = false;
  bool _isDeleteLoading = false;

  // Form visibility states
  bool _showEmailForm = false;
  bool _showPasswordForm = false;
  bool _verificationStep = false;
  String _pendingNewEmail = '';

  // Controllers
  final _currentPasswordController = TextEditingController();
  final _newPasswordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _emailController = TextEditingController();
  final _confirmEmailController = TextEditingController();
  final _verificationCodeController = TextEditingController();

  @override
  void initState() {
    super.initState();
    final initialMode = ref.read(themeProvider);
    _themeTabController = TabController(
      length: 3,
      vsync: this,
      initialIndex: _themeModeToIndex(initialMode),
    );

    _themeTabController.addListener(() {
      if (!_themeTabController.indexIsChanging) {
        final newMode = _indexToThemeMode(_themeTabController.index);
        if (newMode != ref.read(themeProvider)) {
          ref.read(themeProvider.notifier).setThemeMode(newMode);
        }
      }
    });
  }

  int _themeModeToIndex(ThemeMode mode) {
    switch (mode) {
      case ThemeMode.light:
        return 0;
      case ThemeMode.system:
        return 1;
      case ThemeMode.dark:
        return 2;
    }
  }

  ThemeMode _indexToThemeMode(int index) {
    switch (index) {
      case 0:
        return ThemeMode.light;
      case 1:
        return ThemeMode.system;
      case 2:
        return ThemeMode.dark;
      default:
        return ThemeMode.system;
    }
  }

  @override
  void dispose() {
    _themeTabController.dispose();
    _currentPasswordController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    _emailController.dispose();
    _confirmEmailController.dispose();
    _verificationCodeController.dispose();
    super.dispose();
  }

  void _showSnackBar(String message, {bool isError = false}) {
    if (isError) {
      KovariSnackbar.error(context, message);
    } else {
      KovariSnackbar.success(context, message);
    }
  }

  Future<void> _handleRequestVerification() async {
    if (_emailController.text != _confirmEmailController.text) {
      _showSnackBar('Email addresses do not match', isError: true);
      return;
    }

    setState(() => _isEmailLoading = true);
    try {
      final response = await ref
          .read(settingsServiceProvider)
          .updateEmail(_emailController.text);

      final isRequired = response['verificationRequired'] as bool?;
      if (isRequired == true) {
        setState(() {
          _pendingNewEmail = _emailController.text;
          _verificationStep = true;
        });
        final msg = response['message'] as String?;
        _showSnackBar(msg ?? 'Verification code sent to your new email.');
      } else {
        // Direct update succeeded (unlikely now)
        final currentProfile = ref.read(profileProvider);
        if (currentProfile != null) {
          ref
              .read(profileProvider.notifier)
              .setProfile(
                currentProfile.copyWith(email: _emailController.text),
              );
        }
        setState(() => _showEmailForm = false);
        _showSnackBar('Email updated successfully');
      }
    } catch (e) {
      _showSnackBar(e.toString().replaceAll('Exception: ', ''), isError: true);
    } finally {
      if (mounted) setState(() => _isEmailLoading = false);
    }
  }

  Future<void> _handleVerifyEmail() async {
    if (_verificationCodeController.text.length != 6) {
      _showSnackBar('Please enter a 6-digit code', isError: true);
      return;
    }

    setState(() => _isEmailLoading = true);
    try {
      await ref
          .read(settingsServiceProvider)
          .verifyEmail(_pendingNewEmail, _verificationCodeController.text);

      _showSnackBar('Email updated successfully');
      final currentProfile = ref.read(profileProvider);
      if (currentProfile != null) {
        ref
            .read(profileProvider.notifier)
            .setProfile(currentProfile.copyWith(email: _pendingNewEmail));
      }
      setState(() {
        _showEmailForm = false;
        _verificationStep = false;
        _emailController.clear();
        _confirmEmailController.clear();
        _verificationCodeController.clear();
      });
    } catch (e) {
      _showSnackBar(e.toString().replaceAll('Exception: ', ''), isError: true);
    } finally {
      if (mounted) setState(() => _isEmailLoading = false);
    }
  }

  Future<void> _handleForgotPassword() async {
    final profile = ref.read(profileProvider);
    if (profile?.email == null || profile!.email.isEmpty) {
      _showSnackBar('No email associated with your account', isError: true);
      return;
    }

    setState(() => _isPasswordLoading = true);
    try {
      final authService = ref.read(authServiceProvider);
      await authService.requestPasswordReset(profile.email);
      _showSnackBar('Password reset link sent to ${profile.email}');
    } catch (e) {
      _showSnackBar(ApiErrorHandler.extractError(e), isError: true);
    } finally {
      if (mounted) setState(() => _isPasswordLoading = false);
    }
  }

  Future<void> _handleChangePassword() async {
    if (_newPasswordController.text != _confirmPasswordController.text) {
      _showSnackBar('New passwords do not match', isError: true);
      return;
    }

    setState(() => _isPasswordLoading = true);
    try {
      await ref
          .read(settingsServiceProvider)
          .changePassword(
            currentPassword: _currentPasswordController.text,
            newPassword: _newPasswordController.text,
            confirmPassword: _confirmPasswordController.text,
          );
      _showSnackBar('Password updated successfully');
      _currentPasswordController.clear();
      _newPasswordController.clear();
      _confirmPasswordController.clear();
      setState(() => _showPasswordForm = false);
    } catch (e) {
      _showSnackBar(e.toString().replaceAll('Exception: ', ''), isError: true);
    } finally {
      if (mounted) setState(() => _isPasswordLoading = false);
    }
  }

  Future<void> _handleDeleteAccount() async {
    showKovariConfirmDialog(
      context: context,
      title: 'Delete your account?',
      content:
          'This will permanently delete your account and all associated data. This action cannot be undone.',
      confirmLabel: 'Delete',
      isDestructive: true,
      onConfirm: () async {
        setState(() => _isDeleteLoading = true);
        try {
          await ref.read(settingsServiceProvider).deleteAccount();
          _showSnackBar('Account deleted successfully');
          await ref.read(authProvider.notifier).logout();
          if (!mounted) return;
          const OnboardingRouteData().go(context);
        } catch (e) {
          _showSnackBar(
            e.toString().replaceAll('Exception: ', ''),
            isError: true,
          );
        } finally {
          if (mounted) setState(() => _isDeleteLoading = false);
        }
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(profileProvider);

    return AnimatedTheme(
      data: Theme.of(context),
      duration: const Duration(milliseconds: 400),
      curve: Curves.easeInOut,
      child: Scaffold(
        backgroundColor: AppColors.surface(context),
        body: Column(
          children: [
            Container(
              color: AppColors.surface(context, level: 1),
              child: SafeArea(bottom: false, child: _buildHeader(context)),
            ),
            Expanded(
              child: SingleChildScrollView(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 24,
                  ),
                  child: Column(
                    children: [
                      _buildSectionHeader(
                        'Manage email',
                        'Change your account email address.',
                      ),
                      const SizedBox(height: 16),
                      _buildAccountSection(profile?.email ?? ''),
                      const SizedBox(height: 32),
                      _buildSectionHeader(
                        'Manage password',
                        'Change your account password.',
                      ),
                      const SizedBox(height: 16),
                      _buildSecuritySection(),
                      const SizedBox(height: 32),
                      _buildSectionHeader(
                        'Appearance',
                        'Customize how Kovari looks on your device.',
                      ),
                      const SizedBox(height: 16),
                      _buildAppearanceSection(),
                      const SizedBox(height: 32),
                      _buildSectionHeader(
                        'Legal & Policies',
                        "Review Kovari's policies and your acceptance history.",
                      ),
                      const SizedBox(height: 16),
                      _buildLegalSection(),
                      const SizedBox(height: 32),
                      _buildSectionHeader(
                        'Delete account',
                        'This action is permanent and cannot be undone.',
                        isDestructive: true,
                      ),
                      const SizedBox(height: 16),
                      _buildDangerZoneSection(),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context) => Container(
      padding: const EdgeInsets.only(left: 4, right: 16, top: 16, bottom: 16),
      decoration: BoxDecoration(
        color: AppColors.surface(context, level: 1),
        border: Border(
          bottom: BorderSide(color: AppColors.borderColor(context)),
        ),
      ),
      child: Row(
        children: [
          _buildBackButton(context),
          const SizedBox(width: 4),
          Expanded(
            child: Text(
              'Settings',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.text(context),
              ),
            ),
          ),
        ],
      ),
    );

  Widget _buildBackButton(BuildContext context) => GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () {
        HapticService.selection();
        context.pop();
      },
      child: Container(
        padding: const EdgeInsets.all(8),
        child: Icon(
          LucideIcons.arrowLeft,
          size: 20,
          color: AppColors.text(context),
        ),
      ),
    );

  Widget _buildSectionHeader(
    String title,
    String subtitle, {
    bool isDestructive = false,
  }) => SizedBox(
      width: double.infinity,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.bold,
              color: isDestructive
                  ? AppColors.destructive
                  : AppColors.text(context),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            subtitle,
            style: TextStyle(
              fontSize: 13,
              color: AppColors.text(context, isMuted: true),
            ),
          ),
        ],
      ),
    );

  Widget _buildCard({required Widget child, Color? borderColor}) => Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: AppColors.surface(context, level: 1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: borderColor ?? AppColors.borderColor(context),
        ),
      ),
      child: child,
    );

  Widget _buildAccountSection(String currentEmail) {
    if (!_showEmailForm) {
      return _buildCard(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Current email',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.text(context),
                ),
              ),
              const SizedBox(height: 4),
              Text(
                currentEmail,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: AppColors.text(context),
                ),
              ),
              const SizedBox(height: 12),
              _buildOutlineButton(
                'Change Email',
                onPressed: () {
                  HapticService.light();
                  setState(() => _showEmailForm = true);
                },
              ),
            ],
          ),
        ),
      );
    }

    if (_verificationStep) {
      return _buildCard(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Verify your new email',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 8),
              Text(
                "We've sent a 6-digit code to $_pendingNewEmail. Enter it below.",
                style: TextStyle(
                  fontSize: 13,
                  color: AppColors.text(context, isMuted: true),
                ),
              ),
              const SizedBox(height: 24),
              _buildTextField(
                controller: _verificationCodeController,
                label: 'Verification code',
                hint: 'Enter 6-digit code',
                keyboardType: TextInputType.number,
              ),
              const SizedBox(height: 2),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  Expanded(
                    child: _buildActionButton(
                      'Verify email',
                      onPressed: _handleVerifyEmail,
                      isLoading: _isEmailLoading,
                    ),
                  ),
                  const SizedBox(width: 8),
                  _buildCancelButton(
                    () => setState(() {
                      _showEmailForm = false;
                      _verificationStep = false;
                    }),
                  ),
                ],
              ),
            ],
          ),
        ),
      );
    }

    return _buildCard(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            _buildTextField(
              controller: _emailController,
              label: 'New email',
              hint: 'Enter new email',
            ),
            const SizedBox(height: 8),
            _buildTextField(
              controller: _confirmEmailController,
              label: 'Confirm email',
              hint: 'Confirm new email',
            ),
            const SizedBox(height: 2),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                _buildActionButton(
                  'Continue',
                  onPressed: _handleRequestVerification,
                  isLoading: _isEmailLoading,
                ),
                const SizedBox(width: 8),
                _buildCancelButton(
                  () => setState(() => _showEmailForm = false),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSecuritySection() {
    if (!_showPasswordForm) {
      return _buildCard(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Keep your account secure',
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              ),
              const SizedBox(height: 4),
              Text(
                'Set a strong new password to help keep your account secure.',
                style: TextStyle(
                  fontSize: 13,
                  color: AppColors.text(context, isMuted: true),
                ),
              ),
              const SizedBox(height: 12),
              _buildOutlineButton(
                'Change Password',
                onPressed: () {
                  HapticService.light();
                  setState(() => _showPasswordForm = true);
                },
              ),
            ],
          ),
        ),
      );
    }

    return _buildCard(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            _buildTextField(
              controller: _currentPasswordController,
              label: 'Current Password',
              hint: 'Enter current password',
              obscureText: true,
            ),
            const SizedBox(height: 8),
            _buildTextField(
              controller: _newPasswordController,
              label: 'New Password',
              hint: 'Enter new password',
              obscureText: true,
            ),
            const SizedBox(height: 8),
            _buildTextField(
              controller: _confirmPasswordController,
              label: 'Confirm Password',
              hint: 'Confirm new password',
              obscureText: true,
            ),
            const SizedBox(height: 2),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                GestureDetector(
                  onTap: _isPasswordLoading ? null : _handleForgotPassword,
                  child: Text(
                    'Forgot password',
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.primary.withValues(
                        alpha: _isPasswordLoading ? 0.5 : 1,
                      ),
                    ),
                  ),
                ),
                Row(
                  children: [
                    _buildActionButton(
                      'Save',
                      onPressed: _handleChangePassword,
                      isLoading: _isPasswordLoading,
                    ),
                    const SizedBox(width: 8),
                    _buildCancelButton(
                      () => setState(() => _showPasswordForm = false),
                    ),
                  ],
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAppearanceSection() {
    final themeMode = ref.watch(themeProvider);

    // Sync tab index if changed externally
    if (!_themeTabController.indexIsChanging &&
        _themeTabController.index != _themeModeToIndex(themeMode)) {
      _themeTabController.animateTo(_themeModeToIndex(themeMode));
    }

    return AnimatedContainer(
      duration: const Duration(milliseconds: 300),
      height: 45,
      decoration: BoxDecoration(
        color: AppColors.surface(context, level: 1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.borderColor(context)),
      ),
      child: TabBar(
        controller: _themeTabController,
        overlayColor: WidgetStateProperty.all(Colors.transparent),
        splashFactory: NoSplash.splashFactory,
        indicator: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          color: AppColors.primary.withValues(alpha: 0.1),
          border: Border.all(color: Colors.transparent, width: 0),
        ),
        labelColor: AppColors.primary,
        unselectedLabelColor: AppColors.text(context, isMuted: true),
        labelStyle: AppTextStyles.bodyMedium.copyWith(
          fontWeight: FontWeight.w600,
        ),
        unselectedLabelStyle: AppTextStyles.bodyMedium.copyWith(
          fontWeight: FontWeight.w600,
        ),
        indicatorSize: TabBarIndicatorSize.tab,
        dividerColor: Colors.transparent,
        onTap: (index) => HapticService.selection(),
        tabs: const [
          Tab(text: 'Light'),
          Tab(text: 'System'),
          Tab(text: 'Dark'),
        ],
      ),
    );
  }

  Widget _buildDangerZoneSection() => _buildCard(
      borderColor: AppColors.borderColor(context),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Permanently remove your account',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.text(context),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Deleting your account removes your profile, groups, and activity.',
              style: TextStyle(
                fontSize: 13,
                color: AppColors.text(context, isMuted: true),
              ),
            ),
            const SizedBox(height: 12),
            _buildActionButton(
              'Delete Account',
              onPressed: _handleDeleteAccount,
              isLoading: _isDeleteLoading,
              isDestructive: true,
              height: 36,
              width: double.infinity,
            ),
          ],
        ),
      ),
    );

  Widget _buildLegalSection() => Column(
      children: [
        _buildExpandingList(
          title: 'POLICY DOCUMENTS',
          children: [
            _buildLegalTile(
              'Terms of Service',
              LucideIcons.fileText,
              url: 'https://kovari.in/terms',
            ),
            _buildLegalTile(
              'Privacy Policy',
              LucideIcons.shield,
              url: 'https://kovari.in/privacy',
            ),
            _buildLegalTile(
              'Community Guidelines',
              LucideIcons.bookOpen,
              url: 'https://kovari.in/community-guidelines',
            ),
            _buildLegalTile(
              'Data Deletion Policy',
              LucideIcons.trash2,
              url: 'https://kovari.in/data-deletion',
              isLast: true,
            ),
          ],
        ),
        const SizedBox(height: 24),
        _buildExpandingList(
          title: 'POLICY ACCEPTANCE STATUS',
          children: [
            _buildStatusTile(
              'Terms of Service',
              'Accepted: Mar 4, 2026',
              'Version: 2026-03-03',
            ),
            _buildStatusTile(
              'Privacy Policy',
              'Accepted: Mar 4, 2026',
              'Version: 2026-03-03',
            ),
            _buildStatusTile(
              'Community Guidelines',
              'Accepted: Mar 4, 2026',
              'Version: 2026-03-03',
              isLast: true,
            ),
          ],
        ),
      ],
    );

  Widget _buildExpandingList({
    required String title,
    required List<Widget> children,
  }) => _buildCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: AppColors.surface(context, level: 1),
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(16),
              ),
              border: Border(
                bottom: BorderSide(color: AppColors.borderColor(context)),
              ),
            ),
            child: Text(
              title,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: AppColors.text(context, isMuted: true),
                letterSpacing: 1.2,
              ),
            ),
          ),
          ...children,
        ],
      ),
    );

  Widget _buildStatusTile(
    String title,
    String accepted,
    String version, {
    bool isLast = false,
  }) => Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w400,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    accepted,
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.text(context, isMuted: true),
                    ),
                  ),
                  Text(
                    version,
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.text(context, isMuted: true),
                    ),
                  ),
                ],
              ),
              Container(
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                  color: Color(0xFF22C55E),
                  shape: BoxShape.circle,
                ),
              ),
            ],
          ),
        ),
        if (!isLast) Divider(height: 1, color: AppColors.borderColor(context)),
      ],
    );

  Widget _buildLegalTile(
    String title,
    IconData icon, {
    required String url,
    bool isLast = false,
  }) => Column(
      children: [
        ListTile(
          leading: Icon(
            icon,
            size: 18,
            color: AppColors.text(context, isMuted: true),
          ),
          title: Text(
            title,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w400,
              color: AppColors.text(context),
            ),
          ),
          trailing: Icon(
            LucideIcons.externalLink,
            size: 14,
            color: AppColors.text(context, isMuted: true),
          ),
          onTap: () {
            HapticService.selection();
            launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
          },
          contentPadding: const EdgeInsets.symmetric(horizontal: 16),
          visualDensity: VisualDensity.compact,
        ),
        if (!isLast) Divider(height: 1, color: AppColors.borderColor(context)),
      ],
    );

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    required String hint,
    bool obscureText = false,
    TextInputType keyboardType = TextInputType.text,
  }) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppColors.text(context),
          ),
        ),
        const SizedBox(height: 6),
        SizedBox(
          height: 40,
          child: TextField(
            controller: controller,
            obscureText: obscureText,
            keyboardType: keyboardType,
            style: const TextStyle(fontSize: 13),
            decoration: InputDecoration(
              isDense: true,
              hintText: hint,
              hintStyle: TextStyle(
                color: AppColors.text(context, isMuted: true),
                fontSize: 13,
              ),
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 8,
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: AppColors.borderColor(context)),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: AppColors.borderColor(context)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: const BorderSide(color: AppColors.primary),
              ),
              filled: true,
              fillColor: AppColors.surface(context, level: 2),
            ),
          ),
        ),
      ],
    );

  Widget _buildOutlineButton(String label, {required VoidCallback onPressed}) => SizedBox(
      width: double.infinity,
      height: 40,
      child: OutlinedButton(
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          side: BorderSide(color: AppColors.borderColor(context)),
          backgroundColor: AppColors.cardColor(context),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 16),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w500,
            color: AppColors.text(context),
          ),
        ),
      ),
    );

  Widget _buildCancelButton(VoidCallback onPressed) => SecondaryButton(
      onPressed: onPressed,
      icon: LucideIcons.x,
      width: 32,
      height: 32,
    );

  Widget _buildActionButton(
    String label, {
    required VoidCallback onPressed,
    bool isLoading = false,
    bool isDestructive = false,
    double? width,
    double? height,
  }) => PrimaryButton(
      text: label,
      onPressed: onPressed,
      isLoading: isLoading,
      width: width ?? 0,
      height: height ?? 32,
      backgroundColor: isDestructive
          ? AppColors.destructive
          : AppColors.primary,
      foregroundColor: AppColors.primaryForeground,
      isDestructive: isDestructive,
    );
}
