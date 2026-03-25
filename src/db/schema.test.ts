import { describe, test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { migrations } from './schema';
import { runMigrations } from './migrations';

function freshDb(): Database {
  return new Database(':memory:');
}

describe('schema migrations', () => {
  test('migrations array is non-empty', () => {
    expect(migrations.length).toBeGreaterThan(0);
  });

  test('version numbers are unique and start at 1', () => {
    const versions = migrations.map((m) => m.version);
    const unique = new Set(versions);
    expect(unique.size).toBe(versions.length);
    expect(Math.min(...versions)).toBe(1);
  });

  test('migrations are sorted by version ascending', () => {
    for (let i = 1; i < migrations.length; i++) {
      expect(migrations[i].version).toBeGreaterThan(migrations[i - 1].version);
    }
  });

  test('every migration has a non-empty name and sql', () => {
    for (const m of migrations) {
      expect(m.name.trim().length).toBeGreaterThan(0);
      expect(m.sql.trim().length).toBeGreaterThan(0);
    }
  });

  test('applies all migrations without error', () => {
    const db = freshDb();
    expect(() => runMigrations(db, migrations)).not.toThrow();
  });
});

describe('initial_schema (v1)', () => {
  // Apply the schema once for all tests in this block
  const db = freshDb();
  runMigrations(db, migrations);

  test('runs table exists with expected columns', () => {
    const info = db.query<{ name: string }, []>('PRAGMA table_info(runs);').all();
    const cols = info.map((r) => r.name);
    expect(cols).toContain('id');
    expect(cols).toContain('query');
    expect(cols).toContain('status');
    expect(cols).toContain('created_at');
    expect(cols).toContain('completed_at');
    expect(cols).toContain('duration_ms');
    expect(cols).toContain('error_message');
    expect(cols).toContain('stats_json');
  });

  test('briefings table exists with expected columns', () => {
    const info = db.query<{ name: string }, []>('PRAGMA table_info(briefings);').all();
    const cols = info.map((r) => r.name);
    expect(cols).toContain('id');
    expect(cols).toContain('run_id');
    expect(cols).toContain('query');
    expect(cols).toContain('timestamp');
    expect(cols).toContain('ideas_json');
    expect(cols).toContain('debate_json');
    expect(cols).toContain('domains_json');
    expect(cols).toContain('markdown');
    expect(cols).toContain('created_at');
  });

  test('inserting a run row succeeds', () => {
    db.exec(`
      INSERT INTO runs (id, query, status, created_at)
      VALUES ('run-1', 'test query', 'running', ${Date.now()});
    `);
    const row = db.query<{ id: string }, [string]>('SELECT id FROM runs WHERE id = ?;').get('run-1');
    expect(row?.id).toBe('run-1');
  });

  test('inserting a briefing with valid run_id succeeds', () => {
    db.exec(`
      INSERT INTO briefings (id, run_id, query, timestamp, ideas_json, debate_json, domains_json, markdown, created_at)
      VALUES ('brief-1', 'run-1', 'test query', '2026-01-01T00:00:00Z', '[]', '[]', '[]', '# hi', ${Date.now()});
    `);
    const row = db.query<{ id: string }, [string]>('SELECT id FROM briefings WHERE id = ?;').get('brief-1');
    expect(row?.id).toBe('brief-1');
  });

  test('briefings declares a foreign key referencing runs', () => {
    const fkList = db.query<{ table: string; to: string }, []>(
      'PRAGMA foreign_key_list(briefings);'
    ).all();
    expect(fkList.length).toBeGreaterThan(0);
    expect(fkList[0].table).toBe('runs');
    expect(fkList[0].to).toBe('id');
  });

  test('runs status defaults to running', () => {
    db.exec(`
      INSERT INTO runs (id, query, created_at)
      VALUES ('run-default', 'q', ${Date.now()});
    `);
    const row = db.query<{ status: string }, [string]>('SELECT status FROM runs WHERE id = ?;').get('run-default');
    expect(row?.status).toBe('running');
  });

  test('migrations are idempotent when applied twice', () => {
    const db2 = freshDb();
    runMigrations(db2, migrations);
    const count = runMigrations(db2, migrations);
    expect(count).toBe(0);
  });
});
