/**
 * ISEE v2 — Dashboard Handlers
 *
 * Business logic for each dashboard endpoint.
 * Each handler checks the cache first, falls back to DB queries,
 * and populates the cache before returning.
 */

import { getCached, setCache } from './cache';
import {
  getDashboardSummaryStats,
  getRunsToday,
  getYesterdaySummary,
  getLatencyTimeSeries,
  getModelStatistics,
  getCostBreakdownStats,
  getActiveRunCount,
  getAvgCostPerRun,
} from '../db/metrics';
import { getRuns } from '../db/runs';
import { getCircuitBreaker } from '../resilience/circuit-breaker';
import { getDatabase } from '../db/connection';
import type {
  DashboardSummary,
  LatencyPoint,
  ModelStats,
  CostBreakdown,
  HealthStatus,
  RunRecord,
} from '../types';

// ---------------------------------------------------------------------------
// Cache TTLs (seconds)
// ---------------------------------------------------------------------------

const TTL_SUMMARY = 60;
const TTL_RUNS = 30;
const TTL_LATENCY = 60;
const TTL_MODELS = 60;
const TTL_COSTS = 300;
const TTL_HEALTH = 10;

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/dashboard/summary
 * Key metrics: run counts, success rate, latency, cost.
 * @param period - Time window for avg cost calculation: '24h' | '7d'
 */
export async function getSummary(period: '24h' | '7d' = '7d'): Promise<DashboardSummary> {
  const cacheKey = `summary:${period}`;
  const cached = getCached<DashboardSummary>(cacheKey);
  if (cached) return cached;

  const stats = getDashboardSummaryStats();
  const today = getRunsToday();
  const yesterday = getYesterdaySummary();

  const successRate = stats.totalRuns > 0
    ? (stats.completedRuns / stats.totalRuns) * 100
    : 0;
  const successRateChange = successRate - yesterday.successRate;
  const latencyChange = stats.avgLatencyMs - yesterday.avgLatencyMs;

  // Compute avg cost per run for the selected period
  const lookbackHours = period === '24h' ? 24 : 7 * 24;
  const avgCostPerRunUsd = getAvgCostPerRun(lookbackHours);

  const result: DashboardSummary = {
    totalRuns: stats.totalRuns,
    runsToday: today.count,
    successRate,
    successRateChange,
    avgLatencyMs: stats.avgLatencyMs,
    latencyChange,
    totalCostUsd: stats.totalCostUsd,
    costToday: today.costUsd,
    avgCostPerRunUsd,
    lastUpdated: new Date().toISOString(),
  };

  setCache(cacheKey, result, TTL_SUMMARY);
  return result;
}

/**
 * GET /api/dashboard/runs?limit=20&offset=0
 * Recent pipeline runs with pagination.
 */
export async function getRecentRuns(limit: number, offset: number): Promise<RunRecord[]> {
  const cacheKey = `runs:${limit}:${offset}`;
  const cached = getCached<RunRecord[]>(cacheKey);
  if (cached) return cached;

  // getRuns doesn't natively support offset, so we fetch limit+offset and slice
  const all = getRuns({ limit: limit + offset });
  const result = all.slice(offset, offset + limit);

  setCache(cacheKey, result, TTL_RUNS);
  return result;
}

/**
 * GET /api/dashboard/latency?period=24h
 * Latency time series. period: '24h' | '7d'
 */
export async function getLatencyTimeSeriesHandler(period: '24h' | '7d'): Promise<LatencyPoint[]> {
  const cacheKey = `latency:${period}`;
  const cached = getCached<LatencyPoint[]>(cacheKey);
  if (cached) return cached;

  const { bucketMinutes, lookbackHours } = period === '7d'
    ? { bucketMinutes: 1440, lookbackHours: 7 * 24 }
    : { bucketMinutes: 60, lookbackHours: 24 };

  const result = getLatencyTimeSeries(bucketMinutes, lookbackHours);

  setCache(cacheKey, result, TTL_LATENCY);
  return result;
}

/**
 * GET /api/dashboard/models
 * Per-model statistics.
 */
export async function getModelStats(): Promise<ModelStats[]> {
  const cached = getCached<ModelStats[]>('models');
  if (cached) return cached;

  const result = getModelStatistics();
  setCache('models', result, TTL_MODELS);
  return result;
}

/**
 * GET /api/dashboard/costs?period=7d
 * Cost breakdown by provider. period: '24h' | '7d' | '30d'
 */
export async function getCostBreakdown(period: '24h' | '7d' | '30d'): Promise<CostBreakdown> {
  const cacheKey = `costs:${period}`;
  const cached = getCached<CostBreakdown>(cacheKey);
  if (cached) return cached;

  const lookbackHours = period === '24h' ? 24 : period === '7d' ? 7 * 24 : 30 * 24;
  const stats = getCostBreakdownStats(lookbackHours);

  const result: CostBreakdown = {
    period,
    ...stats,
  };

  setCache(cacheKey, result, TTL_COSTS);
  return result;
}

/**
 * GET /api/dashboard/health
 * System health: DB connectivity, circuit breaker states, active runs.
 */
export async function getHealthStatus(): Promise<HealthStatus> {
  const cached = getCached<HealthStatus>('health');
  if (cached) return cached;

  // Check DB
  let dbStatus: 'ok' | 'error' = 'ok';
  try {
    const db = getDatabase();
    db.query('SELECT 1').get();
  } catch {
    dbStatus = 'error';
  }

  // Check circuit breaker states
  const orBreaker = getCircuitBreaker('openrouter');
  const anBreaker = getCircuitBreaker('anthropic');

  const orState = orBreaker.getState();
  const anState = anBreaker.getState();

  const orStatus: 'ok' | 'error' | 'circuit_open' =
    orState === 'open' ? 'circuit_open' : orState === 'half-open' ? 'circuit_open' : 'ok';
  const anStatus: 'ok' | 'error' | 'circuit_open' =
    anState === 'open' ? 'circuit_open' : anState === 'half-open' ? 'circuit_open' : 'ok';

  const activeRuns = getActiveRunCount();

  // Overall status
  let status: HealthStatus['status'] = 'healthy';
  if (dbStatus === 'error') {
    status = 'unhealthy';
  } else if (orStatus === 'circuit_open' || anStatus === 'circuit_open') {
    status = 'degraded';
  }

  const result: HealthStatus = {
    status,
    checks: {
      database: dbStatus,
      openrouter: orStatus,
      anthropic: anStatus,
    },
    activeRuns,
    timestamp: new Date().toISOString(),
  };

  setCache('health', result, TTL_HEALTH);
  return result;
}
