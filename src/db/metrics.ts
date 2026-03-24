/**
 * ISEE v2 — Metrics Storage
 *
 * Queries live data from `runs` and `llm_calls` for Prometheus export.
 * Also manages the `metrics_hourly` table for trend analysis.
 */

import { getDatabase } from './connection';

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
