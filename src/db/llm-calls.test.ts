import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { getDatabase, closeDatabase } from './connection';
import { runMigrations } from './migrations';
import { migrations } from './schema';
import { createRun } from './runs';
import { logLlmCall, getLlmCallsByRunId, getCallStats } from './llm-calls';
import type { LlmCallRecord } from '../types';

function setup() {
  process.env.DB_PATH = ':memory:';
  closeDatabase();
  const db = getDatabase();
  runMigrations(db, migrations);
  // Seed a parent run so FK constraint is satisfied
  createRun({ id: 'run-001', query: 'Test query', startedAt: new Date().toISOString() });
}

function teardown() {
  closeDatabase();
  delete process.env.DB_PATH;
}

const baseCall = (): LlmCallRecord => ({
  runId: 'run-001',
  stage: 'synthesis',
  provider: 'openrouter',
  model: 'anthropic/claude-sonnet-4',
  inputTokens: 500,
  outputTokens: 300,
  latencyMs: 1200,
  success: true,
  costUsd: 0.006,
  framework: 'analytical',
  domain: 'Behavioral Economics',
  timestamp: new Date().toISOString(),
});

describe('logLlmCall', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('inserts a call without throwing', () => {
    expect(() => logLlmCall(baseCall())).not.toThrow();
  });

  test('inserts a failed call with error fields', () => {
    const call: LlmCallRecord = {
      ...baseCall(),
      success: false,
      errorType: 'rate_limit_exceeded',
      errorMessage: 'Too many requests',
      costUsd: undefined,
    };
    expect(() => logLlmCall(call)).not.toThrow();
  });

  test('inserts a call with minimal required fields', () => {
    const minimal: LlmCallRecord = {
      runId: 'run-001',
      stage: 'clustering',
      provider: 'anthropic',
      model: 'claude-sonnet-4-20250514',
      success: true,
      timestamp: new Date().toISOString(),
    };
    expect(() => logLlmCall(minimal)).not.toThrow();
  });
});

describe('getLlmCallsByRunId', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('returns empty array when no calls exist for run', () => {
    expect(getLlmCallsByRunId('run-001')).toEqual([]);
  });

  test('returns only calls for the specified run', () => {
    // Second run for isolation check
    createRun({ id: 'run-002', query: 'Another query', startedAt: new Date().toISOString() });

    logLlmCall(baseCall()); // run-001
    logLlmCall({ ...baseCall(), runId: 'run-002', model: 'openai/gpt-4o' });

    const calls = getLlmCallsByRunId('run-001');
    expect(calls.length).toBe(1);
    expect(calls[0].runId).toBe('run-001');
    expect(calls[0].model).toBe('anthropic/claude-sonnet-4');
  });

  test('maps all fields correctly for a successful call', () => {
    logLlmCall(baseCall());
    const [call] = getLlmCallsByRunId('run-001');
    expect(call.stage).toBe('synthesis');
    expect(call.provider).toBe('openrouter');
    expect(call.model).toBe('anthropic/claude-sonnet-4');
    expect(call.inputTokens).toBe(500);
    expect(call.outputTokens).toBe(300);
    expect(call.latencyMs).toBe(1200);
    expect(call.success).toBe(true);
    expect(call.costUsd).toBeCloseTo(0.006);
    expect(call.framework).toBe('analytical');
    expect(call.domain).toBe('Behavioral Economics');
  });

  test('maps success = false correctly', () => {
    logLlmCall({ ...baseCall(), success: false, errorType: 'timeout' });
    const [call] = getLlmCallsByRunId('run-001');
    expect(call.success).toBe(false);
    expect(call.errorType).toBe('timeout');
  });

  test('returns calls ordered by timestamp ascending', () => {
    const t0 = new Date(1000).toISOString();
    const t1 = new Date(2000).toISOString();
    logLlmCall({ ...baseCall(), timestamp: t1 });
    logLlmCall({ ...baseCall(), timestamp: t0 });
    const calls = getLlmCallsByRunId('run-001');
    expect(calls[0].timestamp).toBe(t0);
    expect(calls[1].timestamp).toBe(t1);
  });
});

describe('getCallStats', () => {
  beforeEach(setup);
  afterEach(teardown);

  test('returns zeros when run has no calls', () => {
    const stats = getCallStats('run-001');
    expect(stats.total).toBe(0);
    expect(stats.successful).toBe(0);
    expect(stats.totalCost).toBe(0);
  });

  test('counts total and successful calls', () => {
    logLlmCall(baseCall()); // success
    logLlmCall({ ...baseCall(), success: false, costUsd: 0 }); // failure
    const stats = getCallStats('run-001');
    expect(stats.total).toBe(2);
    expect(stats.successful).toBe(1);
  });

  test('sums cost_usd correctly', () => {
    logLlmCall({ ...baseCall(), costUsd: 0.01 });
    logLlmCall({ ...baseCall(), costUsd: 0.02 });
    const stats = getCallStats('run-001');
    expect(stats.totalCost).toBeCloseTo(0.03);
  });

  test('treats null cost_usd as 0 in sum', () => {
    logLlmCall({ ...baseCall(), costUsd: undefined });
    const stats = getCallStats('run-001');
    expect(stats.totalCost).toBe(0);
  });

  test('only counts calls belonging to the specified run', () => {
    createRun({ id: 'run-002', query: 'Another query', startedAt: new Date().toISOString() });
    logLlmCall({ ...baseCall(), costUsd: 0.05 });
    logLlmCall({ ...baseCall(), runId: 'run-002', costUsd: 0.99 });
    const stats = getCallStats('run-001');
    expect(stats.total).toBe(1);
    expect(stats.totalCost).toBeCloseTo(0.05);
  });
});
