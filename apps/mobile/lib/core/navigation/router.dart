import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/navigation/router_notifier.dart';
import 'package:mobile/core/navigation/routes.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/core/services/fcm_service.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/core/utils/nav_observer.dart';
import 'package:mobile/features/chat/providers/conversation_store.dart';
import 'package:mobile/features/chat/screens/chat_screen.dart';
import 'package:mobile/features/chat/utils/direct_chat_id.dart';
import 'package:mobile/features/groups/providers/entity_stores.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final notifier = ref.watch(routerNotifierProvider);

  final router = GoRouter(
    initialLocation: '/',
    refreshListenable: notifier,
    debugLogDiagnostics: true,
    redirect: notifier.redirect,
    observers: [KovariNavObserver(ref)],
    routes: [
      ...$appRoutes,
      GoRoute(
        path: '/chat/:chatId',
        name: 'chat_screen',
        builder: (context, state) {
          final chatId = state.pathParameters['chatId']!;
          return ChatScreen(chatId: chatId);
        },
      ),
    ],
    errorBuilder: (context, state) =>
        Scaffold(body: Center(child: Text('Error: ${state.error}'))),
  );

  // Initialize AppLinks listener
  final appLinks = AppLinks();

  // Listen to incoming deep links (when app is in background/foreground)
  appLinks.uriLinkStream.listen((uri) {
    AppLogger.i('🔗 [DeepLink] Incoming Uri: $uri');
    var path = uri.path;
    if (path.isNotEmpty) {
      if (path.startsWith('/invite/')) {
        path = path.replaceFirst('/invite/', '/groups/invite/');
      }
      final location = uri.queryParameters.isEmpty
          ? path
          : Uri(path: path, queryParameters: uri.queryParameters).toString();
      AppLogger.i('🔗 [DeepLink] Routing to: $location');
      router.go(location);
    }
  });

  // Handle the initial link (when app is launched from a terminated state)
  appLinks.getInitialLink().then((uri) {
    if (uri != null) {
      AppLogger.i('🔗 [DeepLink] Initial Uri: $uri');
      var path = uri.path;
      if (path.isNotEmpty) {
        if (path.startsWith('/invite/')) {
          path = path.replaceFirst('/invite/', '/groups/invite/');
        }
        final location = uri.queryParameters.isEmpty
            ? path
            : Uri(path: path, queryParameters: uri.queryParameters).toString();
        AppLogger.i('🔗 [DeepLink] Routing initial link to: $location');
        router.go(location);
      }
    }
  });

  // 🔔 [FCM] Notification tap routing
  // entity_type + entity_id are included in every FCM data payload by PushService.
  FCMService.onNotificationEvent.listen((data) {
    // Foreground events are NOT routed — they are shown as toasts by the shell.
    final isForeground = data['__foreground'] == true;
    if (isForeground) return;

    final entityType = data['entity_type'] as String?;
    final entityId = data['entity_id'] as String?;

    AppLogger.i('🔔 [FCM] Routing tap: entityType=$entityType entityId=$entityId');

    switch (entityType) {
      case 'chat':
        if (entityId != null) {
          String targetChatId = entityId;
          final chatType = data['chat_type'] as String?;
          final isGroup = chatType == 'group';
          
          if (!isGroup && !entityId.contains('_')) {
            final hasGroup = ref.read(groupStoreProvider).containsKey(entityId);
            final hasConversation = ref.read(conversationStoreProvider).containsKey(entityId);
            if (!hasGroup && !hasConversation) {
              final myUuid = ref.read(authProvider).user?.resolvedUuid;
              if (myUuid != null) {
                targetChatId = directChatId(myUuid, entityId);
              }
            }
          }
          router.push('/chat/$targetChatId');
        }
      case 'group':
        if (entityId != null) router.push('/groups/$entityId');
      case 'match':
        if (entityId != null) {
          final type = data['type'] as String?;
          if (type == 'MATCH_ACCEPTED') {
            final myUuid = ref.read(authProvider).user?.resolvedUuid;
            if (myUuid != null) {
              final targetChatId = directChatId(myUuid, entityId);
              router.push('/chat/$targetChatId');
              break;
            }
          }
        }
        router.push('/requests');
      case 'request':
        router.push('/requests');
      case 'notification':
        router.push('/notifications');
      default:
        AppLogger.w('🔔 [FCM] Unknown entityType: $entityType — routing to notifications.');
        router.push('/notifications');
    }
  });

  return router;
});
