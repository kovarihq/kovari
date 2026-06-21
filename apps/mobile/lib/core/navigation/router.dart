import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/navigation/router_notifier.dart';
import 'package:mobile/core/navigation/routes.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/core/utils/nav_observer.dart';
import 'package:mobile/features/chat/screens/chat_screen.dart';

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

  return router;
});
