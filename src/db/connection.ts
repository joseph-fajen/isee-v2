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

const DB_PATH = process.env.DB_PATH || './data/isee.db';

let _db: Database | null = null;

/**
 * Returns the singleton SQLite database connection.
 * Creates the database file and parent directory if they do not exist.
 * WAL mode is enabled for better read concurrency during long pipeline runs.
 */
export function getDatabase(): Database {
  if (_db) return _db;

  // Ensure the parent directory exists
  mkdirSync(dirname(DB_PATH), { recursive: true });

  _db = new Database(DB_PATH, { create: true });

  // Enable WAL mode for better concurrent read performance
  _db.exec('PRAGMA journal_mode = WAL;');

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
