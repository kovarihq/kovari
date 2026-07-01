class CachePolicy {
  final int maxConversations;
  final int maxMessagesPerConversation;
  final int maxStorageMB;
  final Duration ttl;
  final int pruneBatchSize;

  const CachePolicy({
    this.maxConversations = 100,
    this.maxMessagesPerConversation = 500,
    this.maxStorageMB = 100,
    this.ttl = const Duration(days: 30),
    this.pruneBatchSize = 50,
  });
}
