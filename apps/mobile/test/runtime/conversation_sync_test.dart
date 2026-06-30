import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/cache/conversation_cache_models.dart';
import 'package:mobile/features/chat/cache/conversation_cache_repository.dart';
import 'package:mobile/features/chat/cache/conversation_repository.dart';
import 'package:mobile/features/chat/cache/conversation_sync_engine.dart';
import 'package:mobile/features/chat/cache/conversation_conflict_resolver.dart';
import 'package:mobile/features/chat/models/message_entity.dart';
import 'package:mocktail/mocktail.dart';

class MockConversationCacheRepository extends Mock implements ConversationCacheRepository {}
class MockConversationRepository extends Mock implements ConversationRepository {}

void main() {
  setUpAll(() {
    registerFallbackValue(
      MessageEntity(
        id: '',
        chatId: '',
        senderId: '',
        createdAt: DateTime.now(),
        deliveryStatus: MessageDeliveryStatus.sent,
      ),
    );
    registerFallbackValue(
      ConversationMetadata(
        conversationId: '',
        lastSequence: 0,
        lastReadSequence: 0,
        lastSyncedAt: DateTime.now(),
        cacheSchemaVersion: 1,
        cachedMessageCount: 0,
      ),
    );
    registerFallbackValue(
      CachedMessage(
        id: '',
        conversationId: '',
        sequence: 0,
        text: '',
        senderId: '',
        createdAt: DateTime.now(),
        status: '',
        messageMigrationVersion: 1,
      ),
    );
    registerFallbackValue(
      ConversationIndex(
        conversationId: '',
        lastMessageSnippet: '',
        lastMessageId: '',
        lastSequence: 0,
        updatedAt: DateTime.now(),
        lastSyncAt: DateTime.now(),
        unreadCount: 0,
        participantIds: [],
        cacheSchemaVersion: 2,
      ),
    );
  });

  group('ConversationSyncEngine Scenario Tests', () {
    late MockConversationCacheRepository mockCache;
    late MockConversationRepository mockRemote;
    late ConversationSyncEngine syncEngine;

    setUp(() {
      mockCache = MockConversationCacheRepository();
      mockRemote = MockConversationRepository();
      syncEngine = ConversationSyncEngine(
        cacheRepository: mockCache,
        remoteRepository: mockRemote,
      );
    });

    test('Scenario A: Load cached messages offline immediately', () async {
      final cachedList = [
        CachedMessage(
          id: 'msg_1',
          conversationId: 'chat_123',
          sequence: 1,
          text: 'Cached Plaintext message',
          senderId: 'user_1',
          createdAt: DateTime.now(),
          status: 'sent',
          messageMigrationVersion: 2,
        ),
      ];

      when(() => mockCache.getMessages('chat_123')).thenReturn(cachedList);

      final result = await syncEngine.loadCachedMessages('chat_123');

      expect(result.length, 1);
      expect(result.first.text, 'Cached Plaintext message');
      expect(result.first.sequence, 1);
    });

    test('Scenario B: Sync delta messages and merge into persistent cache', () async {
      final cachedList = [
        CachedMessage(
          id: 'msg_1',
          conversationId: 'chat_123',
          sequence: 1,
          text: 'Cached message 1',
          senderId: 'user_1',
          createdAt: DateTime.now(),
          status: 'sent',
          messageMigrationVersion: 2,
        ),
      ];

      final meta = ConversationMetadata(
        conversationId: 'chat_123',
        lastSequence: 1,
        lastReadSequence: 1,
        lastSyncedAt: DateTime.now(),
        cacheSchemaVersion: 1,
        cachedMessageCount: 1,
      );

      when(() => mockCache.getMetadata('chat_123')).thenReturn(meta);
      when(() => mockCache.getMessages('chat_123')).thenReturn(cachedList);
      when(() => mockCache.saveMessages(any())).thenAnswer((_) async {});
      when(() => mockCache.saveMetadata(any())).thenAnswer((_) async {});
      when(() => mockCache.saveIndex(any())).thenAnswer((_) async {});

      final remotePayload = {
        'messages': [
          {
            'id': 'msg_2',
            'senderId': 'user_2',
            'text': 'Plaintext delta message 2',
            'message_content': 'Plaintext delta message 2',
            'migration_version': 2,
            'conversation_sequence': 2,
            'created_at': DateTime.now().toIso8601String(),
            'is_encrypted': false,
          }
        ]
      };

      when(() => mockRemote.fetchMessages(
            path: 'direct-chat/messages',
            queryParameters: {
              'partnerId': 'partner_abc',
              'limit': 75,
              'afterSequence': 1,
            },
          )).thenAnswer((_) async => remotePayload);

      await syncEngine.syncDelta(
        chatId: 'chat_123',
        path: 'direct-chat/messages',
        baseParams: {'partnerId': 'partner_abc', 'limit': 75},
        partnerClerkId: 'partner_clerk',
        myUserId: 'my_user_id',
        decryptCallback: (entity) async => entity.text ?? '',
      );

      verify(() => mockCache.saveMessages(any())).called(1);
      verify(() => mockCache.saveMetadata(any())).called(1);
      verify(() => mockCache.saveIndex(any())).called(1);
    });

    test('Scenario D: Real-time socket message append, merge, and persist', () async {
      final cachedList = [
        CachedMessage(
          id: 'msg_1',
          conversationId: 'chat_123',
          sequence: 1,
          text: 'Cached message 1',
          senderId: 'user_1',
          createdAt: DateTime.now(),
          status: 'sent',
          messageMigrationVersion: 2,
        ),
      ];

      when(() => mockCache.getMessages('chat_123')).thenReturn(cachedList);
      when(() => mockCache.getMetadata('chat_123')).thenReturn(null);
      when(() => mockCache.saveMessages(any())).thenAnswer((_) async {});
      when(() => mockCache.saveMetadata(any())).thenAnswer((_) async {});
      when(() => mockCache.saveIndex(any())).thenAnswer((_) async {});

      final socketData = {
        'id': 'msg_2',
        'senderId': 'user_2',
        'text': 'Real-time plaintext message',
        'message_content': 'Real-time plaintext message',
        'migration_version': 2,
        'conversation_sequence': 2,
        'created_at': DateTime.now().toIso8601String(),
        'is_encrypted': false,
      };

      final result = await syncEngine.processRealtimeMessage(
        chatId: 'chat_123',
        data: socketData,
        myUserId: 'my_user_id',
        decryptCallback: (entity) async => entity.text ?? '',
      );

      expect(result.id, 'msg_2');
      expect(result.text, 'Real-time plaintext message');
      expect(result.sequence, 2);
      verify(() => mockCache.saveMessages(any())).called(1);
      verify(() => mockCache.saveMetadata(any())).called(1);
      verify(() => mockCache.saveIndex(any())).called(1);
    });

    test('Conflict Resolver: merges local optimistic and server-acked messages', () {
      final cached = [
        CachedMessage(
          id: 'msg_1',
          conversationId: 'chat_123',
          sequence: 1,
          text: 'Cached message',
          senderId: 'user_1',
          createdAt: DateTime.now(),
          status: 'pending',
          messageMigrationVersion: 2,
        ),
      ];

      final incoming = [
        CachedMessage(
          id: 'msg_1',
          conversationId: 'chat_123',
          sequence: 1,
          text: 'Server ack message',
          senderId: 'user_1',
          createdAt: DateTime.now(),
          status: 'sent',
          messageMigrationVersion: 2,
        ),
      ];

      final result = ConversationConflictResolver.merge(cached: cached, incoming: incoming);
      expect(result.messages.first.status, 'sent');
      expect(result.updated, 1);
    });
  });
}
