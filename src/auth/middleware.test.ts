import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { getDatabase, closeDatabase } from '../db/connection';
import { runMigrations } from '../db/migrations';
import { migrations } from '../db/schema';
import { createApiKey, revokeApiKey } from '../db/api-keys';
import { checkAuth, requireAdmin } from './middleware';
import type { ApiKey } from '../types';

function setup() {
  process.env.DB_PATH = ':memory:';
  process.env.ISEE_API_KEY_SALT = 'test-salt';
  process.env.ISEE_ENABLE_AUTH = 'true';
  closeDatabase();
  const db = getDatabase();
  runMigrations(db, migrations);
}

function teardown() {
  closeDatabase();
  delete process.env.DB_PATH;
  delete process.env.ISEE_API_KEY_SALT;
  delete process.env.ISEE_ENABLE_AUTH;
}

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/analyze', { headers });
}

describe('checkAuth — auth enabled', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('returns 401 when Authorization header is missing', async () => {
    const result = checkAuth(makeRequest());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      const body = await result.response.json() as { error: string };
      expect(body.error).toMatch(/Missing/i);
    }
  });

  test('returns 401 for malformed Authorization header', async () => {
    const result = checkAuth(makeRequest({ Authorization: 'NotBearer token' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  test('returns 401 for an invalid key', async () => {
    const result = checkAuth(makeRequest({ Authorization: 'Bearer isee_invalid' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      const body = await result.response.json() as { error: string };
      expect(body.error).toMatch(/Invalid/i);
    }
  });

  test('returns ok for a valid key', () => {
    const { key } = createApiKey({ name: 'Test' });
    const result = checkAuth(makeRequest({ Authorization: `Bearer ${key}` }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.apiKey.name).toBe('Test');
    }
  });

  test('returns 401 for a revoked key', async () => {
    const { key, record } = createApiKey({ name: 'ToRevoke' });
    revokeApiKey(record.id);
    const result = checkAuth(makeRequest({ Authorization: `Bearer ${key}` }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  test('returns 401 for an expired key', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const { key } = createApiKey({ expiresAt: past });
    const result = checkAuth(makeRequest({ Authorization: `Bearer ${key}` }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });
});

describe('checkAuth — auth disabled', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    process.env.ISEE_API_KEY_SALT = 'test-salt';
    delete process.env.ISEE_ENABLE_AUTH;
    closeDatabase();
  });
  afterEach(teardown);

  test('returns ok without a token when auth is disabled', () => {
    const result = checkAuth(makeRequest());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.apiKey.id).toBe('dev');
      expect(result.apiKey.isAdmin).toBe(true);
    }
  });

  test('returns ok even with an invalid token when auth is disabled', () => {
    const result = checkAuth(makeRequest({ Authorization: 'Bearer isee_bogus' }));
    expect(result.ok).toBe(true);
  });
});

describe('requireAdmin', () => {
  test('returns null for an admin key', () => {
    const adminKey: ApiKey = {
      id: 'test',
      keyHash: 'hash',
      createdAt: new Date().toISOString(),
      isAdmin: true,
      isActive: true,
    };
    expect(requireAdmin(adminKey)).toBeNull();
  });

  test('returns 403 for a non-admin key', async () => {
    const userKey: ApiKey = {
      id: 'test',
      keyHash: 'hash',
      createdAt: new Date().toISOString(),
      isAdmin: false,
      isActive: true,
    };
    const response = requireAdmin(userKey);
    expect(response).not.toBeNull();
    expect(response!.status).toBe(403);
    const body = await response!.json() as { error: string };
    expect(body.error).toMatch(/Admin/i);
  });
});
