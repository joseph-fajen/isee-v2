import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { getDatabase, closeDatabase } from '../db/connection';
import { runMigrations } from '../db/migrations';
import { migrations } from '../db/schema';
import { createApiKey as _createApiKey } from '../db/api-keys';
import { applyRateLimit, withRateLimitHeaders, isRateLimitEnabled } from './rate-limit-middleware';
import type { AuthResult } from '../auth/middleware';
import type { ApiKey } from '../types';

function setup() {
  process.env.DB_PATH = ':memory:';
  process.env.ISEE_RATE_LIMIT_ENABLED = 'true';
  process.env.ISEE_API_KEY_SALT = 'test-salt';
  closeDatabase();
  const db = getDatabase();
  runMigrations(db, migrations);
}

function teardown() {
  closeDatabase();
  delete process.env.DB_PATH;
  delete process.env.ISEE_RATE_LIMIT_ENABLED;
  delete process.env.ISEE_API_KEY_SALT;
}

function makeRequest(ip?: string): Request {
  const headers: Record<string, string> = {};
  if (ip) headers['X-Forwarded-For'] = ip;
  return new Request('http://localhost/api/analyze', { method: 'POST', headers });
}

function makeAuthResult(override?: Partial<ApiKey>): AuthResult {
  return {
    ok: true,
    apiKey: {
      id: 'test-key-id',
      keyHash: 'hash',
      name: 'Test',
      createdAt: new Date().toISOString(),
      isAdmin: false,
      isActive: true,
      ...override,
    },
  };
}

describe('isRateLimitEnabled', () => {
  test('returns true when env var is set', () => {
    process.env.ISEE_RATE_LIMIT_ENABLED = 'true';
    expect(isRateLimitEnabled()).toBe(true);
  });

  test('returns false when env var is absent', () => {
    delete process.env.ISEE_RATE_LIMIT_ENABLED;
    expect(isRateLimitEnabled()).toBe(false);
  });
});

describe('applyRateLimit (disabled)', () => {
  test('returns not-limited synthetic status when disabled', () => {
    delete process.env.ISEE_RATE_LIMIT_ENABLED;
    const result = applyRateLimit(makeRequest(), makeAuthResult());
    expect(result.limited).toBe(false);
    if (!result.limited) {
      expect(result.status.allowed).toBe(true);
    }
  });
});

describe('applyRateLimit (enabled)', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('allows first request for an API key', () => {
    const result = applyRateLimit(makeRequest(), makeAuthResult());
    expect(result.limited).toBe(false);
    if (!result.limited) {
      expect(result.status.allowed).toBe(true);
      expect(result.status.remaining).toBe(2); // burst=3, minus 1 consumed
    }
  });

  test('denies after burst is exhausted', () => {
    const auth = makeAuthResult();
    const req = makeRequest();
    // burst = 3, so 4th call should be denied
    applyRateLimit(req, auth);
    applyRateLimit(req, auth);
    applyRateLimit(req, auth);
    const result = applyRateLimit(req, auth);
    expect(result.limited).toBe(true);
    if (result.limited) {
      expect(result.response.status).toBe(429);
    }
  });

  test('429 response has JSON body with expected fields', async () => {
    const auth = makeAuthResult();
    const req = makeRequest();
    applyRateLimit(req, auth);
    applyRateLimit(req, auth);
    applyRateLimit(req, auth);
    const result = applyRateLimit(req, auth);
    expect(result.limited).toBe(true);
    if (result.limited) {
      const body = await result.response.json() as Record<string, unknown>;
      expect(body.error).toBe('rate_limit_exceeded');
      expect(typeof body.retry_after_seconds).toBe('number');
      expect(body.remaining).toBe(0);
      expect(typeof body.reset_at).toBe('string');
    }
  });

  test('429 response has Retry-After header', async () => {
    const auth = makeAuthResult();
    const req = makeRequest();
    applyRateLimit(req, auth);
    applyRateLimit(req, auth);
    applyRateLimit(req, auth);
    const result = applyRateLimit(req, auth);
    expect(result.limited).toBe(true);
    if (result.limited) {
      expect(result.response.headers.get('Retry-After')).not.toBeNull();
    }
  });

  test('uses IP bucket for unauthenticated requests', () => {
    const unauthResult: AuthResult = {
      ok: false,
      response: new Response('Unauthorized', { status: 401 }),
    };
    // First request (burst=1) should be allowed
    const result = applyRateLimit(makeRequest('10.0.0.1'), unauthResult);
    expect(result.limited).toBe(false);
  });

  test('second IP request is denied (burst=1)', () => {
    const unauthResult: AuthResult = {
      ok: false,
      response: new Response('Unauthorized', { status: 401 }),
    };
    applyRateLimit(makeRequest('10.0.0.2'), unauthResult);
    const result = applyRateLimit(makeRequest('10.0.0.2'), unauthResult);
    expect(result.limited).toBe(true);
    if (result.limited) {
      expect(result.response.status).toBe(429);
    }
  });

  test('applies rateLimitOverride when set on API key', () => {
    // Override to 1 run/hr, burst=1
    const auth = makeAuthResult({ id: 'override-key', rateLimitOverride: 1 });
    const req = makeRequest();
    applyRateLimit(req, auth); // consumes the 1 burst token
    const result = applyRateLimit(req, auth);
    expect(result.limited).toBe(true);
  });

  test('different API keys have separate buckets', () => {
    const auth1 = makeAuthResult({ id: 'key-aaa' });
    const auth2 = makeAuthResult({ id: 'key-bbb' });
    const req = makeRequest();
    // Exhaust key-aaa
    applyRateLimit(req, auth1);
    applyRateLimit(req, auth1);
    applyRateLimit(req, auth1);
    // key-bbb should still be allowed
    const result = applyRateLimit(req, auth2);
    expect(result.limited).toBe(false);
  });
});

describe('withRateLimitHeaders', () => {
  test('adds X-RateLimit-* headers to response', () => {
    const original = new Response('OK', { status: 200 });
    const status = {
      allowed: true,
      limit: 10,
      remaining: 7,
      resetAt: new Date(Date.now() + 3600_000).toISOString(),
    };
    const annotated = withRateLimitHeaders(original, status);
    expect(annotated.headers.get('X-RateLimit-Limit')).toBe('10');
    expect(annotated.headers.get('X-RateLimit-Remaining')).toBe('7');
    expect(annotated.headers.get('X-RateLimit-Reset')).not.toBeNull();
  });

  test('preserves original response status and body', async () => {
    const original = Response.json({ success: true }, { status: 201 });
    const status = {
      allowed: true,
      limit: 10,
      remaining: 9,
      resetAt: new Date().toISOString(),
    };
    const annotated = withRateLimitHeaders(original, status);
    expect(annotated.status).toBe(201);
    const body = await annotated.json() as Record<string, unknown>;
    expect(body.success).toBe(true);
  });
});
