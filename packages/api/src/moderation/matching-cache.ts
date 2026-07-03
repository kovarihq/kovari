import { ensureRedisConnection } from "../redis";

/**
 * Invalidate all matching result cache keys for a user.
 */
export async function invalidateMatchingCache(userId: string): Promise<void> {
  try {
    const isRedisActive =
      !!process.env.REDIS_URL || process.env.NODE_ENV === "development";
    if (!isRedisActive) return;

    const client = await ensureRedisConnection();
    const indexKey = `user:${userId}:match_keys`;
    const keys = await client.sMembers(indexKey);

    if (keys.length > 0) {
      await client.del([...keys, indexKey]);
    }
  } catch (err) {
    console.error("[BanSideEffects] Match cache invalidation failed:", err);
  }
}
