/**
 * ISEE v2 — Database Migrations
 *
 * A simple sequential migration system.
 * Each migration is an object with a version number and a SQL string.
 * Migrations are applied once and never re-run; applied versions are
 * tracked in the `schema_migrations` table.
 */

import type { Database } from 'bun:sqlite';

export interface Migration {
  /** Monotonically increasing version number (1-based) */
  version: number;
  /** Human-readable name, used for logging */
  name: string;
  /** SQL to execute (may contain multiple statements separated by semicolons) */
  sql: string;
}

/**
 * Ensures the migrations tracking table exists.
 */
function ensureMigrationsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version   INTEGER PRIMARY KEY,
      name      TEXT    NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);
}

/**
 * Returns the highest migration version already applied, or 0 if none.
 */
function getAppliedVersion(db: Database): number {
  ensureMigrationsTable(db);
  const row = db.query<{ version: number }, []>(
    'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations;'
  ).get();
  return row?.version ?? 0;
}

/**
 * Runs all pending migrations in order.
 * Each migration is executed inside its own transaction so a failure
 * leaves the database in the last good state.
 *
 * @param db - Open database connection
 * @param migrations - Full ordered list of migrations (sorted by version ascending)
 * @returns Number of migrations applied in this call
 */
export function runMigrations(db: Database, migrations: Migration[]): number {
  ensureMigrationsTable(db);

  const currentVersion = getAppliedVersion(db);
  const pending = migrations
    .filter((m) => m.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  if (pending.length === 0) {
    console.log('[db] No pending migrations.');
    return 0;
  }

  let applied = 0;
  for (const migration of pending) {
    console.log(`[db] Applying migration ${migration.version}: ${migration.name}`);

    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?);'
      ).run(migration.version, migration.name, Date.now());
    })();

    applied++;
    console.log(`[db] Migration ${migration.version} applied.`);
  }

  return applied;
}
