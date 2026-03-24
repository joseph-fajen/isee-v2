/**
 * ISEE v2 — Dashboard Cache
 *
 * Simple in-memory TTL cache for dashboard responses.
 * No external dependencies — appropriate for single-instance deployment.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cache = new Map<string, CacheEntry<any>>();

/**
 * Retrieve a cached value by key.
 * Returns null if the key doesn't exist or the entry has expired.
 */
export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

/**
 * Store a value in the cache with a TTL.
 */
export function setCache<T>(key: string, data: T, ttlSeconds: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/**
 * Invalidate a specific cache key.
 */
export function invalidateCache(key: string): void {
  cache.delete(key);
}

/**
 * Clear all cache entries. Useful for testing.
 */
export function clearCache(): void {
  cache.clear();
}
