import { describe, test, expect, beforeEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations } from './migrations';
import type { Migration } from './migrations';

function freshDb(): Database {
  return new Database(':memory:');
}

const migrationA: Migration = {
  version: 1,
  name: 'create_foo',
  sql: 'CREATE TABLE foo (id INTEGER PRIMARY KEY, val TEXT NOT NULL);',
};

const migrationB: Migration = {
  version: 2,
  name: 'create_bar',
  sql: 'CREATE TABLE bar (id INTEGER PRIMARY KEY);',
};

describe('runMigrations', () => {
  let db: Database;

  beforeEach(() => {
    db = freshDb();
  });

  test('applies a single migration and returns 1', () => {
    const count = runMigrations(db, [migrationA]);
    expect(count).toBe(1);
  });

  test('creates the migrated table', () => {
    runMigrations(db, [migrationA]);
    // Inserting into the created table should succeed
    db.exec("INSERT INTO foo (val) VALUES ('x');");
    const row = db.query<{ val: string }, []>('SELECT val FROM foo;').get();
    expect(row?.val).toBe('x');
  });

  test('records applied migration in schema_migrations', () => {
    runMigrations(db, [migrationA]);
    const row = db.query<{ version: number; name: string }, []>(
      'SELECT version, name FROM schema_migrations;'
    ).get();
    expect(row?.version).toBe(1);
    expect(row?.name).toBe('create_foo');
  });

  test('applied_at is a positive integer', () => {
    const before = Date.now();
    runMigrations(db, [migrationA]);
    const row = db.query<{ applied_at: number }, []>(
      'SELECT applied_at FROM schema_migrations;'
    ).get();
    expect(row?.applied_at).toBeGreaterThanOrEqual(before);
  });

  test('applies multiple migrations in version order', () => {
    // Pass them out of order to verify sorting
    const count = runMigrations(db, [migrationB, migrationA]);
    expect(count).toBe(2);
    const rows = db.query<{ version: number }, []>(
      'SELECT version FROM schema_migrations ORDER BY version;'
    ).all();
    expect(rows.map((r) => r.version)).toEqual([1, 2]);
  });

  test('returns 0 and skips already-applied migrations', () => {
    runMigrations(db, [migrationA]);
    const count = runMigrations(db, [migrationA]);
    expect(count).toBe(0);
  });

  test('only applies pending migrations on re-run', () => {
    runMigrations(db, [migrationA]);
    const count = runMigrations(db, [migrationA, migrationB]);
    expect(count).toBe(1);
  });

  test('returns 0 for empty migrations list', () => {
    const count = runMigrations(db, []);
    expect(count).toBe(0);
  });

  test('rolls back a failing migration and leaves db in last good state', () => {
    const bad: Migration = {
      version: 2,
      name: 'bad_migration',
      sql: 'THIS IS NOT VALID SQL !!!',
    };
    runMigrations(db, [migrationA]);
    expect(() => runMigrations(db, [migrationA, bad])).toThrow();

    // schema_migrations should still only have version 1
    const rows = db.query<{ version: number }, []>(
      'SELECT version FROM schema_migrations;'
    ).all();
    expect(rows.map((r) => r.version)).toEqual([1]);
  });
});
