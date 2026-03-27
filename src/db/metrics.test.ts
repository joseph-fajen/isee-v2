/**
 * ISEE v2 — getSparklineData Tests
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { getDatabase, closeDatabase } from './connection';
import { runMigrations } from './migrations';
import { migrations } from './schema';
import { createRun } from './runs';
import { getSparklineData } from './metrics';

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

describe('getSparklineData', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('returns empty arrays when no runs exist', () => {
    const data = getSparklineData(60, 24);
    expect(data.totalRuns).toHaveLength(0);
    expect(data.successRate).toHaveLength(0);
    expect(data.avgLatencyMs).toHaveLength(0);
    expect(data.totalCostUsd).toHaveLength(0);
    expect(data.avgCostPerRunUsd).toHaveLength(0);
  });

  test('returns correct SparklineData shape with runs in window', () => {
    const now = new Date().toISOString();
    createRun({ id: 'r1', query: 'q1', startedAt: now, status: 'completed', durationMs: 4000, totalCostUsd: 0.10 });
    createRun({ id: 'r2', query: 'q2', startedAt: now, status: 'failed' });
    const data = getSparklineData(60, 24);
    expect(data.totalRuns.length).toBeGreaterThan(0);
    const lastBucket = data.totalRuns.length - 1;
    expect(data.successRate[lastBucket]).toBeCloseTo(50, 0);
    expect(data.totalRuns[lastBucket]).toBe(2);
  });

  test('coerces null avgLatencyMs to 0 for failed runs', () => {
    const now = new Date().toISOString();
    createRun({ id: 'r1', query: 'q1', startedAt: now, status: 'failed' });
    const data = getSparklineData(60, 24);
    expect(data.avgLatencyMs.every(v => v === 0)).toBe(true);
  });

  test('excludes runs outside lookback window', () => {
    const old = new Date(Date.now() - 48 * 3_600_000).toISOString();
    createRun({ id: 'r-old', query: 'q', startedAt: old, status: 'completed' });
    const data = getSparklineData(60, 24);
    expect(data.totalRuns.reduce((a, b) => a + b, 0)).toBe(0);
  });

  test('all parallel arrays have the same length', () => {
    const now = new Date().toISOString();
    createRun({ id: 'r1', query: 'q1', startedAt: now, status: 'completed', durationMs: 2000, totalCostUsd: 0.05 });
    const data = getSparklineData(60, 24);
    const len = data.totalRuns.length;
    expect(data.successRate).toHaveLength(len);
    expect(data.avgLatencyMs).toHaveLength(len);
    expect(data.totalCostUsd).toHaveLength(len);
    expect(data.avgCostPerRunUsd).toHaveLength(len);
  });

  test('avgCostPerRunUsd excludes zero-cost runs', () => {
    const now = new Date().toISOString();
    // One run with cost, one without — avgCostPerRunUsd should reflect only the costed run
    createRun({ id: 'r1', query: 'q1', startedAt: now, status: 'completed', durationMs: 1000, totalCostUsd: 0.20 });
    createRun({ id: 'r2', query: 'q2', startedAt: now, status: 'completed', durationMs: 1000 }); // totalCostUsd = 0
    const data = getSparklineData(60, 24);
    const lastBucket = data.avgCostPerRunUsd.length - 1;
    // Only the run with cost > 0 contributes to the average
    expect(data.avgCostPerRunUsd[lastBucket]).toBeCloseTo(0.20, 5);
  });
});
