import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { getDatabase, closeDatabase } from './connection';

describe('getDatabase', () => {
  beforeEach(() => {
    // Use an in-memory DB for tests by overriding DB_PATH
    process.env.DB_PATH = ':memory:';
    closeDatabase(); // reset singleton
  });

  afterEach(() => {
    closeDatabase();
    delete process.env.DB_PATH;
  });

  test('returns a Database instance', () => {
    const db = getDatabase();
    expect(db).toBeInstanceOf(Database);
  });

  test('returns the same singleton on repeated calls', () => {
    const db1 = getDatabase();
    const db2 = getDatabase();
    expect(db1).toBe(db2);
  });

  test('has WAL journal mode enabled', () => {
    const db = getDatabase();
    const row = db.query<{ journal_mode: string }, []>('PRAGMA journal_mode;').get();
    expect(row?.journal_mode).toBe('wal');
  });

  test('has foreign key enforcement enabled', () => {
    const db = getDatabase();
    const row = db.query<{ foreign_keys: number }, []>('PRAGMA foreign_keys;').get();
    expect(row?.foreign_keys).toBe(1);
  });

  test('is usable for queries', () => {
    const db = getDatabase();
    const row = db.query<{ val: number }, []>('SELECT 1 AS val;').get();
    expect(row?.val).toBe(1);
  });
});

describe('closeDatabase', () => {
  beforeEach(() => {
    process.env.DB_PATH = ':memory:';
    closeDatabase();
  });

  afterEach(() => {
    closeDatabase();
    delete process.env.DB_PATH;
  });

  test('is a no-op when no connection is open', () => {
    // Should not throw
    expect(() => closeDatabase()).not.toThrow();
  });

  test('resets singleton so next call opens a fresh connection', () => {
    const db1 = getDatabase();
    closeDatabase();
    const db2 = getDatabase();
    expect(db2).not.toBe(db1);
  });
});
