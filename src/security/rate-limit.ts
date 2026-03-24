/**
 * ISEE v2 — Rate Limiting (Token Bucket)
 *
 * Implements the token bucket algorithm backed by the `rate_limit_buckets`
 * SQLite table. Each bucket is identified by a string key:
 *   - 'apikey:<id>'  — per API key limit
 *   - 'ip:<addr>'    — per IP limit (unauthenticated)
 *   - 'global'       — cluster-wide limit
 *
 * The refill rate is `limit / windowSeconds` tokens per second.
 * Buckets start at `burst` tokens and are capped at `burst`.
 */

import { getDatabase } from '../db/connection';
import type { RateLimitConfig, RateLimitStatus } from '../types';

// ---------------------------------------------------------------------------
// Preset configs
// ---------------------------------------------------------------------------

/** 10 runs/hour, burst 3 — applied to authenticated API key requests. */
export const API_KEY_RATE_LIMIT: RateLimitConfig = {
  limit: 10,
  windowSeconds: 3600,
  burst: 3,
};

/** 1 run/hour, burst 1 — applied to unauthenticated (IP-based) requests. */
export const IP_RATE_LIMIT: RateLimitConfig = {
  limit: 1,
  windowSeconds: 3600,
  burst: 1,
};

/** 100 runs/hour, burst 20 — applied globally across all requests. */
export const GLOBAL_RATE_LIMIT: RateLimitConfig = {
  limit: 100,
  windowSeconds: 3600,
  burst: 20,
};

// ---------------------------------------------------------------------------
// Internal bucket row shape
// ---------------------------------------------------------------------------

interface BucketRow {
  key: string;
  tokens: number;
  last_update: string;
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/**
 * Loads a bucket from the database, or returns a new full bucket if absent.
 */
function loadBucket(key: string, config: RateLimitConfig): { tokens: number; lastUpdate: Date } {
  const db = getDatabase();
  const row = db.query<BucketRow, [string]>(
    'SELECT key, tokens, last_update FROM rate_limit_buckets WHERE key = ?'
  ).get(key);

  if (!row) {
    return { tokens: config.burst, lastUpdate: new Date() };
  }

  return { tokens: row.tokens, lastUpdate: new Date(row.last_update) };
}

/**
 * Persists a bucket to the database (upsert).
 */
function saveBucket(key: string, tokens: number, lastUpdate: Date): void {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO rate_limit_buckets (key, tokens, last_update)
    VALUES (?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET tokens = excluded.tokens, last_update = excluded.last_update
  `).run(key, tokens, lastUpdate.toISOString());
}

/**
 * Computes the refilled token count based on elapsed time since `lastUpdate`.
 * Tokens are capped at `burst`.
 */
function refill(tokens: number, config: RateLimitConfig, lastUpdate: Date, now: Date): number {
  const elapsedSeconds = (now.getTime() - lastUpdate.getTime()) / 1000;
  const refillRate = config.limit / config.windowSeconds; // tokens per second
  const refilled = tokens + elapsedSeconds * refillRate;
  return Math.min(refilled, config.burst);
}

/**
 * Calculates the ISO timestamp when the bucket will reach 1 token again.
 * Used for the `resetAt` field in rate limit responses.
 */
function computeResetAt(currentTokens: number, config: RateLimitConfig, now: Date): string {
  if (currentTokens >= 1) {
    return now.toISOString();
  }
  const refillRate = config.limit / config.windowSeconds;
  const secondsUntilOne = (1 - currentTokens) / refillRate;
  return new Date(now.getTime() + secondsUntilOne * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Checks whether a request would be allowed without consuming a token.
 *
 * @param key    Bucket identifier ('apikey:<id>', 'ip:<addr>', or 'global').
 * @param config Rate limit configuration for this bucket type.
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitStatus {
  const now = new Date();
  const { tokens: storedTokens, lastUpdate } = loadBucket(key, config);
  const currentTokens = refill(storedTokens, config, lastUpdate, now);
  const resetAt = computeResetAt(currentTokens, config, now);

  if (currentTokens >= 1) {
    return {
      allowed: true,
      limit: config.limit,
      remaining: Math.floor(currentTokens),
      resetAt,
    };
  }

  const refillRate = config.limit / config.windowSeconds;
  const retryAfterSeconds = Math.ceil((1 - currentTokens) / refillRate);

  return {
    allowed: false,
    limit: config.limit,
    remaining: 0,
    resetAt,
    retryAfterSeconds,
  };
}

/**
 * Attempts to consume one token from the bucket.
 *
 * If a token is available, it is consumed and the bucket is persisted.
 * If no token is available, the bucket state is NOT modified.
 *
 * @param key    Bucket identifier ('apikey:<id>', 'ip:<addr>', or 'global').
 * @param config Rate limit configuration for this bucket type.
 */
export function consumeToken(key: string, config: RateLimitConfig): RateLimitStatus {
  const now = new Date();
  const { tokens: storedTokens, lastUpdate } = loadBucket(key, config);
  const currentTokens = refill(storedTokens, config, lastUpdate, now);

  if (currentTokens >= 1) {
    const newTokens = currentTokens - 1;
    saveBucket(key, newTokens, now);
    const resetAt = computeResetAt(newTokens, config, now);
    return {
      allowed: true,
      limit: config.limit,
      remaining: Math.floor(newTokens),
      resetAt,
    };
  }

  const resetAt = computeResetAt(currentTokens, config, now);
  const refillRate = config.limit / config.windowSeconds;
  const retryAfterSeconds = Math.ceil((1 - currentTokens) / refillRate);

  return {
    allowed: false,
    limit: config.limit,
    remaining: 0,
    resetAt,
    retryAfterSeconds,
  };
}
