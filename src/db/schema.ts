/**
 * ISEE v2 — Database Schema
 *
 * Defines all migrations that make up the database schema.
 * Add new migrations at the end of the array; never edit existing ones.
 *
 * Tables:
 *   runs       — one row per pipeline execution (lifecycle tracking)
 *   briefings  — the output of a completed run (ideas, debate, markdown)
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
];
