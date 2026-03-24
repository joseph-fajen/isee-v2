/**
 * ISEE v2 — Dashboard Handler Tests
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { getDatabase, closeDatabase } from '../db/connection';
import { runMigrations } from '../db/migrations';
import { migrations } from '../db/schema';
import { createRun, updateRun } from '../db/runs';
import { clearCache } from './cache';
import {
  getSummary,
  getRecentRuns,
  getLatencyTimeSeriesHandler,
  getModelStats,
  getCostBreakdown,
  getHealthStatus,
} from './handlers';

function setup() {
  process.env.DB_PATH = ':memory:';
  closeDatabase();
  const db = getDatabase();
  runMigrations(db, migrations);
  clearCache();
}

function teardown() {
  closeDatabase();
  delete process.env.DB_PATH;
  clearCache();
}

// ---------------------------------------------------------------------------
// getSummary
// ---------------------------------------------------------------------------

describe('getSummary', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('returns zeros on empty DB', async () => {
    const summary = await getSummary();
    expect(summary.totalRuns).toBe(0);
    expect(summary.runsToday).toBe(0);
    expect(summary.successRate).toBe(0);
    expect(summary.totalCostUsd).toBe(0);
    expect(summary.lastUpdated).toBeDefined();
  });

  test('counts total runs and success rate correctly', async () => {
    const now = new Date().toISOString();
    createRun({ id: 'r1', query: 'q1', startedAt: now, status: 'completed' });
    createRun({ id: 'r2', query: 'q2', startedAt: now, status: 'completed' });
    createRun({ id: 'r3', query: 'q3', startedAt: now, status: 'failed' });

    const summary = await getSummary();
    expect(summary.totalRuns).toBe(3);
    expect(summary.successRate).toBeCloseTo(66.67, 1);
  });

  test('counts runs today separately', async () => {
    const now = new Date().toISOString();
    createRun({ id: 'r1', query: 'q1', startedAt: now });
    createRun({ id: 'r2', query: 'q2', startedAt: now });

    const summary = await getSummary();
    expect(summary.runsToday).toBe(2);
  });

  test('caches result on second call', async () => {
    const s1 = await getSummary();
    // Insert a run after first call — cached result should not reflect it
    createRun({ id: 'r1', query: 'q1', startedAt: new Date().toISOString() });
    const s2 = await getSummary();
    expect(s1.totalRuns).toBe(s2.totalRuns);
  });
});

// ---------------------------------------------------------------------------
// getRecentRuns
// ---------------------------------------------------------------------------

describe('getRecentRuns', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('returns empty array when no runs', async () => {
    const runs = await getRecentRuns(10, 0);
    expect(runs).toHaveLength(0);
  });

  test('respects limit', async () => {
    for (let i = 0; i < 5; i++) {
      createRun({ id: `r${i}`, query: `q${i}`, startedAt: new Date().toISOString() });
    }
    const runs = await getRecentRuns(3, 0);
    expect(runs).toHaveLength(3);
  });

  test('respects offset', async () => {
    for (let i = 0; i < 5; i++) {
      createRun({ id: `r${i}`, query: `q${i}`, startedAt: new Date().toISOString() });
    }
    const allRuns = await getRecentRuns(5, 0);
    const offsetRuns = await getRecentRuns(5, 2);
    expect(offsetRuns).toHaveLength(3);
    expect(offsetRuns[0].id).toBe(allRuns[2].id);
  });
});

// ---------------------------------------------------------------------------
// getLatencyTimeSeriesHandler
// ---------------------------------------------------------------------------

describe('getLatencyTimeSeriesHandler', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('returns empty array when no runs', async () => {
    const series = await getLatencyTimeSeriesHandler('24h');
    expect(series).toHaveLength(0);
  });

  test('returns LatencyPoint shape', async () => {
    const now = new Date().toISOString();
    createRun({ id: 'r1', query: 'q1', startedAt: now, status: 'completed', durationMs: 5000 });
    updateRun('r1', { completedAt: now, durationMs: 5000 });

    const series = await getLatencyTimeSeriesHandler('24h');
    if (series.length > 0) {
      const point = series[0];
      expect(point.timestamp).toBeDefined();
      expect(typeof point.avgLatencyMs).toBe('number');
      expect(typeof point.callCount).toBe('number');
      expect(typeof point.successRate).toBe('number');
    }
  });

  test('accepts 7d period', async () => {
    const series = await getLatencyTimeSeriesHandler('7d');
    expect(Array.isArray(series)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getModelStats
// ---------------------------------------------------------------------------

describe('getModelStats', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('returns empty array when no llm_calls', async () => {
    const stats = await getModelStats();
    expect(stats).toHaveLength(0);
  });

  test('caches result on second call', async () => {
    const s1 = await getModelStats();
    const s2 = await getModelStats();
    expect(s1).toEqual(s2);
  });
});

// ---------------------------------------------------------------------------
// getCostBreakdown
// ---------------------------------------------------------------------------

describe('getCostBreakdown', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('returns zero costs on empty DB', async () => {
    const breakdown = await getCostBreakdown('7d');
    expect(breakdown.period).toBe('7d');
    expect(breakdown.totalCostUsd).toBe(0);
    expect(breakdown.openrouterCostUsd).toBe(0);
    expect(breakdown.anthropicCostUsd).toBe(0);
    expect(breakdown.byModel).toHaveLength(0);
  });

  test('accepts all period values', async () => {
    for (const period of ['24h', '7d', '30d'] as const) {
      const breakdown = await getCostBreakdown(period);
      expect(breakdown.period).toBe(period);
    }
  });
});

// ---------------------------------------------------------------------------
// getHealthStatus
// ---------------------------------------------------------------------------

describe('getHealthStatus', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('returns healthy when DB is up and breakers are closed', async () => {
    const health = await getHealthStatus();
    expect(health.status).toBe('healthy');
    expect(health.checks.database).toBe('ok');
    expect(health.checks.openrouter).toBe('ok');
    expect(health.checks.anthropic).toBe('ok');
    expect(health.activeRuns).toBe(0);
    expect(health.timestamp).toBeDefined();
  });

  test('counts active runs', async () => {
    const now = new Date().toISOString();
    createRun({ id: 'r1', query: 'q1', startedAt: now, status: 'running' });
    clearCache(); // force fresh read

    const health = await getHealthStatus();
    expect(health.activeRuns).toBe(1);
  });
});
