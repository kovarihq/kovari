import { redis, ensureRedisConnection } from "@kovari/api";
import { logger } from "@/lib/api/logger";
import { logPerformanceMetric } from "@/lib/observability/performance";

const INTERACTION_CACHE_TTL = 45; // 45 seconds TTL
const REDIS_TIMEOUT = 1000; // 100ms timeout for Redis operations

// Cache key prefixes
const PREFIX_BLOCKS = "cache:interact:blocks:";
const PREFIX_INTERESTS = "cache:interact:interests:";
const PREFIX_SKIPS = "cache:interact:skips:";
const PREFIX_MATCHES = "cache:interact:matches:";
const PREFIX_FOLLOWS = "cache:interact:follows:";

/**
 * High-performance helper to get or set user interaction cache data in Redis.
 * Falls back to DB query seamlessly and logs latency metrics.
 */
export async function getOrSetInteractionCache<T>(
  userId: string,
  type: "blocks" | "interests" | "skips" | "matches" | "follows",
  fetchFn: () => Promise<T>
): Promise<T> {
  const key = `cache:interact:${type}:${userId}`;
  const start = Date.now();

  try {
    await ensureRedisConnection();
    
    // Concurrently race Redis get with a hard timeout to avoid blocking requests
    const cached = await Promise.race([
      redis.get(key),
      new Promise<null>((_, reject) => 
        setTimeout(() => reject(new Error("Redis Timeout")), REDIS_TIMEOUT)
      )
    ]);

    if (cached !== null && cached !== undefined) {
      logPerformanceMetric(`match_solo_route_cache_hit_${type}_ms`, Date.now() - start, { userId, hit: true });
      logPerformanceMetric("match_solo_route_interaction_cache_get_ms", Date.now() - start, { userId, type, hit: true });
      return JSON.parse(cached) as T;
    }
  } catch (err: any) {
    logger.debug(
      "INTERACTION-CACHE-GET-ERROR", 
      { type, userId, error: err?.message || String(err) }
    );
  }

  // Cache miss or Redis error: fetch from Supabase DB
  const data = await fetchFn();

  // Write back to Redis asynchronously
  try {
    await ensureRedisConnection();
    await redis.setEx(key, INTERACTION_CACHE_TTL, JSON.stringify(data));
    logPerformanceMetric(`match_solo_route_cache_hit_${type}_ms`, Date.now() - start, { userId, hit: false });
  } catch (err: any) {
    logger.debug(
      "INTERACTION-CACHE-SET-ERROR", 
      { type, userId, error: err?.message || String(err) }
    );
  }

  logPerformanceMetric("match_solo_route_interaction_cache_get_ms", Date.now() - start, { userId, type, hit: false });
  return data;
}

// Invalidation helpers to keep caching correct and prevent stale interaction data
export async function invalidateBlocksCache(userId: string) {
  try {
    await ensureRedisConnection();
    await redis.del(`${PREFIX_BLOCKS}${userId}`);
    logger.debug("INTERACTION-CACHE-INVALIDATE", { type: "blocks", userId });
  } catch (err: any) {
    logger.error("INTERACTION-CACHE-INVALIDATE", `Invalidate blocks for ${userId} failed`, err);
  }
}

export async function invalidateInterestsCache(userId: string) {
  try {
    await ensureRedisConnection();
    await redis.del(`${PREFIX_INTERESTS}${userId}`);
    logger.debug("INTERACTION-CACHE-INVALIDATE", { type: "interests", userId });
  } catch (err: any) {
    logger.error("INTERACTION-CACHE-INVALIDATE", `Invalidate interests for ${userId} failed`, err);
  }
}

export async function invalidateSkipsCache(userId: string) {
  try {
    await ensureRedisConnection();
    await redis.del(`${PREFIX_SKIPS}${userId}`);
    logger.debug("INTERACTION-CACHE-INVALIDATE", { type: "skips", userId });
  } catch (err: any) {
    logger.error("INTERACTION-CACHE-INVALIDATE", `Invalidate skips for ${userId} failed`, err);
  }
}

export async function invalidateMatchesCache(userId: string) {
  try {
    await ensureRedisConnection();
    await redis.del(`${PREFIX_MATCHES}${userId}`);
    logger.debug("INTERACTION-CACHE-INVALIDATE", { type: "matches", userId });
  } catch (err: any) {
    logger.error("INTERACTION-CACHE-INVALIDATE", `Invalidate matches for ${userId} failed`, err);
  }
}

export async function invalidateFollowsCache(userId: string) {
  try {
    await ensureRedisConnection();
    await redis.del(`${PREFIX_FOLLOWS}${userId}`);
    logger.debug("INTERACTION-CACHE-INVALIDATE", { type: "follows", userId });
  } catch (err: any) {
    logger.error("INTERACTION-CACHE-INVALIDATE", `Invalidate follows for ${userId} failed`, err);
  }
}
