/**
 * Tests for cost aggregation via getCostsByProvider and the updateRun cost fields.
 *
 * Uses an in-memory SQLite database to avoid touching the real data file.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { initDatabase, closeDatabase, logLlmCall, getCostsByProvider, createRun, updateRun, getRunById } from '../src/db';

function setup() {
  process.env.DB_PATH = ':memory:';
  closeDatabase(); // reset singleton so new :memory: db is created
  initDatabase();
}

function teardown() {
  closeDatabase();
  delete process.env.DB_PATH;
}

describe('getCostsByProvider', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('returns zeros when no calls exist for run', () => {
    const result = getCostsByProvider('nonexistent-run');
    expect(result.totalCostUsd).toBe(0);
    expect(result.openrouterCostUsd).toBe(0);
    expect(result.anthropicCostUsd).toBe(0);
  });

  test('aggregates openrouter and anthropic costs separately', () => {
    const runId = 'test-run-1';
    createRun({ id: runId, query: 'test query', startedAt: new Date().toISOString() });

    logLlmCall({ runId, stage: 'synthesis', provider: 'openrouter', model: 'gpt-4', success: true, costUsd: 0.01, timestamp: new Date().toISOString() });
    logLlmCall({ runId, stage: 'synthesis', provider: 'openrouter', model: 'gpt-4', success: true, costUsd: 0.02, timestamp: new Date().toISOString() });
    logLlmCall({ runId, stage: 'clustering', provider: 'anthropic', model: 'claude-3', success: true, costUsd: 0.05, timestamp: new Date().toISOString() });

    const result = getCostsByProvider(runId);
    expect(result.openrouterCostUsd).toBeCloseTo(0.03);
    expect(result.anthropicCostUsd).toBeCloseTo(0.05);
    expect(result.totalCostUsd).toBeCloseTo(0.08);
  });

  test('handles null cost_usd entries gracefully', () => {
    const runId = 'test-run-null-cost';
    createRun({ id: runId, query: 'test query', startedAt: new Date().toISOString() });

    // cost_usd omitted — treated as null in DB
    logLlmCall({ runId, stage: 'synthesis', provider: 'openrouter', model: 'gpt-4', success: false, timestamp: new Date().toISOString() });
    logLlmCall({ runId, stage: 'synthesis', provider: 'openrouter', model: 'gpt-4', success: true, costUsd: 0.03, timestamp: new Date().toISOString() });

    const result = getCostsByProvider(runId);
    expect(result.openrouterCostUsd).toBeCloseTo(0.03);
    expect(result.totalCostUsd).toBeCloseTo(0.03);
  });

  test('does not include costs from other runs', () => {
    const runA = 'run-a';
    const runB = 'run-b';
    createRun({ id: runA, query: 'query A', startedAt: new Date().toISOString() });
    createRun({ id: runB, query: 'query B', startedAt: new Date().toISOString() });

    logLlmCall({ runId: runA, stage: 'synthesis', provider: 'openrouter', model: 'gpt-4', success: true, costUsd: 0.10, timestamp: new Date().toISOString() });
    logLlmCall({ runId: runB, stage: 'synthesis', provider: 'openrouter', model: 'gpt-4', success: true, costUsd: 0.99, timestamp: new Date().toISOString() });

    const result = getCostsByProvider(runA);
    expect(result.totalCostUsd).toBeCloseTo(0.10);
  });
});

describe('updateRun cost fields', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('stores aggregated costs on the run record', () => {
    const runId = 'cost-update-run';
    createRun({ id: runId, query: 'test', startedAt: new Date().toISOString() });

    logLlmCall({ runId, stage: 'synthesis', provider: 'openrouter', model: 'gpt-4', success: true, costUsd: 0.04, timestamp: new Date().toISOString() });
    logLlmCall({ runId, stage: 'clustering', provider: 'anthropic', model: 'claude-3', success: true, costUsd: 0.06, timestamp: new Date().toISOString() });

    const costs = getCostsByProvider(runId);
    updateRun(runId, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      totalCostUsd: costs.totalCostUsd,
      openrouterCostUsd: costs.openrouterCostUsd,
      anthropicCostUsd: costs.anthropicCostUsd,
    });

    const run = getRunById(runId);
    expect(run).not.toBeNull();
    expect(run!.totalCostUsd).toBeCloseTo(0.10);
    expect(run!.openrouterCostUsd).toBeCloseTo(0.04);
    expect(run!.anthropicCostUsd).toBeCloseTo(0.06);
    expect(run!.status).toBe('completed');
  });

  test('total_cost_usd remains null when no llm_calls exist', () => {
    const runId = 'no-calls-run';
    createRun({ id: runId, query: 'test', startedAt: new Date().toISOString() });

    const costs = getCostsByProvider(runId);
    // Both provider costs are 0 since no rows exist; totalCostUsd = 0 (not null)
    updateRun(runId, {
      status: 'completed',
      totalCostUsd: costs.totalCostUsd,
      openrouterCostUsd: costs.openrouterCostUsd,
      anthropicCostUsd: costs.anthropicCostUsd,
    });

    const run = getRunById(runId);
    expect(run!.totalCostUsd).toBe(0);
  });
});
