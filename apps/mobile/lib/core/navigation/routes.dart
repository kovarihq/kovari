import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/features/app_shell/screens/app_shell_screen.dart';
import 'package:mobile/features/auth/screens/banned_screen.dart';
import 'package:mobile/features/auth/screens/forgot_password_screen.dart';
import 'package:mobile/features/auth/screens/login_screen.dart';
import 'package:mobile/features/auth/screens/reset_password_screen.dart';
import 'package:mobile/features/auth/screens/sign_up_screen.dart';
import 'package:mobile/features/auth/screens/verify_email_screen.dart';
import 'package:mobile/features/chat/screens/chat_inbox_screen.dart';
import 'package:mobile/features/chat/screens/chat_screen.dart';
import 'package:mobile/features/explore/screens/explore_screen.dart';
import 'package:mobile/features/groups/screens/create_group_screen.dart';
import 'package:mobile/features/groups/screens/group_details_screen.dart';
import 'package:mobile/features/groups/screens/group_invite_screen.dart';
import 'package:mobile/features/groups/screens/groups_screen.dart';
import 'package:mobile/features/home/screens/home_screen.dart';
import 'package:mobile/features/notifications/screens/notifications_screen.dart';
import 'package:mobile/features/onboarding/screens/onboarding_screen.dart';
import 'package:mobile/features/profile/screens/connections_screen.dart';
import 'package:mobile/features/profile/screens/edit_profile_screen.dart';
import 'package:mobile/features/profile/screens/my_reports_screen.dart';
import 'package:mobile/features/profile/screens/profile_screen.dart';
import 'package:mobile/features/profile/screens/public_profile_screen.dart';
import 'package:mobile/features/profile/screens/report_target_search_screen.dart';
import 'package:mobile/features/profile/screens/safety_screen.dart';
import 'package:mobile/features/profile/screens/settings_screen.dart';
import 'package:mobile/features/profile/screens/submit_report_screen.dart';
import 'package:mobile/features/requests/screens/requests_screen.dart';
import 'package:mobile/features/search/screens/search_screen.dart';

part 'routes.g.dart';

/// 🌍 [ShellBranch] - The foundation for persistent tab state.
/// Each branch maintains its own Navigator stack.

@TypedStatefulShellRoute<AppShellRouteData>(
  branches: [
    TypedStatefulShellBranch<HomeBranchData>(
      routes: [TypedGoRoute<HomeRouteData>(path: '/')],
    ),
    TypedStatefulShellBranch<ExploreBranchData>(
      routes: [TypedGoRoute<ExploreRouteData>(path: '/explore')],
    ),
    TypedStatefulShellBranch<ChatBranchData>(
      routes: [TypedGoRoute<ChatRouteData>(path: '/chat')],
    ),
    TypedStatefulShellBranch<GroupsBranchData>(
      routes: [TypedGoRoute<GroupsRouteData>(path: '/groups')],
    ),
    TypedStatefulShellBranch<ProfileBranchData>(
      routes: [TypedGoRoute<ProfileRouteData>(path: '/profile')],
    ),
  ],
)
class AppShellRouteData extends StatefulShellRouteData {
  const AppShellRouteData();

  @override
  Widget builder(
    BuildContext context,
    GoRouterState state,
    StatefulNavigationShell navigationShell,
  ) => AppShellScreen(navigationShell: navigationShell);
}

// Branches
class HomeBranchData extends StatefulShellBranchData {
  const HomeBranchData();
}

class ExploreBranchData extends StatefulShellBranchData {
  const ExploreBranchData();
}

class ChatBranchData extends StatefulShellBranchData {
  const ChatBranchData();
}

class GroupsBranchData extends StatefulShellBranchData {
  const GroupsBranchData();
}

class ProfileBranchData extends StatefulShellBranchData {
  const ProfileBranchData();
}

// Leaf Routes
class HomeRouteData extends GoRouteData with $HomeRouteData {
  const HomeRouteData();
  @override
  Widget build(BuildContext context, GoRouterState state) => const HomeScreen();
}

class ExploreRouteData extends GoRouteData with $ExploreRouteData {
  const ExploreRouteData();
  @override
  Widget build(BuildContext context, GoRouterState state) =>
      const ExploreScreen();
}

class ChatRouteData extends GoRouteData with $ChatRouteData {
  const ChatRouteData();
  @override
  Widget build(BuildContext context, GoRouterState state) =>
      const ChatInboxScreen();
}

class GroupsRouteData extends GoRouteData with $GroupsRouteData {
  const GroupsRouteData();
  @override
  Widget build(BuildContext context, GoRouterState state) =>
      const GroupsScreen();
}

Page<T> platformPageRoute<T>({
  required BuildContext context,
  required GoRouterState state,
  required Widget child,
}) {
  final platform = Theme.of(context).platform;
  if (platform == TargetPlatform.iOS || platform == TargetPlatform.macOS) {
    return CupertinoPage<T>(
      key: state.pageKey,
      restorationId: state.pageKey.value,
      child: child,
    );
  }
  return MaterialPage<T>(
    key: state.pageKey,
    restorationId: state.pageKey.value,
    child: child,
  );
}

@TypedGoRoute<CreateGroupRouteData>(path: '/groups/create')
class CreateGroupRouteData extends GoRouteData with $CreateGroupRouteData {
  const CreateGroupRouteData();
  @override
  Page<void> buildPage(BuildContext context, GoRouterState state) =>
      platformPageRoute<void>(context: context, state: state, child: const CreateGroupScreen());
}

@TypedGoRoute<GroupDetailsRouteData>(path: '/groups/:groupId')
class GroupDetailsRouteData extends GoRouteData with $GroupDetailsRouteData {
  const GroupDetailsRouteData({required this.groupId});
  final String groupId;

  @override
  Page<void> buildPage(BuildContext context, GoRouterState state) {
    final tabStr = state.uri.queryParameters['tab'];
    final initialTab = tabStr != null ? int.tryParse(tabStr) ?? 0 : 0;
    return platformPageRoute<void>(
      context: context,
      state: state,
      child: GroupDetailsScreen(groupId: groupId, initialTabIndex: initialTab),
    );
  }
}

@TypedGoRoute<GroupInviteRouteData>(path: '/groups/invite/:token')
class GroupInviteRouteData extends GoRouteData with $GroupInviteRouteData {
  const GroupInviteRouteData({required this.token});
  final String token;
  @override
  Page<void> buildPage(BuildContext context, GoRouterState state) =>
      platformPageRoute<void>(context: context, state: state, child: GroupInviteScreen(token: token));
}

@TypedGoRoute<EditProfileRouteData>(path: '/profile/edit')
class EditProfileRouteData extends GoRouteData with $EditProfileRouteData {
  const EditProfileRouteData();
  @override
  Page<void> buildPage(BuildContext context, GoRouterState state) =>
      platformPageRoute<void>(context: context, state: state, child: const EditProfileScreen());
}

@TypedGoRoute<SettingsRouteData>(path: '/profile/settings')
class SettingsRouteData extends GoRouteData with $SettingsRouteData {
  const SettingsRouteData();
  @override
  Page<void> buildPage(BuildContext context, GoRouterState state) =>
      platformPageRoute<void>(context: context, state: state, child: const SettingsScreen());
}

@TypedGoRoute<SafetyRouteData>(path: '/profile/safety')
class SafetyRouteData extends GoRouteData with $SafetyRouteData {
  const SafetyRouteData();
  @override
  Page<void> buildPage(BuildContext context, GoRouterState state) =>
      platformPageRoute<void>(context: context, state: state, child: const SafetyScreen());
}

@TypedGoRoute<MyReportsRouteData>(path: '/profile/reports')
class MyReportsRouteData extends GoRouteData with $MyReportsRouteData {
  const MyReportsRouteData();
  @override
  Page<void> buildPage(BuildContext context, GoRouterState state) =>
      platformPageRoute<void>(context: context, state: state, child: const MyReportsScreen());
}

@TypedGoRoute<ReportTargetSearchRouteData>(path: '/profile/reports/search')
class ReportTargetSearchRouteData extends GoRouteData
    with $ReportTargetSearchRouteData {
  const ReportTargetSearchRouteData({required this.targetType});
  final String targetType;
  @override
  Page<void> buildPage(BuildContext context, GoRouterState state) =>
      platformPageRoute<void>(context: context, state: state, child: ReportTargetSearchScreen(targetType: targetType));
}

@TypedGoRoute<SubmitReportRouteData>(path: '/profile/reports/submit/:targetId')
class SubmitReportRouteData extends GoRouteData with $SubmitReportRouteData {
  const SubmitReportRouteData({
    required this.targetType,
    required this.targetId,
    required this.targetName,
  });
  final String targetType;
  final String targetId;
  final String targetName;

  @override
  Page<void> buildPage(BuildContext context, GoRouterState state) => platformPageRoute<void>(
    context: context,
    state: state,
    child: SubmitReportScreen(
      targetType: targetType,
      targetId: targetId,
      targetName: targetName,
    ),
  );
}

@TypedGoRoute<ConnectionsRouteData>(path: '/user/:userId/connections')
class ConnectionsRouteData extends GoRouteData with $ConnectionsRouteData {
  const ConnectionsRouteData({
    required this.userId,
    required this.username,
    this.initialTab,
  });
  final String userId;
  final String username;
  final String? initialTab;

  @override
  Page<void> buildPage(BuildContext context, GoRouterState state) => platformPageRoute<void>(
    context: context,
    state: state,
    child: ConnectionsScreen(
      userId: userId,
      username: username,
      initialTab: initialTab ?? 'followers',
    ),
  );
}

class ProfileRouteData extends GoRouteData with $ProfileRouteData {
  const ProfileRouteData();
  @override
  Widget build(BuildContext context, GoRouterState state) =>
      const ProfileScreen();
}

// 🛡️ [Top Level Routes] - Non-Shell Screens
@TypedGoRoute<LoginRouteData>(path: '/login')
class LoginRouteData extends GoRouteData with $LoginRouteData {
  const LoginRouteData();
  @override
  Page<void> buildPage(BuildContext context, GoRouterState state) =>
      platformPageRoute<void>(context: context, state: state, child: const LoginScreen());
}

@TypedGoRoute<OnboardingRouteData>(path: '/onboarding')
class OnboardingRouteData extends GoRouteData with $OnboardingRouteData {
  const OnboardingRouteData();
  @override
  Page<void> buildPage(BuildContext context, GoRouterState state) =>
      platformPageRoute<void>(context: context, state: state, child: const OnboardingScreen());
}

@TypedGoRoute<BannedRouteData>(path: '/banned')
class BannedRouteData extends GoRouteData with $BannedRouteData {
  const BannedRouteData();
  @override
  Page<void> buildPage(BuildContext context, GoRouterState state) =>
      platformPageRoute<void>(context: context, state: state, child: const BannedScreen());
}

@TypedGoRoute<ResetPasswordRouteData>(path: '/reset-password')
class ResetPasswordRouteData extends GoRouteData with $ResetPasswordRouteData {
  const ResetPasswordRouteData({this.token});
  final String? token;

  @override
  Page<void> buildPage(BuildContext context, GoRouterState state) =>
      platformPageRoute<void>(context: context, state: state, child: ResetPasswordScreen(token: token ?? ''));
}

@TypedGoRoute<SignUpRouteData>(path: '/sign-up')
class SignUpRouteData extends GoRouteData with $SignUpRouteData {
  const SignUpRouteData();
  @override
  Page<void> buildPage(BuildContext context, GoRouterState state) =>
      platformPageRoute<void>(context: context, state: state, child: const SignUpScreen());
}

@TypedGoRoute<VerifyEmailRouteData>(path: '/verify-email')
class VerifyEmailRouteData extends GoRouteData with $VerifyEmailRouteData {
  const VerifyEmailRouteData({required this.email});
  final String email;

  @override
  Page<void> buildPage(BuildContext context, GoRouterState state) =>
      platformPageRoute<void>(context: context, state: state, child: VerifyEmailScreen(email: email));
}

@TypedGoRoute<ForgotPasswordRouteData>(path: '/forgot-password')
class ForgotPasswordRouteData extends GoRouteData
    with $ForgotPasswordRouteData {
  const ForgotPasswordRouteData();
  @override
  Page<void> buildPage(BuildContext context, GoRouterState state) =>
      platformPageRoute<void>(context: context, state: state, child: const ForgotPasswordScreen());
}

@TypedGoRoute<SearchRouteData>(path: '/search')
class SearchRouteData extends GoRouteData with $SearchRouteData {
  const SearchRouteData();
  @override
  Page<void> buildPage(BuildContext context, GoRouterState state) =>
      platformPageRoute<void>(context: context, state: state, child: const SearchScreen());
}

// 🔔 [Overlay Routes] - Slide over the shell without affecting bottom nav
@TypedGoRoute<NotificationsRouteData>(path: '/notifications')
class NotificationsRouteData extends GoRouteData with $NotificationsRouteData {
  const NotificationsRouteData();
  @override
  Page<void> buildPage(BuildContext context, GoRouterState state) =>
      platformPageRoute<void>(context: context, state: state, child: const NotificationsScreen());
}

@TypedGoRoute<RequestsRouteData>(path: '/requests')
class RequestsRouteData extends GoRouteData with $RequestsRouteData {
  const RequestsRouteData();
  @override
  Page<void> buildPage(BuildContext context, GoRouterState state) =>
      platformPageRoute<void>(context: context, state: state, child: const RequestsScreen());
}

@TypedGoRoute<PublicProfileRouteData>(path: '/user/:userId')
class PublicProfileRouteData extends GoRouteData with $PublicProfileRouteData {
  const PublicProfileRouteData({required this.userId});
  final String userId;

  @override
  Page<void> buildPage(BuildContext context, GoRouterState state) =>
      platformPageRoute<void>(context: context, state: state, child: PublicProfileScreen(userId: userId));
}
