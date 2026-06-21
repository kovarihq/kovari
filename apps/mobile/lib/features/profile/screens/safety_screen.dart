import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:mobile/core/navigation/routes.dart';
import 'package:mobile/core/providers/profile_provider.dart';
import 'package:mobile/core/theme/app_colors.dart';
import 'package:mobile/core/theme/app_spacing.dart';
import 'package:mobile/core/theme/app_text_styles.dart';
import 'package:mobile/features/profile/models/user_profile.dart';
import 'package:mobile/features/profile/providers/safety_provider.dart';
import 'package:mobile/shared/widgets/kovari_snackbar.dart';
import 'package:share_plus/share_plus.dart';
import 'package:url_launcher/url_launcher.dart';

class SafetyScreen extends ConsumerStatefulWidget {
  const SafetyScreen({super.key});

  @override
  ConsumerState<SafetyScreen> createState() => _SafetyScreenState();
}

class _SafetyScreenState extends ConsumerState<SafetyScreen> {
  final GlobalKey _emergencyKey = GlobalKey();

  @override
  void initState() {
    super.initState();
    // Fetch reports on entry
    Future.microtask(() {
      ref.read(safetyProvider.notifier).fetchMyReports();
    });
  }

  @override
  Widget build(BuildContext context) {
    final profile = ref.watch(profileProvider);

    return Scaffold(
      body: Column(
        children: [
          Container(
            color: Theme.of(context).colorScheme.surfaceContainer,
            child: SafeArea(bottom: false, child: _buildHeader(context)),
          ),
          Expanded(
            child: SingleChildScrollView(
              child: Column(
                children: [
                  const SizedBox(height: AppSpacing.lg),
                  _buildHero(context),
                  const SizedBox(height: AppSpacing.xl),
                  _buildActions(context),
                  const SizedBox(height: AppSpacing.xl),
                  if (profile != null) _buildStatus(context, profile),
                  const SizedBox(height: AppSpacing.xl),
                  _buildHowItWorks(context),
                  const SizedBox(height: AppSpacing.xl),
                  _buildGuidelines(context),
                  const SizedBox(height: AppSpacing.xl),
                  _buildEmergencyHelp(context, profile?.userId ?? ''),
                  const SizedBox(height: AppSpacing.lg),
                  _buildSafetyFooter(context),
                  const SizedBox(height: AppSpacing.lg),
                ],
              ),
            ),
          ),
        ],
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
              'Safety & Trust',
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
      onTap: () => context.pop(),
      child: Container(
        padding: const EdgeInsets.all(8),
        child: Icon(
          LucideIcons.arrowLeft,
          size: 20,
          color: AppColors.text(context),
        ),
      ),
    );

  Widget _buildHero(BuildContext context) => Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.xl,
        AppSpacing.md,
        AppSpacing.xl,
        8,
      ),
      child: Column(
        children: [
          const Icon(
            LucideIcons.shieldCheck,
            size: 40,
            color: AppColors.primary,
          ),
          const SizedBox(height: 14),
          Text(
            'Safety & Trust',
            style: AppTextStyles.h2.copyWith(
              fontSize: 26,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.5,
              color: AppColors.text(context),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Reports are manually reviewed to ensure a respectful and secure environment.',
            textAlign: TextAlign.center,
            style: AppTextStyles.bodySmall.copyWith(
              color: AppColors.text(context, isMuted: true),
              fontSize: 14,
              height: 1.5,
            ),
          ),
        ],
      ),
    );

  Widget _buildSectionTitle(BuildContext context, String title) => Padding(
      padding: const EdgeInsets.only(left: 30, right: 20, bottom: 10, top: 8),
      child: Align(
        alignment: Alignment.centerLeft,
        child: Text(
          title.toUpperCase(),
          style: AppTextStyles.bodySmall.copyWith(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: AppColors.text(context, isMuted: true),
            letterSpacing: 1.2,
          ),
        ),
      ),
    );

  Widget _buildGroupedList(BuildContext context, List<Widget> children) => Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: AppColors.surface(context, level: 1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.borderColor(context)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: List.generate(children.length, (index) {
          if (index == children.length - 1) return children[index];
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              children[index],
              Divider(height: 1, color: AppColors.borderColor(context)),
            ],
          );
        }),
      ),
    );

  Widget _buildActions(BuildContext context) => Column(
      children: [
        _buildSectionTitle(context, 'Actions'),
        _buildGroupedList(context, [
          _buildActionRow(
            context,
            icon: LucideIcons.triangleAlert,
            label: 'Report a User',
            onTap: () => _navigateToSearch(context, 'user'),
          ),
          _buildActionRow(
            context,
            icon: LucideIcons.triangleAlert,
            label: 'Report a Group',
            onTap: () => _navigateToSearch(context, 'group'),
          ),
          _buildActionRow(
            context,
            icon: LucideIcons.fileText,
            label: 'View My Reports',
            onTap: () => const MyReportsRouteData().push<void>(context),
          ),
          _buildActionRow(
            context,
            icon: LucideIcons.phoneCall,
            label: 'Emergency Help',
            isDestructive: true,
            onTap: () {
              if (_emergencyKey.currentContext != null) {
                Scrollable.ensureVisible(
                  _emergencyKey.currentContext!,
                  duration: const Duration(milliseconds: 500),
                  curve: Curves.easeInOut,
                );
              }
            },
          ),
        ]),
      ],
    );

  Widget _buildActionRow(
    BuildContext context, {
    required IconData icon,
    required String label,
    required VoidCallback onTap,
    bool isDestructive = false,
  }) => Material(
      color: Colors.transparent,
      child: InkWell(
        overlayColor: WidgetStateProperty.all(Colors.transparent),
        splashFactory: NoSplash.splashFactory,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(6),
                child: Icon(
                  icon,
                  size: 18,
                  color: isDestructive
                      ? AppColors.destructive
                      : AppColors.text(context),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  label,
                  style: AppTextStyles.bodyMedium.copyWith(
                    fontWeight: FontWeight.w400,
                    fontSize: 15,
                    color: isDestructive
                        ? AppColors.destructive
                        : AppColors.text(context),
                  ),
                ),
              ),
              Icon(
                LucideIcons.chevronRight,
                size: 18,
                color: AppColors.text(context, isMuted: true),
              ),
            ],
          ),
        ),
      ),
    );

  Widget _buildStatus(BuildContext context, UserProfile profile) => Column(
      children: [
        _buildSectionTitle(context, 'Your Status'),
        _buildGroupedList(context, [
          _buildStatusRow(
            context,
            icon: LucideIcons.shieldCheck,
            label: 'Identity Level',
            trailing: profile.isVerified
                ? _buildVerifiedBadge()
                : Text(
                    'Unverified',
                    style: AppTextStyles.bodyMedium.copyWith(
                      fontSize: 15,
                      color: AppColors.text(context, isMuted: true),
                    ),
                  ),
          ),
          _buildStatusRow(
            context,
            icon: LucideIcons.clock,
            label: 'Member Since',
            trailing: Text(
              profile.createdAt.isNotEmpty
                  ? _formatDate(profile.createdAt)
                  : 'Recently',
              style: TextStyle(
                fontSize: 15,
                color: AppColors.text(context, isMuted: true),
              ),
            ),
          ),
        ]),
      ],
    );

  Widget _buildStatusRow(
    BuildContext context, {
    required IconData icon,
    required String label,
    required Widget trailing,
  }) => Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(6),
            child: Icon(icon, size: 18, color: AppColors.text(context)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Text(
              label,
              style: AppTextStyles.bodyMedium.copyWith(
                fontWeight: FontWeight.w400,
                fontSize: 15,
                color: AppColors.text(context),
              ),
            ),
          ),
          trailing,
        ],
      ),
    );

  Widget _buildVerifiedBadge() => Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: Colors.green.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: const BoxDecoration(
              color: Colors.green,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 6),
          const Text(
            'Verified',
            style: TextStyle(
              color: Colors.green,
              fontSize: 12,
              fontWeight: FontWeight.bold,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ),
    );

  Widget _buildHowItWorks(BuildContext context) {
    final steps = [
      {'title': '1. Submission', 'desc': 'Flag unsafe behavior securely.'},
      {
        'title': '2. Investigation',
        'desc': 'Moderators review evidence within 24h.',
      },
      {'title': '3. Action Taken', 'desc': 'Violators face warnings or bans.'},
      {'title': '4. Resolution', 'desc': 'You are notified of the outcome.'},
    ];

    return Column(
      children: [
        _buildSectionTitle(context, 'How Reporting Works'),
        _buildGroupedList(context, [
          ...steps.map((step) => Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: 24.0,
                vertical: 16.0,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    step['title']!,
                    style: AppTextStyles.bodyMedium.copyWith(
                      fontWeight: FontWeight.w500,
                      fontSize: 15,
                      color: AppColors.text(context),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    step['desc']!,
                    style: AppTextStyles.bodySmall.copyWith(
                      color: AppColors.text(context, isMuted: true),
                      fontSize: 14,
                      height: 1.4,
                    ),
                  ),
                ],
              ),
            )),
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: 24.0,
              vertical: 16.0,
            ),
            child: RichText(
              text: TextSpan(
                style: AppTextStyles.bodySmall.copyWith(
                  color: AppColors.text(context, isMuted: true),
                  fontSize: 14,
                  height: 1.5,
                ),
                children: const [
                  TextSpan(
                    text: 'Reporting and enforcement are governed by our ',
                  ),
                  TextSpan(
                    text: 'Terms of Service',
                    style: TextStyle(color: AppColors.primary),
                  ),
                  TextSpan(text: ' and '),
                  TextSpan(
                    text: 'Community Guidelines',
                    style: TextStyle(color: AppColors.primary),
                  ),
                  TextSpan(text: '.'),
                ],
              ),
            ),
          ),
        ]),
      ],
    );
  }

  Widget _buildGuidelines(BuildContext context) => Column(
      children: [
        _buildGuidelineSection(context, 'Solo Travel Guidelines', [
          'Share full itinerary with a trusted friend',
          'Research local emergency numbers',
          'Leave quietly if you feel uncomfortable',
        ]),
        const SizedBox(height: AppSpacing.xl),
        _buildGuidelineSection(context, 'Group Travel Guidelines', [
          'Meet in a public space before departing',
          'Discuss budgets and styles clearly upfront',
          'Avoid sharing sensitive financial info',
        ]),
        const SizedBox(height: AppSpacing.xl),
        _buildGuidelineSection(context, 'Real-Life Meetings', [
          'First meeting must be in a well-lit cafe',
          'Arrange your own independent transport',
          'Text a friend when arriving and leaving',
        ]),
      ],
    );

  Widget _buildGuidelineSection(
    BuildContext context,
    String title,
    List<String> tips,
  ) => Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionTitle(context, title),
        Container(
          margin: const EdgeInsets.symmetric(horizontal: 16),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.surface(context, level: 1),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.borderColor(context)),
          ),
          child: Column(
            children: tips.map((tip) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      margin: const EdgeInsets.only(top: 8, left: 4),
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        color: AppColors.borderColor(context),
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Text(
                        tip,
                        style: AppTextStyles.bodySmall.copyWith(
                          color: AppColors.text(context),
                          fontSize: 15,
                        ),
                      ),
                    ),
                  ],
                ),
              )).toList(),
          ),
        ),
      ],
    );

  Widget _buildEmergencyHelp(BuildContext context, String userId) => Column(
      key: _emergencyKey,
      children: [
        _buildSectionTitle(context, 'Emergency Contact'),
        _buildGroupedList(context, [
          _buildEmergencyRow(
            context,
            title: 'National Emergency',
            number: '112',
            onTap: () => _makePhoneCall('112'),
          ),
          _buildEmergencyRow(
            context,
            title: 'Women Helpline',
            number: '1091',
            onTap: () => _makePhoneCall('1091'),
          ),
          _buildEmergencyRow(
            context,
            title: 'Copy Profile Link',
            subtitle: 'For providing to authorities',
            isCall: false,
            onTap: () => _copyProfileLink(context, userId),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: 24.0,
              vertical: 16.0,
            ),
            child: RichText(
              text: TextSpan(
                style: AppTextStyles.bodySmall.copyWith(
                  color: AppColors.text(context, isMuted: true),
                  fontSize: 14,
                  height: 1.5,
                ),
                children: const [
                  TextSpan(
                    text:
                        'If in immediate danger, contact local authorities immediately.',
                  ),
                ],
              ),
            ),
          ),
        ]),
      ],
    );

  Widget _buildEmergencyRow(
    BuildContext context, {
    required String title,
    String? number,
    String? subtitle,
    bool isCall = true,
    required VoidCallback onTap,
  }) => InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: AppTextStyles.bodyMedium.copyWith(
                      fontWeight: FontWeight.w400,
                      fontSize: 15,
                      color: isCall
                          ? AppColors.text(context)
                          : AppColors.primary,
                    ),
                  ),
                  if (isCall && number != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      number,
                      style: AppTextStyles.bodyLarge.copyWith(
                        color: AppColors.destructive,
                        fontWeight: FontWeight.w500,
                        fontSize: 15,
                      ),
                    ),
                  ],
                  if (subtitle != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: AppTextStyles.bodySmall.copyWith(
                        color: AppColors.text(context, isMuted: true),
                        fontSize: 14,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            Icon(
              isCall ? LucideIcons.phoneCall : LucideIcons.link,
              size: 20,
              color: isCall ? AppColors.destructive : AppColors.primary,
            ),
          ],
        ),
      ),
    );

  Widget _buildSafetyFooter(BuildContext context) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 24.0),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            LucideIcons.eye,
            size: 14,
            color: AppColors.text(context, isMuted: true),
          ),
          const SizedBox(width: 6),
          Text(
            'REVIEWED',
            style: TextStyle(
              fontSize: 11,
              color: AppColors.text(context, isMuted: true),
              letterSpacing: 1.5,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(width: 16),
          Container(
            width: 4,
            height: 4,
            decoration: BoxDecoration(
              color: AppColors.borderColor(context),
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 16),
          Icon(
            LucideIcons.lock,
            size: 14,
            color: AppColors.text(context, isMuted: true),
          ),
          const SizedBox(width: 6),
          Text(
            'ENCRYPTED',
            style: TextStyle(
              fontSize: 11,
              color: AppColors.text(context, isMuted: true),
              letterSpacing: 1.5,
              fontWeight: FontWeight.w500,
            ),
          ),
        ],
      ),
    );

  void _navigateToSearch(BuildContext context, String type) {
    ReportTargetSearchRouteData(targetType: type).push<void>(context);
  }

  String _formatDate(String dateStr) {
    try {
      final date = DateTime.parse(dateStr);
      final months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
      return '${months[date.month - 1]} ${date.day}, ${date.year}';
    } catch (e) {
      return dateStr;
    }
  }

  Future<void> _makePhoneCall(String phoneNumber) async {
    final launchUri = Uri(scheme: 'tel', path: phoneNumber);
    if (await canLaunchUrl(launchUri)) {
      await launchUrl(launchUri);
    }
  }

  void _copyProfileLink(BuildContext context, String userId) {
    final link = 'https://kovari.in/profile/$userId';
    // ignore: deprecated_member_use
    Share.share(link, subject: 'My Kovari Profile Link');
    KovariSnackbar.success(context, 'Profile link copied to clipboard');
  }
}
