import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { getDatabase, closeDatabase } from '../db/connection';
import { runMigrations } from '../db/migrations';
import { migrations } from '../db/schema';
import { checkRateLimit, consumeToken, API_KEY_RATE_LIMIT, IP_RATE_LIMIT } from './rate-limit';
import type { RateLimitConfig } from '../types';

function setup() {
  process.env.DB_PATH = ':memory:';
  closeDatabase();
  const db = getDatabase();
  runMigrations(db, migrations);
}

function teardown() {
  closeDatabase();
  delete process.env.DB_PATH;
}

/** A tight config for testing: 2 per 10s, burst 2 */
const testConfig: RateLimitConfig = {
  limit: 2,
  windowSeconds: 10,
  burst: 2,
};

describe('checkRateLimit', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('allows a new bucket (full tokens)', () => {
    const status = checkRateLimit('test:new', testConfig);
    expect(status.allowed).toBe(true);
    expect(status.remaining).toBe(2);
    expect(status.limit).toBe(2);
  });

  test('does not modify bucket state', () => {
    checkRateLimit('test:readonly', testConfig);
    // Calling again should still show full bucket (no consumption)
    const status = checkRateLimit('test:readonly', testConfig);
    expect(status.allowed).toBe(true);
    expect(status.remaining).toBe(2);
  });

  test('returns resetAt as ISO string', () => {
    const status = checkRateLimit('test:reset', testConfig);
    expect(() => new Date(status.resetAt)).not.toThrow();
    expect(status.resetAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('consumeToken', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('allows and decrements on first call', () => {
    const status = consumeToken('test:consume', testConfig);
    expect(status.allowed).toBe(true);
    expect(status.remaining).toBe(1);
  });

  test('allows second call (burst=2)', () => {
    consumeToken('test:two', testConfig);
    const status = consumeToken('test:two', testConfig);
    expect(status.allowed).toBe(true);
    expect(status.remaining).toBe(0);
  });

  test('denies when tokens exhausted', () => {
    consumeToken('test:exhaust', testConfig);
    consumeToken('test:exhaust', testConfig);
    const status = consumeToken('test:exhaust', testConfig);
    expect(status.allowed).toBe(false);
    expect(status.remaining).toBe(0);
    expect(status.retryAfterSeconds).toBeGreaterThan(0);
  });

  test('bucket refills over time', async () => {
    // Use a very fast config: 10 tokens per second, burst=1
    const fastConfig: RateLimitConfig = { limit: 10, windowSeconds: 1, burst: 1 };
    consumeToken('test:refill', fastConfig); // exhaust
    // Wait 200ms — should refill ~2 tokens
    await new Promise((r) => setTimeout(r, 200));
    const status = consumeToken('test:refill', fastConfig);
    expect(status.allowed).toBe(true);
  });

  test('retryAfterSeconds is present and positive when denied', () => {
    consumeToken('test:retry', testConfig);
    consumeToken('test:retry', testConfig);
    const status = consumeToken('test:retry', testConfig);
    expect(status.allowed).toBe(false);
    expect(typeof status.retryAfterSeconds).toBe('number');
    expect(status.retryAfterSeconds!).toBeGreaterThan(0);
  });

  test('retryAfterSeconds is absent when allowed', () => {
    const status = consumeToken('test:noretry', testConfig);
    expect(status.allowed).toBe(true);
    expect(status.retryAfterSeconds).toBeUndefined();
  });
});

describe('preset configs', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('API_KEY_RATE_LIMIT has correct limits', () => {
    expect(API_KEY_RATE_LIMIT.limit).toBe(10);
    expect(API_KEY_RATE_LIMIT.windowSeconds).toBe(3600);
    expect(API_KEY_RATE_LIMIT.burst).toBe(3);
  });

  test('IP_RATE_LIMIT has correct limits', () => {
    expect(IP_RATE_LIMIT.limit).toBe(1);
    expect(IP_RATE_LIMIT.windowSeconds).toBe(3600);
    expect(IP_RATE_LIMIT.burst).toBe(1);
  });

  test('API_KEY burst allows 3 requests before denying', () => {
    const key = 'apikey:test-burst';
    let allowed = 0;
    for (let i = 0; i < 4; i++) {
      const s = consumeToken(key, API_KEY_RATE_LIMIT);
      if (s.allowed) allowed++;
    }
    expect(allowed).toBe(3);
  });

  test('IP burst allows 1 request before denying', () => {
    const key = 'ip:192.0.2.1';
    const first = consumeToken(key, IP_RATE_LIMIT);
    const second = consumeToken(key, IP_RATE_LIMIT);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
  });
});
