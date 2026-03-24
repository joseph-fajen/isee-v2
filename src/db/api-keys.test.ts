import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { getDatabase, closeDatabase } from './connection';
import { runMigrations } from './migrations';
import { migrations } from './schema';
import { createApiKey, validateApiKey, getApiKeyById, revokeApiKey, listApiKeys, seedAdminKeyIfNeeded } from './api-keys';

function setup() {
  process.env.DB_PATH = ':memory:';
  process.env.ISEE_API_KEY_SALT = 'test-salt';
  closeDatabase();
  const db = getDatabase();
  runMigrations(db, migrations);
}

function teardown() {
  closeDatabase();
  delete process.env.DB_PATH;
  delete process.env.ISEE_API_KEY_SALT;
  delete process.env.ISEE_ADMIN_KEY;
}

describe('createApiKey', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('returns a raw key in isee_ format', () => {
    const { key } = createApiKey();
    expect(key).toMatch(/^isee_[0-9a-f]{32}$/);
  });

  test('stores key hash, not raw key', () => {
    const { key, record } = createApiKey();
    expect(record.keyHash).not.toBe(key);
    expect(record.keyHash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 hex
  });

  test('persists optional fields', () => {
    const future = new Date(Date.now() + 86400_000).toISOString();
    const { record } = createApiKey({
      name: 'Test Key',
      isAdmin: true,
      expiresAt: future,
      rateLimitOverride: 100,
    });
    expect(record.name).toBe('Test Key');
    expect(record.isAdmin).toBe(true);
    expect(record.expiresAt).toBe(future);
    expect(record.rateLimitOverride).toBe(100);
    expect(record.isActive).toBe(true);
  });

  test('defaults to non-admin and active', () => {
    const { record } = createApiKey();
    expect(record.isAdmin).toBe(false);
    expect(record.isActive).toBe(true);
  });
});

describe('validateApiKey', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('returns ApiKey for a valid key', () => {
    const { key, record } = createApiKey({ name: 'Valid' });
    const found = validateApiKey(key);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(record.id);
  });

  test('returns null for unknown key', () => {
    expect(validateApiKey('isee_notreal')).toBeNull();
  });

  test('returns null for a revoked key', () => {
    const { key, record } = createApiKey();
    revokeApiKey(record.id);
    expect(validateApiKey(key)).toBeNull();
  });

  test('returns null for an expired key', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const { key } = createApiKey({ expiresAt: past });
    expect(validateApiKey(key)).toBeNull();
  });

  test('returns ApiKey for a non-expired key', () => {
    const future = new Date(Date.now() + 86400_000).toISOString();
    const { key } = createApiKey({ expiresAt: future });
    expect(validateApiKey(key)).not.toBeNull();
  });
});

describe('getApiKeyById', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('returns null for unknown id', () => {
    expect(getApiKeyById('no-such-id')).toBeNull();
  });

  test('returns the record for a known id', () => {
    const { record } = createApiKey({ name: 'Lookup Test' });
    const found = getApiKeyById(record.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Lookup Test');
  });
});

describe('revokeApiKey', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('sets is_active to false', () => {
    const { record } = createApiKey();
    expect(record.isActive).toBe(true);
    revokeApiKey(record.id);
    const updated = getApiKeyById(record.id);
    expect(updated!.isActive).toBe(false);
  });

  test('is idempotent', () => {
    const { record } = createApiKey();
    revokeApiKey(record.id);
    expect(() => revokeApiKey(record.id)).not.toThrow();
  });
});

describe('listApiKeys', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('returns empty array when no keys exist', () => {
    expect(listApiKeys()).toEqual([]);
  });

  test('returns only active keys by default', () => {
    createApiKey({ name: 'Active' });
    const { record } = createApiKey({ name: 'Inactive' });
    revokeApiKey(record.id);
    const active = listApiKeys();
    expect(active.length).toBe(1);
    expect(active[0].name).toBe('Active');
  });

  test('returns all keys when includeInactive=true', () => {
    createApiKey({ name: 'Active' });
    const { record } = createApiKey({ name: 'Inactive' });
    revokeApiKey(record.id);
    const all = listApiKeys(true);
    expect(all.length).toBe(2);
  });
});

describe('seedAdminKeyIfNeeded', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('is a no-op when ISEE_ADMIN_KEY is not set', () => {
    delete process.env.ISEE_ADMIN_KEY;
    seedAdminKeyIfNeeded();
    expect(listApiKeys()).toEqual([]);
  });

  test('inserts an admin key when ISEE_ADMIN_KEY is set', () => {
    process.env.ISEE_ADMIN_KEY = 'isee_bootstrapkey';
    seedAdminKeyIfNeeded();
    const keys = listApiKeys();
    expect(keys.length).toBe(1);
    expect(keys[0].isAdmin).toBe(true);
    expect(keys[0].name).toBe('Bootstrap admin key');
  });

  test('validates the seeded key', () => {
    process.env.ISEE_ADMIN_KEY = 'isee_bootstrapkey';
    seedAdminKeyIfNeeded();
    const found = validateApiKey('isee_bootstrapkey');
    expect(found).not.toBeNull();
    expect(found!.isAdmin).toBe(true);
  });

  test('does not insert duplicate if called twice', () => {
    process.env.ISEE_ADMIN_KEY = 'isee_bootstrapkey';
    seedAdminKeyIfNeeded();
    seedAdminKeyIfNeeded();
    expect(listApiKeys().length).toBe(1);
  });
});
