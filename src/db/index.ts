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

import { getDatabase } from './connection';
import { runMigrations } from './migrations';
import { migrations } from './schema';

/**
 * Initialises the database: opens the connection and applies any pending
 * migrations. Safe to call multiple times — migrations are idempotent.
 */
export function initDatabase(): void {
  const db = getDatabase();
  runMigrations(db, migrations);
}
