class ApiEndpoints {
  static const currentProfile = 'profile/current';
  static const createProfile = 'profile/create';
  static String profileDetail(String userId) => 'profile/$userId';
  static String followers(String userId) => 'profile/$userId/followers';
  static String following(String userId) => 'profile/$userId/following';
  static String removeFollower(String userId) => 'profile/$userId/followers';
  static String unfollow(String userId) => 'profile/$userId/following';
  static String follow(String userId) => 'profile/$userId/followers';

  static const googleAuth = 'auth/google';
  static const emailLogin = 'auth/login';
  static const emailRegister = 'auth/register';
  static const verifyOtp = 'auth/verify-otp';
  static const resendOtp = 'auth/resend-otp';
  static const forgotPassword = 'auth/forgot-password';
  static const resetPassword = 'auth/reset-password';
  static const refresh = 'auth/refresh';
  static const authMe = 'auth/me';
  static const logout = 'auth/logout';

  static const cloudinarySign = 'cloudinary/sign';
  static const home = 'mobile/home';

  // Notifications
  static const notifications = 'notifications';
  static const notificationsUnreadCount = 'notifications/unread-count';
  static const notificationsMarkAllRead = 'notifications/mark-all-read';
  static String notificationMarkRead(String id) => 'notifications/$id';

  // Requests (Interests & Invitations)
  static const interests = 'interests';
  static const interestsRespond = 'interests/respond';
  static const pendingInvitations = 'pending-invitations';
  static const groupInvitation = 'group-invitation';
  static const myGroups = 'mobile/groups';
  static const createGroup = 'mobile/groups';
  static String groupDetails(String groupId) => 'groups/$groupId';
  static String groupMembers(String groupId) => 'groups/$groupId/members';
  static String groupItinerary(String groupId) => 'groups/$groupId/itinerary';
  static String itineraryItem(String groupId, String itemId) =>
      'groups/$groupId/itinerary/$itemId';
  static String groupMembership(String groupId) => 'groups/$groupId/membership';
  static String groupAiOverview(String groupId) =>
      'groups/$groupId/ai-overview';
  static String groupJoin(String groupId) => 'groups/$groupId/join';
  static String groupJoinRequest(String groupId) =>
      'groups/$groupId/join-request';
  static String groupLeave(String groupId) => 'groups/$groupId/leave';
  static String groupDelete(String groupId) => 'groups/$groupId/delete';
  static String groupInvitationLink(String groupId) =>
      'group-invitation?groupId=$groupId';
  static const groupInvitationSend = 'group-invitation';

  // Settings
  static const changePassword = 'settings/change-password';
  static const deleteAccount = 'settings/delete-account';
  static const acceptPolicies = 'settings/accept-policies';

  // Explore
  static const exploreSession = 'session';
  static const matchSolo = 'match-solo';
  static const matchGroups = 'match-groups';
  static const exploreInterest = 'matching/interest';
  static const exploreSkip = 'matching/skip';
  static const exploreReport = 'matching/report';

  // v1 Mobile Specific
  static String v1InviteInfo(String token) => 'v1/invite/$token';
}
