/**
 * ISEE v2 — LLM Call Logging
 *
 * Operations for the `llm_calls` table.
 * Every LLM API request during a pipeline run is recorded here for cost
 * tracking, latency analysis, and failure attribution.
 */

import { getDatabase } from './connection';
import type { LlmCallRecord } from '../types';

// ---------------------------------------------------------------------------
// Internal row shape (snake_case as stored in SQLite)
// ---------------------------------------------------------------------------

interface LlmCallRow {
  id: number;
  run_id: string;
  stage: string;
  provider: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  success: number; // SQLite stores booleans as integers
  error_type: string | null;
  error_message: string | null;
  cost_usd: number | null;
  framework: string | null;
  domain: string | null;
  cluster_id: number | null;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function rowToRecord(row: LlmCallRow): LlmCallRecord {
  return {
    runId: row.run_id,
    stage: row.stage,
    provider: row.provider as LlmCallRecord['provider'],
    model: row.model,
    ...(row.input_tokens != null && { inputTokens: row.input_tokens }),
    ...(row.output_tokens != null && { outputTokens: row.output_tokens }),
    ...(row.latency_ms != null && { latencyMs: row.latency_ms }),
    success: row.success === 1,
    ...(row.error_type != null && { errorType: row.error_type }),
    ...(row.error_message != null && { errorMessage: row.error_message }),
    ...(row.cost_usd != null && { costUsd: row.cost_usd }),
    ...(row.framework != null && { framework: row.framework }),
    ...(row.domain != null && { domain: row.domain }),
    ...(row.cluster_id != null && { clusterId: row.cluster_id }),
    timestamp: row.timestamp,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Inserts a single LLM call record into the database.
 * The call's `id` is auto-assigned by SQLite.
 */
export function logLlmCall(call: LlmCallRecord): void {
  const db = getDatabase();

  db.prepare(`
    INSERT INTO llm_calls (
      run_id, stage, provider, model,
      input_tokens, output_tokens, latency_ms, success,
      error_type, error_message, cost_usd,
      framework, domain, cluster_id, timestamp
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?
    )
  `).run(
    call.runId,
    call.stage,
    call.provider,
    call.model,
    call.inputTokens ?? null,
    call.outputTokens ?? null,
    call.latencyMs ?? null,
    call.success ? 1 : 0,
    call.errorType ?? null,
    call.errorMessage ?? null,
    call.costUsd ?? null,
    call.framework ?? null,
    call.domain ?? null,
    call.clusterId ?? null,
    call.timestamp,
  );
}

/**
 * Returns all LLM call records for the given run, ordered by timestamp ascending.
 */
export function getLlmCallsByRunId(runId: string): LlmCallRecord[] {
  const db = getDatabase();
  const rows = db.query<LlmCallRow, [string]>(
    'SELECT * FROM llm_calls WHERE run_id = ? ORDER BY timestamp ASC'
  ).all(runId);
  return rows.map(rowToRecord);
}

/**
 * Aggregates call statistics for a run.
 *
 * @returns An object containing the total call count, number of successful
 *          calls, and cumulative cost in USD.
 */
export function getCallStats(runId: string): {
  total: number;
  successful: number;
  totalCost: number;
} {
  const db = getDatabase();

  const row = db.query<
    { total: number; successful: number; total_cost: number | null },
    [string]
  >(
    `SELECT
       COUNT(*)                          AS total,
       SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successful,
       SUM(cost_usd)                     AS total_cost
     FROM llm_calls
     WHERE run_id = ?`
  ).get(runId);

  return {
    total: row?.total ?? 0,
    successful: row?.successful ?? 0,
    totalCost: row?.total_cost ?? 0,
  };
}
