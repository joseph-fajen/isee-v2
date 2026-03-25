/**
 * ISEE v2 — Run Persistence
 *
 * CRUD operations for the `runs` table.
 * Each row tracks the lifecycle of one pipeline execution.
 */

import { getDatabase } from './connection';
import type { RunRecord } from '../types';

// ---------------------------------------------------------------------------
// Internal row shape (snake_case as stored in SQLite)
// ---------------------------------------------------------------------------

interface RunRow {
  id: string;
  api_key_id: string | null;
  query: string;
  refined_query: string | null;
  status: string;
  created_at: number;      // Unix epoch ms — from v1 schema (NOT NULL)
  started_at: string | null; // ISO-8601 — added in migration v2
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  synthesis_call_count: number | null;
  successful_calls: number | null;
  cluster_count: number | null;
  total_cost_usd: number | null;
  openrouter_cost_usd: number | null;
  anthropic_cost_usd: number | null;
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function rowToRecord(row: RunRow): RunRecord {
  // started_at was added in migration v2; fall back to created_at for old rows
  const startedAt = row.started_at ?? new Date(row.created_at).toISOString();

  return {
    id: row.id,
    ...(row.api_key_id != null && { apiKeyId: row.api_key_id }),
    query: row.query,
    ...(row.refined_query != null && { refinedQuery: row.refined_query }),
    status: row.status as RunRecord['status'],
    startedAt,
    ...(row.completed_at != null && { completedAt: row.completed_at }),
    ...(row.duration_ms != null && { durationMs: row.duration_ms }),
    ...(row.error_message != null && { errorMessage: row.error_message }),
    ...(row.synthesis_call_count != null && { synthesisCallCount: row.synthesis_call_count }),
    ...(row.successful_calls != null && { successfulCalls: row.successful_calls }),
    ...(row.cluster_count != null && { clusterCount: row.cluster_count }),
    ...(row.total_cost_usd != null && { totalCostUsd: row.total_cost_usd }),
    ...(row.openrouter_cost_usd != null && { openrouterCostUsd: row.openrouter_cost_usd }),
    ...(row.anthropic_cost_usd != null && { anthropicCostUsd: row.anthropic_cost_usd }),
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Inserts a new run record. At minimum `id`, `query`, and `startedAt` must be
 * provided; all other fields are optional and default to their column defaults.
 *
 * @returns The newly created RunRecord as stored in the database.
 */
export function createRun(run: Partial<RunRecord> & { id: string; query: string; startedAt: string }): RunRecord {
  const db = getDatabase();

  const now = run.startedAt ?? new Date().toISOString();

  db.prepare(`
    INSERT INTO runs (
      id, api_key_id, query, refined_query, status,
      created_at, started_at,
      completed_at, duration_ms, error_message,
      synthesis_call_count, successful_calls, cluster_count,
      total_cost_usd, openrouter_cost_usd, anthropic_cost_usd
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?
    )
  `).run(
    run.id,
    run.apiKeyId ?? null,
    run.query,
    run.refinedQuery ?? null,
    run.status ?? 'running',
    Date.now(),
    now,
    run.completedAt ?? null,
    run.durationMs ?? null,
    run.errorMessage ?? null,
    run.synthesisCallCount ?? null,
    run.successfulCalls ?? null,
    run.clusterCount ?? null,
    run.totalCostUsd ?? null,
    run.openrouterCostUsd ?? null,
    run.anthropicCostUsd ?? null,
  );

  // Return the persisted record (always present since INSERT just succeeded)
  return getRunById(run.id) as RunRecord;
}

/**
 * Retrieves a run by its ID.
 *
 * @returns The RunRecord, or `null` if not found.
 */
export function getRunById(id: string): RunRecord | null {
  const db = getDatabase();
  const row = db.query<RunRow, [string]>('SELECT * FROM runs WHERE id = ?').get(id);
  return row ? rowToRecord(row) : null;
}

/**
 * Applies a partial update to a run.
 * Only the fields present in `updates` are modified.
 */
export function updateRun(id: string, updates: Partial<RunRecord>): void {
  const db = getDatabase();

  const fieldMap: Record<string, string> = {
    apiKeyId: 'api_key_id',
    query: 'query',
    refinedQuery: 'refined_query',
    status: 'status',
    startedAt: 'started_at', // v2 column
    completedAt: 'completed_at',
    durationMs: 'duration_ms',
    errorMessage: 'error_message',
    synthesisCallCount: 'synthesis_call_count',
    successfulCalls: 'successful_calls',
    clusterCount: 'cluster_count',
    totalCostUsd: 'total_cost_usd',
    openrouterCostUsd: 'openrouter_cost_usd',
    anthropicCostUsd: 'anthropic_cost_usd',
  };

  const setClauses: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    const column = fieldMap[key];
    if (column) {
      setClauses.push(`${column} = ?`);
      values.push(value ?? null);
    }
  }

  if (setClauses.length === 0) return;

  values.push(id);
  db.prepare(`UPDATE runs SET ${setClauses.join(', ')} WHERE id = ?`).run(...(values as any[]));
}

/**
 * Mark any runs that are still 'running' after `timeoutMs` as 'failed'.
 * Call this at server startup and/or before computing dashboard stats
 * to fix orphaned runs from past crashes.
 *
 * @returns The number of rows updated.
 */
export function markStaleRunsFailed(timeoutMs: number): number {
  const db = getDatabase();
  const cutoff = new Date(Date.now() - timeoutMs).toISOString();
  const result = db.prepare(`
    UPDATE runs
    SET status = 'failed',
        completed_at = ?,
        error_message = 'Run timed out or server restarted'
    WHERE status = 'running'
      AND started_at IS NOT NULL
      AND started_at < ?
  `).run(new Date().toISOString(), cutoff);
  return result.changes;
}

/**
 * Returns a list of runs, optionally filtered by status and capped at a limit.
 * Results are ordered by `started_at` descending (most recent first).
 */
export function getRuns(options: { status?: string; limit?: number } = {}): RunRecord[] {
  const db = getDatabase();
  const { status, limit = 100 } = options;

  if (status) {
    const rows = db.query<RunRow, [string, number]>(
      'SELECT * FROM runs WHERE status = ? ORDER BY COALESCE(started_at, datetime(created_at / 1000, \'unixepoch\')) DESC LIMIT ?'
    ).all(status, limit);
    return rows.map(rowToRecord);
  }

  const rows = db.query<RunRow, [number]>(
    'SELECT * FROM runs ORDER BY COALESCE(started_at, datetime(created_at / 1000, \'unixepoch\')) DESC LIMIT ?'
  ).all(limit);
  return rows.map(rowToRecord);
}
