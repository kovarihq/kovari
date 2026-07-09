import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/shared/models/kovari_user.dart';
import 'package:url_launcher/url_launcher.dart';

class BannedScreen extends ConsumerStatefulWidget {
  const BannedScreen({super.key, this.user});
  final KovariUser? user;

  @override
  ConsumerState<BannedScreen> createState() => _BannedScreenState();
}

class _BannedScreenState extends ConsumerState<BannedScreen> {
  bool _isSigningOut = false;
  bool _isContacting = false;

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final activeUser = widget.user ?? auth.user;

    // Prefer the explicit ban expiry from AuthState (parsed from 403 response)
    // so suspensions are detected even when activeUser is null (fresh banned login).
    final banExpiresAt = auth.banExpiresAt ?? activeUser?.banExpiresAt;
    final banReason = auth.banReason ?? activeUser?.banReason;

    final isSuspended = banExpiresAt != null && banExpiresAt.isNotEmpty;
    final title = isSuspended ? 'Account suspended' : 'Account banned';
    final message = isSuspended
        ? 'Your account is temporarily suspended due to a violation of our terms of service.'
        : 'Your account is permanently banned due to a violation of our terms of service.';

    // Format expiry date exactly like the web: "Jul 9, 2025, 2:30 PM"
    String? expiryFormatted;
    if (isSuspended) {
      try {
        expiryFormatted = DateFormat(
          'MMM d, yyyy, h:mm a',
        ).format(DateTime.parse(banExpiresAt!).toLocal());
      } catch (_) {
        expiryFormatted = banExpiresAt;
      }
    }

    return Scaffold(
      backgroundColor: AppColors.backgroundColor(context),
      body: Stack(
        children: [
          // Subtle red glow — matches web's bg-destructive/5 blur-[100px]
          Positioned.fill(
            child: Center(
              child: IgnorePointer(
                child: Container(
                  width: 500,
                  height: 500,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        const Color(0xFFEF4444).withOpacity(0.07),
                        Colors.transparent,
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),

          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(
                  horizontal: 20,
                  vertical: 24,
                ),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 480),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      // Branding Logo — same as web
                      Image.asset(
                        Theme.of(context).brightness == Brightness.dark
                            ? 'assets/logo_dark.webp'
                            : 'assets/logo.webp',
                        height: 20,
                        fit: BoxFit.contain,
                        errorBuilder: (_, __, ___) => Text(
                          'KOVARI',
                          style: AppTextStyles.h1.copyWith(
                            letterSpacing: 4,
                            fontSize: 28,
                          ),
                        ),
                      ),
                      const SizedBox(height: 28),

                      // Card — matches web: rounded-lg border bg-card shadow-none
                      Container(
                        width: double.infinity,
                        decoration: BoxDecoration(
                          color: AppColors.isDark(context)
                              ? AppColors.cardDark
                              : AppColors.card,
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(
                            color: AppColors.borderColor(context),
                          ),
                        ),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            // Card body — px-5 py-5 sm:py-7 sm:px-7
                            Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 24,
                                vertical: 24,
                              ),
                              child: Column(
                                children: [
                                  // Text Content — centered, typography-focused
                                  Text(
                                    title,
                                    style: AppTextStyles.h2.copyWith(
                                      fontSize: 20,
                                      fontWeight: FontWeight.w600,
                                      letterSpacing: -0.3,
                                    ),
                                    textAlign: TextAlign.center,
                                  ),
                                  const SizedBox(height: 12),
                                  ConstrainedBox(
                                    constraints: const BoxConstraints(
                                      maxWidth: 340,
                                    ),
                                    child: Text(
                                      message,
                                      style: AppTextStyles.bodyMedium.copyWith(
                                        color: AppColors.text(
                                          context,
                                          isMuted: true,
                                        ),
                                        height: 1.55,
                                        fontSize: 14.5,
                                      ),
                                      textAlign: TextAlign.center,
                                    ),
                                  ),

                                  // Suspension expiry box — column layout to prevent overflow on narrow screens
                                  if (isSuspended &&
                                      expiryFormatted != null) ...[
                                    const SizedBox(height: 20),
                                    Container(
                                      width: double.infinity,
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 14,
                                        vertical: 14,
                                      ),
                                      decoration: BoxDecoration(
                                        color: AppColors.surface(context),
                                        borderRadius: BorderRadius.circular(12),
                                        border: Border.all(
                                          color: AppColors.borderColor(context),
                                        ),
                                      ),
                                      child: Column(
                                        crossAxisAlignment:
                                            CrossAxisAlignment.start,
                                        children: [
                                          Text(
                                            'Suspension active until',
                                            style: AppTextStyles.bodyMedium
                                                .copyWith(
                                                  fontWeight: FontWeight.w500,
                                                  fontSize: 13.5,
                                                  color: AppColors.text(
                                                    context,
                                                  ),
                                                ),
                                          ),
                                          const SizedBox(height: 4),
                                          Text(
                                            expiryFormatted,
                                            style: AppTextStyles.bodyMedium
                                                .copyWith(
                                                  fontSize: 13,
                                                  color: AppColors.text(
                                                    context,
                                                    isMuted: true,
                                                  ),
                                                  letterSpacing: -0.3,
                                                ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ],

                                  // Ban reason (optional)
                                  if (banReason != null &&
                                      banReason.isNotEmpty) ...[
                                    const SizedBox(height: 12),
                                    Container(
                                      width: double.infinity,
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 14,
                                        vertical: 12,
                                      ),
                                      decoration: BoxDecoration(
                                        color: const Color(
                                          0xFFEF4444,
                                        ).withOpacity(0.06),
                                        borderRadius: BorderRadius.circular(10),
                                        border: Border.all(
                                          color: const Color(
                                            0xFFEF4444,
                                          ).withOpacity(0.18),
                                        ),
                                      ),
                                      child: Text(
                                        'Reason: $banReason',
                                        style: AppTextStyles.bodySmall.copyWith(
                                          color: const Color(0xFFEF4444),
                                          fontSize: 13,
                                        ),
                                        textAlign: TextAlign.center,
                                      ),
                                    ),
                                  ],

                                  // Action Buttons — mt-8 flex flex-col gap-3 (matches web)
                                  const SizedBox(height: 24),
                                  _ContactSupportButton(
                                    isLoading: _isContacting,
                                    onPressed: () async {
                                      setState(() => _isContacting = true);
                                      await _launchMail();
                                      if (mounted) {
                                        setState(() => _isContacting = false);
                                      }
                                    },
                                  ),
                                  const SizedBox(height: 10),
                                  _SignOutButton(
                                    isLoading: _isSigningOut,
                                    onPressed: () async {
                                      setState(() => _isSigningOut = true);
                                      await ref
                                          .read(authProvider.notifier)
                                          .logout();
                                    },
                                  ),
                                ],
                              ),
                            ),

                            // Footer — border-t border-border/40 px-6 py-4 text-center
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(
                                horizontal: 24,
                                vertical: 14,
                              ),
                              decoration: BoxDecoration(
                                border: Border(
                                  top: BorderSide(
                                    color: AppColors.borderColor(
                                      context,
                                    ).withOpacity(0.6),
                                  ),
                                ),
                              ),
                              child: Center(
                                child: GestureDetector(
                                  onTap: () => _launchUrl(
                                    'https://kovari.in/community-guidelines',
                                  ),
                                  child: RichText(
                                    text: TextSpan(
                                      style: AppTextStyles.bodySmall.copyWith(
                                        color: AppColors.text(
                                          context,
                                          isMuted: true,
                                        ),
                                        fontSize: 12,
                                      ),
                                      children: [
                                        const TextSpan(text: 'Review our '),
                                        TextSpan(
                                          text: 'Community Guidelines',
                                          style: AppTextStyles.bodySmall
                                              .copyWith(
                                                fontSize: 12,
                                                color: AppColors.text(
                                                  context,
                                                  isMuted: true,
                                                ),
                                                decoration:
                                                    TextDecoration.underline,
                                                decorationColor: AppColors.text(
                                                  context,
                                                  isMuted: true,
                                                ),
                                              ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _launchUrl(String url) async {
    final uri = Uri.parse(url);
    try {
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      }
    } catch (_) {}
  }

  Future<void> _launchMail() async {
    final emailUri = Uri(
      scheme: 'mailto',
      path: 'support@kovari.in',
      query: 'subject=Account Restricted&body=Hello Support Team,',
    );
    try {
      if (await canLaunchUrl(emailUri)) {
        await launchUrl(emailUri);
      }
    } catch (_) {}
  }
}

// ─── Sub-widgets (mirrors web BannedActionButtons) ───────────────────────────

class _ContactSupportButton extends StatelessWidget {
  const _ContactSupportButton({
    required this.isLoading,
    required this.onPressed,
  });
  final bool isLoading;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: OutlinedButton.icon(
        onPressed: isLoading ? null : onPressed,
        style: OutlinedButton.styleFrom(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          side: BorderSide(color: AppColors.borderColor(context)),
          backgroundColor: AppColors.surface(context),
          foregroundColor: AppColors.text(context),
        ),
        icon: isLoading
            ? SizedBox(
                width: 16,
                height: 16,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: AppColors.text(context),
                ),
              )
            : Icon(
                LucideIcons.mail,
                size: 16,
                color: AppColors.text(context, isMuted: true),
              ),
        label: const Text('Contact Support'),
      ),
    );
  }
}

class _SignOutButton extends StatelessWidget {
  const _SignOutButton({required this.isLoading, required this.onPressed});
  final bool isLoading;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 48,
      child: ElevatedButton(
        onPressed: isLoading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          elevation: 0,
        ),
        child: isLoading
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : const Text(
                'Sign Out',
                style: TextStyle(fontWeight: FontWeight.w500),
              ),
      ),
    );
  }
}
