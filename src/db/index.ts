/**
 * ISEE v2 — Database Module
 *
 * Entry point for all database operations.
 * Call `initDatabase()` once at server startup before handling any requests.
 */

export { getDatabase, closeDatabase } from './connection';
export { runMigrations } from './migrations';
export type { Migration } from './migrations';
export { migrations } from './schema';
export { createRun, getRunById, updateRun, getRuns } from './runs';
export { logLlmCall, getLlmCallsByRunId, getCallStats } from './llm-calls';
export { createApiKey, validateApiKey, getApiKeyById, revokeApiKey, listApiKeys, seedAdminKeyIfNeeded } from './api-keys';

import { getDatabase } from './connection';
import { runMigrations } from './migrations';
import { migrations } from './schema';
import { seedAdminKeyIfNeeded } from './api-keys';

/**
 * Initialises the database: opens the connection and applies any pending
 * migrations. Safe to call multiple times — migrations are idempotent.
 * Also seeds the bootstrap admin key from ISEE_ADMIN_KEY if present.
 */
export function initDatabase(): void {
  const db = getDatabase();
  runMigrations(db, migrations);
  seedAdminKeyIfNeeded();
}
