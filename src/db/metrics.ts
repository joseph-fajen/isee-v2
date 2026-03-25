/**
 * ISEE v2 — Metrics Storage
 *
 * Queries live data from `runs` and `llm_calls` for Prometheus export.
 * Also manages the `metrics_hourly` table for trend analysis.
 */

import { getDatabase } from './connection';
import type { LatencyPoint, ModelStats } from '../types';

// ---------------------------------------------------------------------------
// Live metric queries (for Prometheus /api/metrics endpoint)
// ---------------------------------------------------------------------------

export interface PipelineRunCounts {
  status: string;
  count: number;
}

export interface LlmRequestCounts {
  provider: string;
  model: string;
  status: string; // 'success' | 'failure'
  count: number;
}

export interface LlmTokenCounts {
  provider: string;
  model: string;
  direction: string; // 'input' | 'output'
  total: number;
}

export interface LlmCostTotal {
  provider: string;
  model: string;
  totalCost: number;
}

export interface LlmLatencyBucket {
  provider: string;
  model: string;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  count: number;
  sum: number;
}

/** Count pipeline runs grouped by status. */
export function getPipelineRunCounts(): PipelineRunCounts[] {
  const db = getDatabase();
  return db.query<PipelineRunCounts, []>(
    `SELECT status, COUNT(*) AS count FROM runs GROUP BY status`
  ).all();
}

/** Count LLM calls grouped by provider, model, and success/failure. */
export function getLlmRequestCounts(): LlmRequestCounts[] {
  const db = getDatabase();
  const rows = db.query<{ provider: string; model: string; success: number; count: number }, []>(
    `SELECT provider, model, success, COUNT(*) AS count FROM llm_calls GROUP BY provider, model, success`
  ).all();
  return rows.map(row => ({
    provider: row.provider,
    model: row.model,
    status: row.success === 1 ? 'success' : 'failure',
    count: row.count,
  }));
}

/** Sum tokens grouped by provider, model, and direction. */
export function getLlmTokenCounts(): LlmTokenCounts[] {
  const db = getDatabase();
  const rows = db.query<{ provider: string; model: string; input_total: number; output_total: number }, []>(
    `SELECT provider, model, COALESCE(SUM(input_tokens), 0) AS input_total, COALESCE(SUM(output_tokens), 0) AS output_total
     FROM llm_calls GROUP BY provider, model`
  ).all();

  const result: LlmTokenCounts[] = [];
  for (const row of rows) {
    result.push({ provider: row.provider, model: row.model, direction: 'input', total: row.input_total });
    result.push({ provider: row.provider, model: row.model, direction: 'output', total: row.output_total });
  }
  return result;
}

/** Sum cost grouped by provider and model. */
export function getLlmCostTotals(): LlmCostTotal[] {
  const db = getDatabase();
  return db.query<LlmCostTotal, []>(
    `SELECT provider, model, COALESCE(SUM(cost_usd), 0) AS totalCost
     FROM llm_calls WHERE cost_usd IS NOT NULL GROUP BY provider, model`
  ).all();
}

/** Compute latency statistics grouped by provider and model. */
export function getLlmLatencyStats(): LlmLatencyBucket[] {
  const db = getDatabase();
  const rows = db.query<{
    provider: string;
    model: string;
    count: number;
    sum: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  }, []>(
    `SELECT
       provider,
       model,
       COUNT(*) AS count,
       COALESCE(SUM(latency_ms), 0) AS sum,
       CAST(latency_ms AS REAL) AS p50,
       CAST(latency_ms AS REAL) AS p90,
       CAST(latency_ms AS REAL) AS p95,
       CAST(latency_ms AS REAL) AS p99
     FROM (
       SELECT provider, model, latency_ms,
              NTILE(100) OVER (PARTITION BY provider, model ORDER BY latency_ms) AS pct
       FROM llm_calls WHERE latency_ms IS NOT NULL AND success = 1
     )
     GROUP BY provider, model`
  ).all();

  // For simplicity, compute approximate percentiles per group
  return rows.map(r => ({
    provider: r.provider,
    model: r.model,
    p50: r.p50 / 1000,
    p90: r.p90 / 1000,
    p95: r.p95 / 1000,
    p99: r.p99 / 1000,
    count: r.count,
    sum: r.sum / 1000,
  }));
}

/** Count total pipeline runs and successful calls for quality metrics. */
export function getQualityMetrics(): { avgSynthesisResponses: number; avgClusters: number } {
  const db = getDatabase();
  const row = db.query<{ avgSynthesis: number | null; avgClusters: number | null }, []>(
    `SELECT AVG(synthesis_call_count) AS avgSynthesis, AVG(cluster_count) AS avgClusters
     FROM runs WHERE status = 'completed'`
  ).get();

  return {
    avgSynthesisResponses: row?.avgSynthesis ?? 0,
    avgClusters: row?.avgClusters ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Dashboard aggregation queries
// ---------------------------------------------------------------------------

export interface DashboardSummaryRow {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  runningRuns: number;
  avgLatencyMs: number;
  totalCostUsd: number;
}

/** Aggregate summary stats across all runs. */
export function getDashboardSummaryStats(): DashboardSummaryRow {
  const db = getDatabase();
  const row = db.query<{
    totalRuns: number;
    completedRuns: number;
    failedRuns: number;
    runningRuns: number;
    avgLatencyMs: number | null;
    totalCostUsd: number | null;
  }, []>(
    `SELECT
       COUNT(*) AS totalRuns,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completedRuns,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failedRuns,
       SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS runningRuns,
       AVG(CASE WHEN status = 'completed' THEN duration_ms END) AS avgLatencyMs,
       COALESCE(SUM(total_cost_usd), 0) AS totalCostUsd
     FROM runs`
  ).get();

  return {
    totalRuns: row?.totalRuns ?? 0,
    completedRuns: row?.completedRuns ?? 0,
    failedRuns: row?.failedRuns ?? 0,
    runningRuns: row?.runningRuns ?? 0,
    avgLatencyMs: row?.avgLatencyMs ?? 0,
    totalCostUsd: row?.totalCostUsd ?? 0,
  };
}

/** Get run count and cost for today (UTC). */
export function getRunsToday(): { count: number; costUsd: number } {
  const db = getDatabase();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const row = db.query<{ count: number; costUsd: number | null }, [string]>(
    `SELECT COUNT(*) AS count, COALESCE(SUM(total_cost_usd), 0) AS costUsd
     FROM runs
     WHERE COALESCE(started_at, datetime(created_at / 1000, 'unixepoch')) >= ?`,
  ).get(todayIso);

  return { count: row?.count ?? 0, costUsd: row?.costUsd ?? 0 };
}

/**
 * Get summary stats for the previous calendar day (for computing change deltas).
 */
export function getYesterdaySummary(): { successRate: number; avgLatencyMs: number; costUsd: number } {
  const db = getDatabase();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);

  const row = db.query<{
    total: number;
    completed: number;
    avgLatency: number | null;
    costUsd: number | null;
  }, [string, string]>(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
       AVG(CASE WHEN status = 'completed' THEN duration_ms END) AS avgLatency,
       COALESCE(SUM(total_cost_usd), 0) AS costUsd
     FROM runs
     WHERE COALESCE(started_at, datetime(created_at / 1000, 'unixepoch')) >= ?
       AND COALESCE(started_at, datetime(created_at / 1000, 'unixepoch')) < ?`,
  ).get(yesterdayStart.toISOString(), todayStart.toISOString());

  const total = row?.total ?? 0;
  const completed = row?.completed ?? 0;
  return {
    successRate: total > 0 ? (completed / total) * 100 : 0,
    avgLatencyMs: row?.avgLatency ?? 0,
    costUsd: row?.costUsd ?? 0,
  };
}

/**
 * Get latency time series bucketed by period.
 * @param bucketMinutes - Size of each time bucket in minutes (e.g. 60 = hourly)
 * @param lookbackHours - How far back to look (e.g. 24 = last 24 hours)
 */
export function getLatencyTimeSeries(bucketMinutes: number, lookbackHours: number): LatencyPoint[] {
  const db = getDatabase();
  const since = new Date(Date.now() - lookbackHours * 3_600_000).toISOString();

  // SQLite strftime for bucketing: truncate to the nearest N-minute boundary
  // We round down started_at to bucket boundaries using integer division on epoch seconds
  const bucketSeconds = bucketMinutes * 60;

  const rows = db.query<{
    bucket: string;
    avgLatencyMs: number;
    callCount: number;
    successCount: number;
    avgPrep: number | null;
    avgSynthesis: number | null;
    avgClustering: number | null;
    avgTournament: number | null;
    avgSynthesizer: number | null;
    avgTranslation: number | null;
  }, [string]>(
    `SELECT
       datetime(
         (strftime('%s', COALESCE(started_at, datetime(created_at / 1000, 'unixepoch'))) / ${bucketSeconds}) * ${bucketSeconds},
         'unixepoch'
       ) AS bucket,
       AVG(CASE WHEN status = 'completed' THEN duration_ms ELSE NULL END) AS avgLatencyMs,
       COUNT(*) AS callCount,
       SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS successCount,
       AVG(CASE WHEN status = 'completed' THEN json_extract(stats_json, '$.stageDurations.prep') ELSE NULL END) AS avgPrep,
       AVG(CASE WHEN status = 'completed' THEN json_extract(stats_json, '$.stageDurations.synthesis') ELSE NULL END) AS avgSynthesis,
       AVG(CASE WHEN status = 'completed' THEN json_extract(stats_json, '$.stageDurations.clustering') ELSE NULL END) AS avgClustering,
       AVG(CASE WHEN status = 'completed' THEN json_extract(stats_json, '$.stageDurations.tournament') ELSE NULL END) AS avgTournament,
       AVG(CASE WHEN status = 'completed' THEN json_extract(stats_json, '$.stageDurations.synthesizer') ELSE NULL END) AS avgSynthesizer,
       AVG(CASE WHEN status = 'completed' THEN json_extract(stats_json, '$.stageDurations.translation') ELSE NULL END) AS avgTranslation
     FROM runs
     WHERE COALESCE(started_at, datetime(created_at / 1000, 'unixepoch')) >= ?
     GROUP BY bucket
     ORDER BY bucket ASC`,
  ).all(since);

  return rows.map(r => {
    const hasStages = r.avgPrep !== null || r.avgSynthesis !== null;
    return {
      timestamp: r.bucket + 'Z',
      avgLatencyMs: r.avgLatencyMs ?? 0,
      callCount: r.callCount,
      successRate: r.callCount > 0 ? (r.successCount / r.callCount) * 100 : 0,
      ...(hasStages && {
        stageDurations: {
          prep: r.avgPrep ?? 0,
          synthesis: r.avgSynthesis ?? 0,
          clustering: r.avgClustering ?? 0,
          tournament: r.avgTournament ?? 0,
          synthesizer: r.avgSynthesizer ?? 0,
          translation: r.avgTranslation ?? 0,
        },
      }),
    };
  });
}

/**
 * Get per-model statistics with proper percentile approximation.
 * Note: SQLite doesn't have native percentile functions, so we approximate
 * p95 using NTILE ordering within each group.
 */
export function getModelStatistics(): ModelStats[] {
  const db = getDatabase();

  // First get basic aggregates per provider+model
  const rows = db.query<{
    provider: string;
    model: string;
    totalCalls: number;
    successCount: number;
    avgLatencyMs: number | null;
    totalCostUsd: number | null;
  }, []>(
    `SELECT
       provider,
       model,
       COUNT(*) AS totalCalls,
       SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successCount,
       AVG(CASE WHEN success = 1 THEN latency_ms ELSE NULL END) AS avgLatencyMs,
       COALESCE(SUM(cost_usd), 0) AS totalCostUsd
     FROM llm_calls
     GROUP BY provider, model
     ORDER BY provider, model`,
  ).all();

  // Get p95 per provider+model using application-level percentile calculation.
  // Fetching sorted latency values per model and computing percentile in TS
  // is simpler and always correct regardless of sample size.
  const latencyRows = db.query<{ provider: string; model: string; latency_ms: number }, []>(
    `SELECT provider, model, latency_ms
     FROM llm_calls
     WHERE latency_ms IS NOT NULL AND success = 1
     ORDER BY provider, model, latency_ms`,
  ).all();

  const latencyGroups = new Map<string, number[]>();
  for (const r of latencyRows) {
    const key = `${r.provider}:${r.model}`;
    const arr = latencyGroups.get(key) ?? [];
    arr.push(r.latency_ms);
    latencyGroups.set(key, arr);
  }

  const p95Map = new Map<string, number>();
  for (const [key, values] of latencyGroups) {
    // values is already sorted ASC by the SQL ORDER BY
    const idx = Math.ceil(values.length * 0.95) - 1;
    p95Map.set(key, values[Math.max(0, idx)]);
  }

  return rows.map(r => ({
    provider: r.provider,
    model: r.model,
    totalCalls: r.totalCalls,
    successRate: r.totalCalls > 0 ? (r.successCount / r.totalCalls) * 100 : 0,
    avgLatencyMs: r.avgLatencyMs ?? 0,
    p95LatencyMs: p95Map.get(`${r.provider}:${r.model}`) ?? 0,
    totalCostUsd: r.totalCostUsd ?? 0,
  }));
}

/**
 * Get cost breakdown by provider and model for a given lookback window.
 */
export function getCostBreakdownStats(lookbackHours: number): {
  totalCostUsd: number;
  openrouterCostUsd: number;
  anthropicCostUsd: number;
  byModel: Array<{ model: string; costUsd: number }>;
} {
  const db = getDatabase();
  const since = new Date(Date.now() - lookbackHours * 3_600_000).toISOString();

  const providerRows = db.query<{ provider: string; costUsd: number }, [string]>(
    `SELECT provider, COALESCE(SUM(cost_usd), 0) AS costUsd
     FROM llm_calls
     WHERE timestamp >= ? AND cost_usd IS NOT NULL
     GROUP BY provider`,
  ).all(since);

  const modelRows = db.query<{ model: string; costUsd: number }, [string]>(
    `SELECT model, COALESCE(SUM(cost_usd), 0) AS costUsd
     FROM llm_calls
     WHERE timestamp >= ? AND cost_usd IS NOT NULL
     GROUP BY model
     ORDER BY costUsd DESC`,
  ).all(since);

  let openrouterCostUsd = 0;
  let anthropicCostUsd = 0;
  for (const r of providerRows) {
    if (r.provider === 'openrouter') openrouterCostUsd = r.costUsd;
    else if (r.provider === 'anthropic') anthropicCostUsd = r.costUsd;
  }

  return {
    totalCostUsd: openrouterCostUsd + anthropicCostUsd,
    openrouterCostUsd,
    anthropicCostUsd,
    byModel: modelRows.map(r => ({ model: r.model, costUsd: r.costUsd })),
  };
}

/** Count runs currently in 'running' status. */
export function getActiveRunCount(): number {
  const db = getDatabase();
  const row = db.query<{ count: number }, []>(
    `SELECT COUNT(*) AS count FROM runs WHERE status = 'running'`,
  ).get();
  return row?.count ?? 0;
}

// ---------------------------------------------------------------------------
// Hourly aggregation (for trend storage)
// ---------------------------------------------------------------------------

/** Upsert a metric value into the hourly aggregates table. */
export function upsertHourlyMetric(
  hour: string,
  metricName: string,
  labels: Record<string, string>,
  value: number
): void {
  const db = getDatabase();
  const labelsJson = JSON.stringify(labels);
  db.prepare(
    `INSERT INTO metrics_hourly (hour, metric_name, labels_json, value)
     VALUES (?, ?, ?, ?)
     ON CONFLICT (hour, metric_name, labels_json) DO UPDATE SET value = excluded.value`
  ).run(hour, metricName, labelsJson, value);
}

/** Get the current hour in ISO-8601 format (truncated to hour boundary). */
export function currentHour(): string {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
