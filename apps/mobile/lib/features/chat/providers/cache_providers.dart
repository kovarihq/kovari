import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile/core/providers/auth_provider.dart';
import 'package:mobile/core/network/api_client.dart';
import 'package:mobile/core/realtime/socket_service.dart';
import 'package:mobile/features/chat/cache/conversation_cache_repository.dart';
import 'package:mobile/features/chat/cache/conversation_repository.dart';
import 'package:mobile/features/chat/cache/conversation_sync_engine.dart';
import 'package:mobile/features/chat/cache/conversation_cache_models.dart';

// Dynamically retrieves dynamic ConversationCacheRepository based on current userId.
final conversationCacheRepositoryProvider = Provider.family<ConversationCacheRepository, String>((ref, userId) {
  return ConversationCacheRepository(userId: userId);
});

final conversationRepositoryProvider = Provider<ConversationRepository>((ref) {
  final apiClient = ref.read(apiClientProvider);
  final socketService = ref.read(socketServiceProvider.notifier);
  return ConversationRepository(apiClient: apiClient, socketService: socketService);
});

final conversationSyncEngineProvider = Provider.family<ConversationSyncEngine, String>((ref, userId) {
  final cacheRepository = ref.read(conversationCacheRepositoryProvider(userId));
  final remoteRepository = ref.read(conversationRepositoryProvider);
  return ConversationSyncEngine(cacheRepository: cacheRepository, remoteRepository: remoteRepository);
});
