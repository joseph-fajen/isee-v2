/**
 * ISEE v2 — Database Schema
 *
 * Defines all migrations that make up the database schema.
 * Add new migrations at the end of the array; never edit existing ones.
 *
 * Migrations:
 *   v1 — initial_schema: runs + briefings tables
 *   v2 — extend_runs: add cost/stats/auth columns and started_at to runs
 *   v3 — add_llm_calls: per-call telemetry table
 */

import type { Migration } from './migrations';

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    sql: `
      -- Tracks the lifecycle of each pipeline execution.
      CREATE TABLE IF NOT EXISTS runs (
        id           TEXT    PRIMARY KEY,          -- UUID assigned at run start
        query        TEXT    NOT NULL,             -- The user's query (refined or original)
        status       TEXT    NOT NULL DEFAULT 'running',  -- 'running' | 'completed' | 'failed'
        created_at   INTEGER NOT NULL,             -- Unix epoch ms
        completed_at INTEGER,                      -- NULL until run finishes
        duration_ms  INTEGER,                      -- Total pipeline duration
        error_message TEXT,                        -- Set on failure
        stats_json   TEXT                          -- JSON-serialised RunStats (nullable)
      );

      CREATE INDEX IF NOT EXISTS idx_runs_status     ON runs (status);
      CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs (created_at DESC);

      -- Stores the output produced by a successfully completed run.
      CREATE TABLE IF NOT EXISTS briefings (
        id           TEXT    PRIMARY KEY,          -- UUID (same as run_id for 1-to-1 mapping)
        run_id       TEXT    NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
        query        TEXT    NOT NULL,
        timestamp    TEXT    NOT NULL,             -- ISO-8601 string from Briefing.timestamp
        ideas_json   TEXT    NOT NULL,             -- JSON-serialised ExtractedIdea[]
        debate_json  TEXT    NOT NULL,             -- JSON-serialised DebateEntry[]
        domains_json TEXT    NOT NULL,             -- JSON-serialised Domain[]
        markdown     TEXT    NOT NULL,             -- Full rendered markdown briefing
        created_at   INTEGER NOT NULL              -- Unix epoch ms
      );

      CREATE INDEX IF NOT EXISTS idx_briefings_run_id    ON briefings (run_id);
      CREATE INDEX IF NOT EXISTS idx_briefings_created_at ON briefings (created_at DESC);
    `,
  },
  {
    version: 2,
    name: 'extend_runs',
    sql: `
      -- Add production-layer columns to the runs table.
      -- SQLite only supports ADD COLUMN, so these are appended one by one.
      ALTER TABLE runs ADD COLUMN api_key_id        TEXT;
      ALTER TABLE runs ADD COLUMN refined_query     TEXT;
      ALTER TABLE runs ADD COLUMN started_at        TEXT;
      ALTER TABLE runs ADD COLUMN synthesis_call_count INTEGER;
      ALTER TABLE runs ADD COLUMN successful_calls  INTEGER;
      ALTER TABLE runs ADD COLUMN cluster_count     INTEGER;
      ALTER TABLE runs ADD COLUMN total_cost_usd    REAL;
      ALTER TABLE runs ADD COLUMN openrouter_cost_usd REAL;
      ALTER TABLE runs ADD COLUMN anthropic_cost_usd  REAL;

      -- Back-fill started_at from created_at for any existing rows.
      UPDATE runs SET started_at = datetime(created_at / 1000, 'unixepoch') WHERE started_at IS NULL;
    `,
  },
  {
    version: 3,
    name: 'add_llm_calls',
    sql: `
      -- Per-call telemetry for every LLM request within a pipeline run.
      CREATE TABLE IF NOT EXISTS llm_calls (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id        TEXT    NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
        stage         TEXT    NOT NULL,             -- pipeline stage that made the call
        provider      TEXT    NOT NULL,             -- 'openrouter' | 'anthropic'
        model         TEXT    NOT NULL,             -- model identifier
        input_tokens  INTEGER,                      -- prompt token count
        output_tokens INTEGER,                      -- completion token count
        latency_ms    INTEGER,                      -- wall-clock ms for the call
        success       INTEGER NOT NULL DEFAULT 1,   -- 1 = success, 0 = failure (SQLite bool)
        error_type    TEXT,                         -- e.g. 'rate_limit_exceeded'
        error_message TEXT,                         -- full error message if failed
        cost_usd      REAL,                         -- computed cost in USD
        framework     TEXT,                         -- cognitive framework (synthesis stage)
        domain        TEXT,                         -- knowledge domain (synthesis stage)
        cluster_id    INTEGER,                      -- cluster id (tournament stage)
        timestamp     TEXT    NOT NULL              -- ISO-8601 call timestamp
      );

      CREATE INDEX IF NOT EXISTS idx_llm_calls_run_id ON llm_calls (run_id);
    `,
  },
];
