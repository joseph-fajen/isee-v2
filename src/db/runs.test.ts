import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { getDatabase, closeDatabase } from './connection';
import { runMigrations } from './migrations';
import { migrations } from './schema';
import { createRun, getRunById, updateRun, getRuns, markStaleRunsFailed } from './runs';
import type { RunRecord } from '../types';

function setup() {
  process.env.DB_PATH = ':memory:';
  closeDatabase();
  const db = getDatabase();
  runMigrations(db, migrations);
}

function teardown() {
  closeDatabase();
  delete process.env.DB_PATH;
}

const baseRun = (): Parameters<typeof createRun>[0] => ({
  id: 'run-001',
  query: 'How can we improve remote collaboration?',
  startedAt: new Date().toISOString(),
});

describe('createRun', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('inserts and returns a RunRecord with defaults', () => {
    const record = createRun(baseRun());
    expect(record.id).toBe('run-001');
    expect(record.status).toBe('running');
    expect(record.query).toBe('How can we improve remote collaboration?');
    expect(record.completedAt).toBeUndefined();
    expect(record.errorMessage).toBeUndefined();
  });

  test('persists optional fields when provided', () => {
    const run = {
      ...baseRun(),
      id: 'run-002',
      status: 'completed' as RunRecord['status'],
      refinedQuery: 'Refined: How can we improve remote collaboration?',
      durationMs: 42000,
      synthesisCallCount: 60,
      successfulCalls: 58,
      clusterCount: 6,
      totalCostUsd: 0.12,
      openrouterCostUsd: 0.09,
      anthropicCostUsd: 0.03,
    };
    const record = createRun(run);
    expect(record.status).toBe('completed');
    expect(record.refinedQuery).toBe('Refined: How can we improve remote collaboration?');
    expect(record.durationMs).toBe(42000);
    expect(record.synthesisCallCount).toBe(60);
    expect(record.successfulCalls).toBe(58);
    expect(record.clusterCount).toBe(6);
    expect(record.totalCostUsd).toBeCloseTo(0.12);
    expect(record.openrouterCostUsd).toBeCloseTo(0.09);
    expect(record.anthropicCostUsd).toBeCloseTo(0.03);
  });
});

describe('getRunById', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('returns null for unknown id', () => {
    expect(getRunById('does-not-exist')).toBeNull();
  });

  test('returns the run for a known id', () => {
    createRun(baseRun());
    const record = getRunById('run-001');
    expect(record).not.toBeNull();
    expect(record!.id).toBe('run-001');
  });
});

describe('updateRun', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('updates specified fields without touching others', () => {
    createRun(baseRun());
    const now = new Date().toISOString();
    updateRun('run-001', { status: 'completed', completedAt: now, durationMs: 5000 });
    const record = getRunById('run-001');
    expect(record!.status).toBe('completed');
    expect(record!.completedAt).toBe(now);
    expect(record!.durationMs).toBe(5000);
    // untouched field
    expect(record!.query).toBe('How can we improve remote collaboration?');
  });

  test('is a no-op when updates object is empty', () => {
    createRun(baseRun());
    expect(() => updateRun('run-001', {})).not.toThrow();
  });

  test('can mark a run as failed with an error message', () => {
    createRun(baseRun());
    updateRun('run-001', { status: 'failed', errorMessage: 'Clustering agent timed out' });
    const record = getRunById('run-001');
    expect(record!.status).toBe('failed');
    expect(record!.errorMessage).toBe('Clustering agent timed out');
  });
});

describe('markStaleRunsFailed', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('marks stale running runs as failed', () => {
    const staleTime = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    createRun({ ...baseRun(), startedAt: staleTime });

    const changed = markStaleRunsFailed(10 * 60 * 1000); // 10 min timeout

    expect(changed).toBe(1);
    const record = getRunById('run-001');
    expect(record!.status).toBe('failed');
    expect(record!.errorMessage).toBe('Run timed out or server restarted');
    expect(record!.completedAt).toBeDefined();
  });

  test('does not mark recently started running runs as failed', () => {
    const now = new Date().toISOString();
    createRun({ ...baseRun(), startedAt: now });

    const changed = markStaleRunsFailed(10 * 60 * 1000);

    expect(changed).toBe(0);
    const record = getRunById('run-001');
    expect(record!.status).toBe('running');
  });

  test('does not affect already completed or failed runs', () => {
    const staleTime = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    createRun({ ...baseRun(), id: 'run-a', startedAt: staleTime, status: 'completed' });
    createRun({ ...baseRun(), id: 'run-b', startedAt: staleTime, status: 'failed' });

    const changed = markStaleRunsFailed(10 * 60 * 1000);

    expect(changed).toBe(0);
  });

  test('returns count of rows updated', () => {
    const staleTime = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    createRun({ ...baseRun(), id: 'run-a', startedAt: staleTime });
    createRun({ ...baseRun(), id: 'run-b', startedAt: staleTime });

    const changed = markStaleRunsFailed(10 * 60 * 1000);
    expect(changed).toBe(2);
  });
});

describe('getRuns', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('returns empty array when no runs exist', () => {
    expect(getRuns()).toEqual([]);
  });

  test('returns all runs when no filter is applied', () => {
    createRun({ ...baseRun(), id: 'run-a' });
    createRun({ ...baseRun(), id: 'run-b', startedAt: new Date(Date.now() + 1).toISOString() });
    const records = getRuns();
    expect(records.length).toBe(2);
  });

  test('filters by status', () => {
    createRun({ ...baseRun(), id: 'run-running' });
    createRun({ ...baseRun(), id: 'run-done', status: 'completed' });
    const running = getRuns({ status: 'running' });
    expect(running.length).toBe(1);
    expect(running[0].id).toBe('run-running');
  });

  test('respects limit', () => {
    for (let i = 0; i < 5; i++) {
      createRun({ ...baseRun(), id: `run-${i}`, startedAt: new Date(Date.now() + i).toISOString() });
    }
    const limited = getRuns({ limit: 3 });
    expect(limited.length).toBe(3);
  });

  test('returns results in descending started_at order', () => {
    const t0 = new Date(1000).toISOString();
    const t1 = new Date(2000).toISOString();
    createRun({ ...baseRun(), id: 'run-old', startedAt: t0 });
    createRun({ ...baseRun(), id: 'run-new', startedAt: t1 });
    const records = getRuns();
    expect(records[0].id).toBe('run-new');
    expect(records[1].id).toBe('run-old');
  });
});
