import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/providers/connectivity_provider.dart';
import 'package:mobile/core/providers/profile_provider.dart';
import 'package:mobile/core/utils/app_logger.dart';
import 'package:mobile/features/home/providers/home_provider.dart';
import 'package:mobile/shared/widgets/kovari_bottom_nav.dart';

class AppShellScreen extends ConsumerStatefulWidget {
  const AppShellScreen({super.key, required this.navigationShell});
  final StatefulNavigationShell navigationShell;

  @override
  ConsumerState<AppShellScreen> createState() => _AppShellScreenState();
}

class _AppShellScreenState extends ConsumerState<AppShellScreen> {
  @override
  Widget build(BuildContext context) {
    // Global connectivity listener
    ref.listen(connectivityProvider, (previous, next) {
      if (next.isOnline && previous?.isOnline == false) {
        AppLogger.i(
          '🌐 Connectivity restored in AppShell. Refreshing current data...',
        );
        ref.read(homeDataProvider.notifier).refresh(isSilent: true);
        ref.read(profileProvider.notifier).fetchProfile();
      }
    });

    return Scaffold(
      body: Stack(
        children: [
          Positioned.fill(child: widget.navigationShell),
          Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: KovariBottomNav(
                currentIndex: widget.navigationShell.currentIndex,
                onTap: (index) {
                  widget.navigationShell.goBranch(
                    index,
                    initialLocation:
                        index == widget.navigationShell.currentIndex,
                  );
                },
              ),
            ),
        ],
      ),
    );
  }
}
