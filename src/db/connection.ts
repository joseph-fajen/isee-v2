/**
 * ISEE v2 — Database Connection
 *
 * Provides a singleton SQLite connection using Bun's built-in SQLite driver.
 * The database file path is configurable via the DB_PATH environment variable,
 * defaulting to ./data/isee.db.
 */

import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

let _db: Database | null = null;

/**
 * Returns the singleton SQLite database connection.
 * Creates the database file and parent directory if they do not exist.
 * WAL mode is enabled for better read concurrency during long pipeline runs.
 *
 * The database path is read from the `DB_PATH` environment variable at
 * connection creation time (not module load time) so that tests can override
 * it with `process.env.DB_PATH = ':memory:'` before the first call.
 */
export function getDatabase(): Database {
  if (_db) return _db;

  const dbPath = process.env.DB_PATH || './data/isee.db';

  // Ensure the parent directory exists (no-op for ':memory:')
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  _db = new Database(dbPath, { create: true });

  // WAL mode improves concurrent read performance for file-backed databases.
  // SQLite silently ignores it for :memory: databases (returns 'memory' instead
  // of 'wal'), so we only set it for file-backed databases.
  if (dbPath !== ':memory:') {
    _db.exec('PRAGMA journal_mode = WAL;');
  }

  // Enforce foreign key constraints
  _db.exec('PRAGMA foreign_keys = ON;');

  return _db;
}

/**
 * Closes the database connection and resets the singleton.
 * Intended for graceful shutdown and test teardown.
 */
export function closeDatabase(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
