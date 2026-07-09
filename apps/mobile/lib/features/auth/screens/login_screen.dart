import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/navigation/routes.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/core/services/haptic_service.dart';
import 'package:mobile/core/services/local_storage.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_radius.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/core/utils/api_error_handler.dart';
import 'package:mobile/features/auth/services/auth_service.dart';
import 'package:mobile/shared/widgets/app_card.dart';
import 'package:mobile/shared/widgets/auth_divider.dart';
import 'package:mobile/shared/widgets/auth_social_button.dart';
import 'package:mobile/shared/widgets/kovari_snackbar.dart';
import 'package:mobile/shared/widgets/primary_button.dart';
import 'package:mobile/shared/widgets/text_input_field.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _rememberMe = false;
  bool _isLoading = false;
  final _cancelToken = CancelToken();

  final _storage = LocalStorage();

  @override
  void initState() {
    super.initState();
    _loadRememberedData();
  }

  Future<void> _loadRememberedData() async {
    final rememberMe = await _storage.getRememberMe();
    if (rememberMe) {
      final email = await _storage.getRememberedEmail();
      if (mounted && email != null) {
        setState(() {
          _rememberMe = true;
          _emailController.text = email;
        });
      }
    }
  }

  @override
  void dispose() {
    _cancelToken.cancel('LoginScreen disposed');
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    final email = _emailController.text.trim();
    final password = _passwordController.text.trim();

    if (email.isEmpty || password.isEmpty) {
      KovariSnackbar.info(context, 'Please enter email and password');
      return;
    }

    setState(() => _isLoading = true);

    try {
      final authService = ref.read(authServiceProvider);
      final user = await authService.loginWithEmail(
        email,
        password,
        cancelToken: _cancelToken,
      );

      // Save Remember Me preference
      await _storage.saveRememberMe(_rememberMe);
      if (_rememberMe) {
        await _storage.saveRememberedEmail(email);
      } else {
        await _storage.clearRememberedEmail();
      }

      if (mounted) {
        ref.read(authProvider.notifier).setUser(user);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        final errorMessage = e.toString();
        if (errorMessage.contains('BANNED_USER') ||
            (e is DioException &&
                (e.response?.statusCode == 403 ||
                    errorMessage.contains('403')))) {
          // Trigger the AuthProvider to handle state redirection to BannedScreen using the exception details
          ref.read(authProvider.notifier).handleBannedException(e);
        } else {
          KovariSnackbar.error(context, ApiErrorHandler.extractError(e));
        }
      }
    }
  }

  Future<void> _handleGoogleLogin() async {
    setState(() => _isLoading = true);

    try {
      final authService = ref.read(authServiceProvider);
      final user = await authService.loginWithGoogle(cancelToken: _cancelToken);

      if (mounted) {
        ref.read(authProvider.notifier).setUser(user);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        final errorMessage = e.toString();
        if (errorMessage.contains('BANNED_USER') ||
            (e is DioException &&
                (e.response?.statusCode == 403 ||
                    errorMessage.contains('403')))) {
          // Trigger the AuthProvider to handle state redirection to BannedScreen using the exception details
          ref.read(authProvider.notifier).handleBannedException(e);
        } else {
          KovariSnackbar.error(context, ApiErrorHandler.extractError(e));
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: AppColors.backgroundColor(context),
    body: SingleChildScrollView(
      physics: const AlwaysScrollableScrollPhysics(),
      child: Container(
        width: double.infinity,
        constraints: BoxConstraints(
          minHeight: MediaQuery.of(context).size.height,
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Logo
                Image.asset(
                  Theme.of(context).brightness == Brightness.dark
                      ? 'assets/logo_dark.webp'
                      : 'assets/logo.webp',
                  height: 20,
                  fit: BoxFit.contain,
                  errorBuilder: (context, error, stackTrace) => Text(
                    'KOVARI',
                    style: AppTextStyles.h1.copyWith(
                      letterSpacing: 4,
                      fontSize: 28,
                    ),
                  ),
                ),
                const SizedBox(height: 32),

                // Auth Card
                AppCard(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 20,
                    vertical: 24,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Welcome back',
                        style: AppTextStyles.h3.copyWith(
                          color: AppColors.text(context),
                        ),
                      ),
                      // const SizedBox(height: 4),
                      Text(
                        'Log in back to your account',
                        style: AppTextStyles.bodyMedium.copyWith(
                          color: AppColors.text(context, isMuted: true),
                        ),
                      ),
                      const SizedBox(height: 24),

                      AuthSocialButton(
                        text: 'Continue with Google',
                        icon: Image.asset(
                          'assets/google_logo.png',
                          height: 16,
                          width: 16,
                        ),
                        onPressed: _isLoading ? null : _handleGoogleLogin,
                      ),

                      const AuthDivider(),

                      // Form
                      TextInputField(
                        label: 'Email',
                        controller: _emailController,
                        hintText: 'example@example.com',
                        keyboardType: TextInputType.emailAddress,
                        height: 40,
                      ),
                      const SizedBox(height: 16),
                      TextInputField(
                        label: 'Password',
                        controller: _passwordController,
                        hintText: 'Enter password',
                        obscureText: true,
                        height: 40,
                      ),

                      const SizedBox(height: 16),

                      // Remember & Forgot
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Row(
                            children: [
                              SizedBox(
                                width: 20,
                                height: 20,
                                child: Checkbox(
                                  value: _rememberMe,
                                  onChanged: (val) {
                                    HapticService.selection();
                                    setState(() => _rememberMe = val ?? false);
                                  },
                                  activeColor: AppColors.primary,
                                  side: BorderSide(
                                    color: AppColors.borderColor(context),
                                    width: 1.5,
                                  ),
                                  shape: const RoundedRectangleBorder(
                                    borderRadius: AppRadius.extraSmall,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                'Remember me',
                                style: AppTextStyles.bodySmall.copyWith(
                                  color: AppColors.text(context, isMuted: true),
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                          TextButton(
                            onPressed: () {
                              HapticService.selection();
                              const ForgotPasswordRouteData().push<void>(
                                context,
                              );
                            },
                            style: TextButton.styleFrom(
                              padding: EdgeInsets.zero,
                              minimumSize: Size.zero,
                              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                            ),
                            child: Text(
                              'Forgot password',
                              style: AppTextStyles.bodySmall.copyWith(
                                color: AppColors.text(context, isMuted: true),
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 20),

                      // Submit
                      PrimaryButton(
                        text: _isLoading ? 'Signing in...' : 'Log in',
                        onPressed: _isLoading ? null : _handleLogin,
                        isLoading: _isLoading,
                        height: 40,
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 24),

                // Footer Toggle
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      "Don't have an account? ",
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.text(context, isMuted: true),
                      ),
                    ),
                    TextButton(
                      onPressed: () {
                        HapticService.selection();
                        const SignUpRouteData().push<void>(context);
                      },
                      style: TextButton.styleFrom(
                        padding: EdgeInsets.zero,
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: Text(
                        'Create one for free',
                        style: AppTextStyles.bodySmall.copyWith(
                          color: AppColors.text(context),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
