/**
 * ISEE v2 — API Key Management
 *
 * CRUD operations for the `api_keys` table.
 * Raw keys are never stored — only a salted SHA-256 hash.
 */

import { getDatabase } from './connection';
import type { ApiKey } from '../types';
import { randomBytes, createHash } from 'crypto';

// ---------------------------------------------------------------------------
// Internal row shape (snake_case as stored in SQLite)
// ---------------------------------------------------------------------------

interface ApiKeyRow {
  id: string;
  key_hash: string;
  name: string | null;
  created_at: string;
  expires_at: string | null;
  rate_limit_override: number | null;
  is_admin: number;  // SQLite boolean
  is_active: number; // SQLite boolean
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function rowToRecord(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    keyHash: row.key_hash,
    ...(row.name != null && { name: row.name }),
    createdAt: row.created_at,
    ...(row.expires_at != null && { expiresAt: row.expires_at }),
    ...(row.rate_limit_override != null && { rateLimitOverride: row.rate_limit_override }),
    isAdmin: row.is_admin === 1,
    isActive: row.is_active === 1,
  };
}

/**
 * Hashes a raw key using SHA-256 with the ISEE_API_KEY_SALT env var.
 */
function hashKey(rawKey: string): string {
  const salt = process.env.ISEE_API_KEY_SALT ?? '';
  return createHash('sha256').update(rawKey + salt).digest('hex');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a new API key.
 *
 * Generates a key in the format `isee_<32 random hex chars>`, hashes it,
 * and stores only the hash. The raw key is returned exactly once — it cannot
 * be recovered afterwards.
 *
 * @returns `{ key, record }` — the raw unhashed key and the stored record.
 */
export function createApiKey(opts: {
  name?: string;
  isAdmin?: boolean;
  expiresAt?: string;
  rateLimitOverride?: number;
} = {}): { key: string; record: ApiKey } {
  const db = getDatabase();

  const rawKey = `isee_${randomBytes(16).toString('hex')}`;
  const keyHash = hashKey(rawKey);
  const id = randomBytes(8).toString('hex');
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO api_keys (id, key_hash, name, created_at, expires_at, rate_limit_override, is_admin, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(
    id,
    keyHash,
    opts.name ?? null,
    createdAt,
    opts.expiresAt ?? null,
    opts.rateLimitOverride ?? null,
    opts.isAdmin ? 1 : 0,
  );

  const record = getApiKeyById(id) as ApiKey;
  return { key: rawKey, record };
}

/**
 * Validates a raw API key.
 *
 * Hashes the input and looks up the matching record. Returns `null` if:
 * - No matching key hash found
 * - The key is inactive
 * - The key has expired
 */
export function validateApiKey(rawKey: string): ApiKey | null {
  const db = getDatabase();

  const keyHash = hashKey(rawKey);
  const row = db.query<ApiKeyRow, [string]>(
    'SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1'
  ).get(keyHash);

  if (!row) return null;

  const record = rowToRecord(row);

  // Check expiry
  if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
    return null;
  }

  return record;
}

/**
 * Retrieves an API key record by its internal ID.
 */
export function getApiKeyById(id: string): ApiKey | null {
  const db = getDatabase();
  const row = db.query<ApiKeyRow, [string]>('SELECT * FROM api_keys WHERE id = ?').get(id);
  return row ? rowToRecord(row) : null;
}

/**
 * Revokes an API key by setting `is_active = 0`.
 */
export function revokeApiKey(id: string): void {
  const db = getDatabase();
  db.prepare('UPDATE api_keys SET is_active = 0 WHERE id = ?').run(id);
}

/**
 * Returns all API key records (optionally including inactive keys).
 */
export function listApiKeys(includeInactive = false): ApiKey[] {
  const db = getDatabase();
  const rows = includeInactive
    ? db.query<ApiKeyRow, []>('SELECT * FROM api_keys ORDER BY created_at DESC').all()
    : db.query<ApiKeyRow, []>('SELECT * FROM api_keys WHERE is_active = 1 ORDER BY created_at DESC').all();
  return rows.map(rowToRecord);
}

/**
 * Seeds an admin key from the ISEE_ADMIN_KEY env var on first startup.
 * If the env var is not set or the key already exists, this is a no-op.
 */
export function seedAdminKeyIfNeeded(): void {
  const adminKey = process.env.ISEE_ADMIN_KEY;
  if (!adminKey) return;

  const db = getDatabase();
  const keyHash = hashKey(adminKey);

  const existing = db.query<{ id: string }, [string]>(
    'SELECT id FROM api_keys WHERE key_hash = ?'
  ).get(keyHash);

  if (existing) return; // Already seeded

  const id = randomBytes(8).toString('hex');
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO api_keys (id, key_hash, name, created_at, expires_at, rate_limit_override, is_admin, is_active)
    VALUES (?, ?, ?, ?, NULL, NULL, 1, 1)
  `).run(id, keyHash, 'Bootstrap admin key', createdAt);

  console.log('[auth] Seeded admin key from ISEE_ADMIN_KEY env var');
}
