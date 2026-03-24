# ISEE v2 — Production Layer Specification

**Status**: Draft
**Version**: 1.0
**Author**: Joseph Fajen
**Depends on**: PRD.md, ARCHITECTURE.md

---

## Executive Summary

This specification defines the **Production Layer** — a comprehensive infrastructure layer that transforms ISEE v2 from a working prototype into a production-ready, portfolio-demonstrable system. The layer encompasses observability, security, resilience, deployment, and operational visibility.

### North Star

> *ISEE operates with the reliability, observability, and security expected of production AI systems — while providing full transparency into its operation for both users and operators.*

### Portfolio Objectives

This layer demonstrates mastery of:
- **Systems thinking**: Holistic view of AI infrastructure, not just the model
- **Production engineering**: Tracing, metrics, alerting, graceful degradation
- **Security posture**: Authentication, rate limiting, input validation
- **Operational maturity**: CI/CD quality gates, deployment automation
- **Observability-first design**: Understanding that "the remaining 70%" of AI engineering is knowing when and why things fail

---

## Current State Analysis

### What ISEE v2 Has

| Capability | Current Implementation |
|------------|------------------------|
| Logging | Pino structured JSON logging |
| Progress tracking | SSE streaming with `ProgressEvent` types |
| Error handling | Graceful degradation (individual LLM failures don't crash pipeline) |
| Timing | `RunStats.stageDurations` captures per-stage timing |
| Health check | `/health` endpoint returns status |
| Output persistence | Markdown files saved to `output/` |

### What's Missing for Production

| Gap | Impact |
|-----|--------|
| No distributed tracing | Cannot trace individual requests through 60+ API calls |
| No metrics persistence | No historical data, no trend analysis |
| No security hardening | Vulnerable to abuse if deployed publicly |
| No rate limiting | Single user could exhaust API budgets |
| No authentication | No access control |
| No cost tracking | No visibility into per-run expenses |
| No dashboard | Operators have no visibility |
| No CI quality gates | No automated regression detection |
| No deployment config | Manual deployment only |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ISEE v2 Production Layer                        │
│                                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │   Security  │  │ Observability│  │  Resilience │  │  Operations │   │
│  │    Layer    │  │    Layer    │  │    Layer    │  │    Layer    │   │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘   │
│         │                │                │                │           │
│         ▼                ▼                ▼                ▼           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Instrumented Pipeline                        │   │
│  │  ┌────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────┐ │   │
│  │  │  Prep  │→│ Synthesis│→│Clustering│→│Tournament│→│Synthestic│ │   │
│  │  └────────┘ └──────────┘ └──────────┘ └──────────┘ └─────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                │                │                │           │
│         ▼                ▼                ▼                ▼           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      Data & Storage Layer                       │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │   │
│  │  │  Traces  │  │  Metrics │  │   Runs   │  │  Cost Tracking   │ │   │
│  │  │ (OTLP)   │  │(Prometheus)│ │ (SQLite) │  │    (SQLite)     │ │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│         │                                                   │          │
│         ▼                                                   ▼          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        Dashboard UI                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Component Specifications

### 1. Observability Layer

#### 1.1 Distributed Tracing

**Purpose**: Trace every request through all pipeline stages and external API calls, enabling root cause analysis and performance debugging.

**Standard**: OpenTelemetry (OTLP) — industry standard, vendor-agnostic

**Trace Hierarchy**:
```
Pipeline Run (root span)
├── Prep Stage
│   └── Anthropic API Call (domain generation)
├── Synthesis Stage
│   ├── OpenRouter Call [model=claude-sonnet, framework=analytical, domain=X]
│   ├── OpenRouter Call [model=gpt-4o, framework=creative, domain=Y]
│   └── ... (~60 child spans)
├── Clustering Stage
│   └── Anthropic API Call (clustering)
├── Tournament Stage
│   ├── Advocate Calls (parallel)
│   │   ├── Anthropic API Call [cluster=1]
│   │   └── ...
│   ├── Skeptic Call
│   │   └── Anthropic API Call
│   └── Rebuttal Calls (parallel)
│       └── ...
├── Synthesizer Stage
│   └── Anthropic API Call (briefing)
└── Translation Stage
    └── Anthropic API Call (plain language)
```

**Span Attributes** (per API call):
| Attribute | Type | Example |
|-----------|------|---------|
| `llm.provider` | string | `openrouter`, `anthropic` |
| `llm.model` | string | `anthropic/claude-sonnet-4` |
| `llm.framework` | string | `analytical` |
| `llm.domain` | string | `Behavioral Economics` |
| `llm.tokens.input` | int | `1523` |
| `llm.tokens.output` | int | `847` |
| `llm.cost.usd` | float | `0.0234` |
| `llm.latency_ms` | int | `2341` |
| `llm.success` | bool | `true` |
| `llm.error` | string | `rate_limit_exceeded` |

**Export Targets**:
- **Development**: Console exporter (human-readable)
- **Production**: OTLP exporter to Jaeger or Grafana Tempo
- **Optional**: Langfuse integration for LLM-specific observability

#### 1.2 Metrics Collection

**Purpose**: Collect, aggregate, and expose metrics for monitoring and alerting.

**Standard**: Prometheus format (pull-based) + internal aggregation

**Metric Categories**:

**Pipeline Metrics**:
| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `isee_pipeline_runs_total` | Counter | `status` | Total pipeline executions |
| `isee_pipeline_duration_seconds` | Histogram | `stage` | Duration per stage |
| `isee_pipeline_errors_total` | Counter | `stage`, `error_type` | Errors by stage |

**LLM Metrics**:
| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `isee_llm_requests_total` | Counter | `provider`, `model`, `status` | API calls |
| `isee_llm_latency_seconds` | Histogram | `provider`, `model` | Response time |
| `isee_llm_tokens_total` | Counter | `provider`, `model`, `direction` | Token usage |
| `isee_llm_cost_usd_total` | Counter | `provider`, `model` | Cumulative cost |
| `isee_llm_rate_limits_total` | Counter | `provider` | Rate limit hits |

**Quality Metrics**:
| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `isee_synthesis_responses_total` | Gauge | — | Responses per run |
| `isee_clusters_total` | Gauge | — | Clusters identified |
| `isee_debate_concessions_total` | Counter | — | Rebuttals that conceded |

**Latency Percentiles** (computed):
- P50, P90, P95, P99 for end-to-end and per-stage

#### 1.3 Structured Logging

**Current**: Pino JSON logging (already implemented)

**Enhancements**:
- Add `trace_id` and `span_id` to all log entries (correlation)
- Add `run_id` to all pipeline logs
- Standardize log levels:
  - `ERROR`: Pipeline failures, API errors
  - `WARN`: Degraded operation, retries
  - `INFO`: Stage transitions, completions
  - `DEBUG`: Individual API calls, detailed flow

**Log Schema**:
```typescript
interface ProductionLogEntry {
  timestamp: string;      // ISO 8601
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  run_id: string;
  trace_id?: string;
  span_id?: string;
  stage?: string;
  duration_ms?: number;
  error?: {
    type: string;
    message: string;
    stack?: string;
  };
  context?: Record<string, unknown>;
}
```

---

### 2. Security Layer

#### 2.1 Authentication

**Model**: API Key authentication (simple, appropriate for portfolio/demo)

**Implementation**:
```
Authorization: Bearer isee_<random_32_chars>
```

**API Key Management**:
- Keys stored hashed (SHA-256) in SQLite
- Admin endpoint to create/revoke keys
- Keys have optional expiration
- Rate limits associated per key

**Endpoints**:
| Endpoint | Auth Required | Notes |
|----------|---------------|-------|
| `GET /` | No | Public landing page |
| `GET /health` | No | Health check |
| `GET /about` | No | About content |
| `POST /api/analyze` | Yes | Start analysis |
| `GET /api/analyze/stream` | Yes | SSE stream |
| `POST /api/refine/*` | Yes | Query refinement |
| `GET /api/runs` | Yes | Run history |
| `GET /api/metrics` | Yes | Prometheus metrics |
| `GET /dashboard` | Yes | Operations dashboard |

**Optional Enhancement**: OAuth2/OIDC integration for production deployments

#### 2.2 Rate Limiting

**Purpose**: Prevent abuse, protect API budgets, ensure fair usage

**Implementation**: Token bucket algorithm

**Limits**:
| Scope | Limit | Window | Burst |
|-------|-------|--------|-------|
| Per API Key | 10 runs | 1 hour | 3 |
| Per IP (unauthenticated) | 1 run | 1 hour | 1 |
| Global | 100 runs | 1 hour | 20 |

**Response on limit exceeded**:
```json
{
  "error": "rate_limit_exceeded",
  "retry_after_seconds": 1847,
  "limit": 10,
  "remaining": 0,
  "reset_at": "2026-03-24T10:00:00Z"
}
```

**Headers** (on all responses):
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1711274400
```

#### 2.3 Input Validation

**Query Validation**:
| Check | Rule | Response |
|-------|------|----------|
| Length | 10-2000 characters | 400 Bad Request |
| Content | No script tags, SQL injection patterns | 400 Bad Request |
| Encoding | Valid UTF-8 | 400 Bad Request |
| Rate | Max 1 query per 10 seconds per key | 429 Too Many Requests |

**Sanitization**:
- Strip leading/trailing whitespace
- Normalize unicode
- Escape HTML entities in output

#### 2.4 Secret Management

**Environment Variables** (required):
```env
# API Keys (existing)
OPENROUTER_API_KEY=sk-or-...
ANTHROPIC_API_KEY=sk-ant-...

# Production Layer (new)
ISEE_API_KEY_SALT=<random_64_chars>
ISEE_ADMIN_KEY=<admin_api_key>
ISEE_DATABASE_PATH=./data/isee.db
ISEE_ENABLE_AUTH=true
ISEE_RATE_LIMIT_ENABLED=true
```

**Security Practices**:
- Never log API keys (redact in logs)
- Never expose keys in frontend
- Rotate keys on suspected compromise
- Use separate keys for dev/staging/prod

#### 2.5 CORS Configuration

```typescript
const corsConfig = {
  origins: [
    'https://isee.yourdomain.com',  // Production
    'http://localhost:3000',         // Development
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400, // 24 hours
};
```

---

### 3. Resilience Layer

#### 3.1 Circuit Breaker Pattern

**Purpose**: Prevent cascade failures when external services degrade

**Implementation**: Per-provider circuit breakers

**States**:
- **Closed**: Normal operation, requests pass through
- **Open**: Service degraded, fail fast without calling
- **Half-Open**: Testing if service recovered

**Thresholds**:
| Provider | Failure Threshold | Recovery Time | Half-Open Requests |
|----------|------------------|---------------|-------------------|
| OpenRouter | 5 failures in 60s | 30 seconds | 2 |
| Anthropic | 3 failures in 60s | 60 seconds | 1 |

**Behavior when open**:
- OpenRouter: Skip that model, continue with others
- Anthropic: Fail the stage with clear error message

#### 3.2 Retry Logic

**Current**: None implemented

**Specification**:

```typescript
interface RetryConfig {
  maxAttempts: 3;
  initialDelayMs: 1000;
  maxDelayMs: 10000;
  backoffMultiplier: 2;
  retryableErrors: [
    'rate_limit_exceeded',
    'timeout',
    'service_unavailable',
    'internal_error'
  ];
  nonRetryableErrors: [
    'invalid_api_key',
    'content_policy_violation',
    'invalid_request'
  ];
}
```

**Jitter**: Add random 0-500ms to prevent thundering herd

#### 3.3 Timeout Configuration

| Operation | Timeout | Notes |
|-----------|---------|-------|
| Individual LLM call | 60s | Most calls complete in 5-15s |
| Synthesis stage (all calls) | 180s | ~60 parallel calls |
| Full pipeline | 300s | 5 minutes max |
| SSE connection | 360s | Allow for full pipeline + buffer |

#### 3.4 Graceful Degradation

**Synthesis Layer Degradation**:
| Condition | Response |
|-----------|----------|
| < 20% calls fail | Continue normally |
| 20-50% calls fail | Warn user, continue with reduced matrix |
| > 50% calls fail | Abort with explanation |
| Single model fails all calls | Exclude model, continue |

**Tournament Degradation**:
| Condition | Response |
|-----------|----------|
| Advocate fails | Exclude cluster from debate |
| Skeptic fails | Use advocates only (reduced confidence) |
| All rebuttals fail | Present debate without rebuttals |

**Translation Degradation**:
| Condition | Response |
|-----------|----------|
| Translation fails | Fall back to raw briefing (already implemented) |

#### 3.5 Health Checks

**Liveness Probe** (`GET /health/live`):
```json
{
  "status": "ok",
  "timestamp": "2026-03-24T08:00:00Z"
}
```

**Readiness Probe** (`GET /health/ready`):
```json
{
  "status": "ready",
  "checks": {
    "database": "ok",
    "openrouter": "ok",
    "anthropic": "ok"
  },
  "timestamp": "2026-03-24T08:00:00Z"
}
```

**Dependency Checks**:
- Database: Can connect and query
- OpenRouter: API key valid (lightweight models endpoint)
- Anthropic: API key valid (lightweight check)

---

### 4. Data & Storage Layer

#### 4.1 Database Schema

**Engine**: SQLite (simple, embedded, sufficient for solo deployment)

**Tables**:

```sql
-- API Keys
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  rate_limit_override INTEGER,
  is_admin BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE
);

-- Pipeline Runs
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  api_key_id TEXT REFERENCES api_keys(id),
  query TEXT NOT NULL,
  refined_query TEXT,
  status TEXT NOT NULL, -- 'running', 'completed', 'failed'
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,
  error_message TEXT,

  -- Stats
  synthesis_call_count INTEGER,
  successful_calls INTEGER,
  cluster_count INTEGER,

  -- Cost
  total_cost_usd REAL,
  openrouter_cost_usd REAL,
  anthropic_cost_usd REAL,

  -- Output
  briefing_json TEXT, -- Full briefing as JSON
  output_file_path TEXT
);

-- Stage Metrics (per run)
CREATE TABLE stage_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT REFERENCES runs(id),
  stage TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,
  status TEXT NOT NULL,
  error_message TEXT,

  -- Stage-specific metrics as JSON
  metrics_json TEXT
);

-- LLM Calls (detailed, for analysis)
CREATE TABLE llm_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT REFERENCES runs(id),
  stage TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,

  -- Request
  input_tokens INTEGER,

  -- Response
  output_tokens INTEGER,
  latency_ms INTEGER,
  success BOOLEAN,
  error_type TEXT,
  error_message TEXT,

  -- Cost
  cost_usd REAL,

  -- Context
  framework TEXT,
  domain TEXT,
  cluster_id INTEGER,

  timestamp TEXT NOT NULL
);

-- Rate Limiting
CREATE TABLE rate_limit_buckets (
  key TEXT PRIMARY KEY, -- 'apikey:<id>' or 'ip:<addr>' or 'global'
  tokens REAL NOT NULL,
  last_update TEXT NOT NULL
);

-- Metrics Aggregates (hourly rollups)
CREATE TABLE metrics_hourly (
  hour TEXT NOT NULL, -- '2026-03-24T08:00:00Z'
  metric_name TEXT NOT NULL,
  labels_json TEXT, -- JSON of label key-value pairs
  value REAL NOT NULL,
  PRIMARY KEY (hour, metric_name, labels_json)
);
```

#### 4.2 Data Retention

| Data Type | Retention | Rationale |
|-----------|-----------|-----------|
| Run records | 90 days | Portfolio demonstration period |
| LLM call details | 30 days | Detailed analysis window |
| Hourly aggregates | 1 year | Long-term trends |
| Traces | 7 days | Debugging window |
| Logs | 30 days | Troubleshooting |

**Cleanup Job**: Daily vacuum of expired data

#### 4.3 Cost Tracking

**Token Pricing** (as of March 2026, update as needed):

```typescript
const PRICING: Record<string, { input: number; output: number }> = {
  // OpenRouter models (per 1M tokens)
  'anthropic/claude-sonnet-4': { input: 3.00, output: 15.00 },
  'openai/gpt-4o': { input: 2.50, output: 10.00 },
  'google/gemini-2.5-pro': { input: 1.25, output: 5.00 },
  'meta-llama/llama-3.3-70b': { input: 0.50, output: 0.75 },
  'deepseek/deepseek-r1': { input: 0.55, output: 2.19 },
  'x-ai/grok-3-mini': { input: 0.30, output: 0.50 },

  // Anthropic direct (pipeline agents)
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
};
```

**Cost Calculation**:
```typescript
function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING[model];
  if (!pricing) return 0;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}
```

---

### 5. CI/CD & Quality Gates

#### 5.1 GitHub Actions Workflow

```yaml
name: ISEE CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install

      - name: Type check
        run: bun run typecheck

      - name: Lint
        run: bun run lint

      - name: Unit tests
        run: bun test

      - name: Build check
        run: bun build src/server.ts --outdir=dist

  integration:
    runs-on: ubuntu-latest
    needs: quality
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install

      - name: Run golden query tests
        run: bun run test:golden
        env:
          OPENROUTER_API_KEY: ${{ secrets.OPENROUTER_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

      - name: Check quality metrics
        run: bun run test:quality-gates

  deploy:
    runs-on: ubuntu-latest
    needs: integration
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - name: Deploy to production
        run: |
          # Deploy to Railway/Fly.io/etc
          echo "Deploying..."
```

#### 5.2 Golden Query Test Suite

**Purpose**: Ensure pipeline produces valid output for known queries

**Golden Queries** (`test/golden-queries.json`):
```json
[
  {
    "id": "governance",
    "query": "How might we improve decision-making in complex organizations while preserving individual autonomy?",
    "expectations": {
      "minClusters": 4,
      "maxClusters": 8,
      "minIdeas": 3,
      "maxDurationMs": 300000,
      "requiredStages": ["prep", "synthesis", "clustering", "tournament", "synthesizer", "translation"]
    }
  },
  {
    "id": "remote-work",
    "query": "What approaches help distributed teams maintain serendipitous collaboration and spontaneous innovation?",
    "expectations": {
      "minClusters": 4,
      "maxClusters": 8,
      "minIdeas": 3,
      "maxDurationMs": 300000
    }
  },
  {
    "id": "automation-balance",
    "query": "How can I design a creative workflow that balances automation efficiency with human curation and judgment?",
    "expectations": {
      "minClusters": 3,
      "maxClusters": 8,
      "minIdeas": 3,
      "maxDurationMs": 300000
    }
  }
]
```

**Test Script** (`test/golden.test.ts`):
```typescript
import { describe, test, expect } from 'bun:test';
import { runPipeline } from '../src/pipeline';
import goldenQueries from './golden-queries.json';

describe('Golden Query Tests', () => {
  for (const query of goldenQueries) {
    test(`Golden: ${query.id}`, async () => {
      const result = await runPipeline({ query: query.query });

      expect(result.briefing.ideas.length).toBeGreaterThanOrEqual(query.expectations.minIdeas);
      expect(result.briefing.stats.clusterCount).toBeGreaterThanOrEqual(query.expectations.minClusters);
      expect(result.briefing.stats.clusterCount).toBeLessThanOrEqual(query.expectations.maxClusters);
      expect(result.briefing.stats.totalDurationMs).toBeLessThan(query.expectations.maxDurationMs);
    }, 360000); // 6 minute timeout
  }
});
```

#### 5.3 Quality Gates

**Gate 1: Build Quality**
- TypeScript compiles without errors
- ESLint passes with no errors
- All unit tests pass

**Gate 2: Integration Quality**
- All golden queries complete successfully
- No stage failures
- Duration within bounds

**Gate 3: Regression Detection**
- Compare metrics to baseline
- Alert if P95 latency increases > 20%
- Alert if success rate drops below 95%
- Alert if cost per run increases > 30%

---

### 6. Dashboard & Visibility

#### 6.1 Dashboard Overview

**Technology**: Single HTML page with embedded JavaScript (consistent with existing UI pattern)

**Sections**:

```
┌─────────────────────────────────────────────────────────────────┐
│  ISEE Operations Dashboard                            [Refresh] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │ Total Runs  │ │ Success Rate│ │ Avg Latency │ │ Total Cost│ │
│  │    247      │ │   97.2%     │ │   142s      │ │  $48.23   │ │
│  │  +12 today  │ │  ▲ 1.2%     │ │  ▼ 8s       │ │ +$4.20    │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └───────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Pipeline Performance (Last 24 Hours)                        ││
│  │ [======== Prep ========][=== Synthesis ===][Cluster][Tourn] ││
│  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ ││
│  │ Latency breakdown by stage                                  ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
│  ┌────────────────────────────┐ ┌──────────────────────────────┐│
│  │ Recent Runs                │ │ Model Performance            ││
│  │ ─────────────────────────  │ │ ────────────────────────     ││
│  │ ✓ 08:32 governance...     │ │ claude-sonnet  98% ████████  ││
│  │ ✓ 08:15 remote-work...    │ │ gpt-4o         97% ████████  ││
│  │ ✗ 07:58 creative... [err] │ │ gemini-2.5     94% ███████▌  ││
│  │ ✓ 07:41 automation...     │ │ llama-3.3      92% ███████   ││
│  │                            │ │ deepseek-r1    89% ██████▌   ││
│  └────────────────────────────┘ │ grok-3-mini    86% ██████    ││
│                                 └──────────────────────────────┘│
│                                                                 │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ Cost Breakdown                                              ││
│  │ [======= OpenRouter 72% =======][== Anthropic 28% ==]       ││
│  │ $34.73                          $13.50                      ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 6.2 Dashboard API Endpoints

| Endpoint | Response | Cache |
|----------|----------|-------|
| `GET /api/dashboard/summary` | Key metrics | 60s |
| `GET /api/dashboard/runs?limit=20` | Recent runs | 30s |
| `GET /api/dashboard/latency?period=24h` | Latency time series | 60s |
| `GET /api/dashboard/models` | Per-model stats | 60s |
| `GET /api/dashboard/costs?period=7d` | Cost breakdown | 300s |
| `GET /api/dashboard/health` | System health | 10s |

#### 6.3 Alerting (Future Enhancement)

**Alert Channels**: Webhook (Slack, Discord, email via service)

**Alert Conditions**:
| Condition | Severity | Action |
|-----------|----------|--------|
| Pipeline failure rate > 10% (1h) | Critical | Immediate notification |
| P95 latency > 5 minutes | Warning | Notification |
| API provider circuit open | Warning | Notification |
| Daily cost > $50 | Info | Daily digest |
| Rate limit exhausted | Info | Notification |

---

### 7. Deployment Infrastructure

#### 7.1 Dockerfile

```dockerfile
FROM oven/bun:1.1-alpine

WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Copy application
COPY src/ ./src/
COPY public/ ./public/
COPY tsconfig.json ./

# Create data directory
RUN mkdir -p /app/data /app/output

# Environment
ENV NODE_ENV=production
ENV PORT=3000
ENV ISEE_DATABASE_PATH=/app/data/isee.db

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

# Run
EXPOSE 3000
CMD ["bun", "run", "src/server.ts"]
```

#### 7.2 Docker Compose (Development)

```yaml
version: '3.8'

services:
  isee:
    build: .
    ports:
      - "3000:3000"
    environment:
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - ISEE_ENABLE_AUTH=false
      - ISEE_RATE_LIMIT_ENABLED=false
    volumes:
      - ./data:/app/data
      - ./output:/app/output

  # Optional: Jaeger for trace visualization
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"  # UI
      - "4318:4318"    # OTLP HTTP
    environment:
      - COLLECTOR_OTLP_ENABLED=true
```

#### 7.3 Production Deployment Options

**Option A: Railway** (Recommended for simplicity)
```toml
# railway.toml
[build]
builder = "dockerfile"

[deploy]
healthcheckPath = "/health/live"
healthcheckTimeout = 10
restartPolicyType = "on_failure"
```

**Option B: Fly.io** (Better for global distribution)
```toml
# fly.toml
app = "isee-v2"
primary_region = "sjc"

[build]
dockerfile = "Dockerfile"

[http_service]
internal_port = 3000
force_https = true
auto_stop_machines = true
auto_start_machines = true
min_machines_running = 0

[[vm]]
size = "shared-cpu-1x"
memory = "512mb"
```

**Option C: Self-hosted** (Maximum control)
- Docker on VPS (DigitalOcean, Linode, etc.)
- Nginx reverse proxy with SSL (Let's Encrypt)
- Systemd for process management

#### 7.4 Environment Configuration

**Required for Production**:
```env
# API Keys
OPENROUTER_API_KEY=sk-or-...
ANTHROPIC_API_KEY=sk-ant-...

# Production Settings
NODE_ENV=production
PORT=3000

# Security
ISEE_ENABLE_AUTH=true
ISEE_API_KEY_SALT=<64-char-random>
ISEE_ADMIN_KEY=<admin-key>

# Rate Limiting
ISEE_RATE_LIMIT_ENABLED=true
ISEE_RATE_LIMIT_PER_KEY=10
ISEE_RATE_LIMIT_WINDOW_HOURS=1

# Database
ISEE_DATABASE_PATH=/app/data/isee.db

# Observability
ISEE_TRACING_ENABLED=true
ISEE_TRACING_ENDPOINT=http://jaeger:4318
ISEE_METRICS_ENABLED=true

# Optional: External services
ISEE_LANGFUSE_PUBLIC_KEY=pk-...
ISEE_LANGFUSE_SECRET_KEY=sk-...
```

---

## New Type Definitions

Add to `src/types.ts`:

```typescript
// ============================================================================
// Production Layer Types
// ============================================================================

/**
 * API Key record for authentication.
 */
export interface ApiKey {
  id: string;
  name: string;
  createdAt: string;
  expiresAt?: string;
  rateLimitOverride?: number;
  isAdmin: boolean;
  isActive: boolean;
}

/**
 * Persisted run record.
 */
export interface RunRecord {
  id: string;
  apiKeyId?: string;
  query: string;
  refinedQuery?: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  errorMessage?: string;

  // Stats
  synthesisCallCount?: number;
  successfulCalls?: number;
  clusterCount?: number;

  // Cost
  totalCostUsd?: number;
  openrouterCostUsd?: number;
  anthropicCostUsd?: number;
}

/**
 * LLM call record for detailed analysis.
 */
export interface LlmCallRecord {
  runId: string;
  stage: string;
  provider: 'openrouter' | 'anthropic';
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  success: boolean;
  errorType?: string;
  errorMessage?: string;
  costUsd: number;
  framework?: string;
  domain?: string;
  clusterId?: number;
  timestamp: string;
}

/**
 * Circuit breaker state.
 */
export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailure?: string;
  nextAttempt?: string;
}

/**
 * Rate limit status.
 */
export interface RateLimitStatus {
  limit: number;
  remaining: number;
  resetAt: string;
  retryAfterSeconds?: number;
}

/**
 * Dashboard summary metrics.
 */
export interface DashboardSummary {
  totalRuns: number;
  runsToday: number;
  successRate: number;
  successRateChange: number; // vs previous period
  avgLatencyMs: number;
  latencyChange: number;
  totalCostUsd: number;
  costToday: number;
  lastUpdated: string;
}

/**
 * Per-model performance stats.
 */
export interface ModelStats {
  model: string;
  provider: string;
  totalCalls: number;
  successRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  totalCostUsd: number;
  avgCostPerCall: number;
}

/**
 * Health check response.
 */
export interface HealthCheck {
  status: 'ok' | 'degraded' | 'unhealthy';
  checks: {
    database: 'ok' | 'error';
    openrouter: 'ok' | 'error' | 'circuit_open';
    anthropic: 'ok' | 'error' | 'circuit_open';
  };
  timestamp: string;
}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Goal**: Core infrastructure without changing pipeline behavior

- [ ] SQLite database setup with schema
- [ ] Run persistence (save runs to database)
- [ ] Basic API key authentication
- [ ] Rate limiting (token bucket)
- [ ] Input validation and sanitization
- [ ] Enhanced health checks

**Deliverable**: Pipeline works as before, but with auth and persistence

### Phase 2: Observability (Week 3-4)
**Goal**: Full visibility into pipeline operation

- [ ] OpenTelemetry integration
- [ ] Trace instrumentation for all stages
- [ ] Span attributes for LLM calls
- [ ] Metrics collection and aggregation
- [ ] Cost tracking per run
- [ ] Log correlation with trace IDs

**Deliverable**: Can trace any run end-to-end, see all metrics

### Phase 3: Resilience (Week 5)
**Goal**: Graceful handling of failures

- [ ] Circuit breaker implementation
- [ ] Retry logic with exponential backoff
- [ ] Timeout configuration
- [ ] Graceful degradation modes
- [ ] Error categorization and reporting

**Deliverable**: Pipeline handles failures gracefully, recovers automatically

### Phase 4: Dashboard (Week 6)
**Goal**: Operational visibility

- [ ] Dashboard API endpoints
- [ ] Dashboard HTML/JS UI
- [ ] Real-time metrics display
- [ ] Run history viewer
- [ ] Cost breakdown charts
- [ ] Model performance comparison

**Deliverable**: Full operational dashboard

### Phase 5: CI/CD & Deployment (Week 7)
**Goal**: Automated quality gates and deployment

- [ ] GitHub Actions workflow
- [ ] Golden query test suite
- [ ] Quality gate checks
- [ ] Dockerfile and compose
- [ ] Deployment configuration (Railway/Fly.io)
- [ ] Production environment setup

**Deliverable**: Automated deployment with quality gates

### Phase 6: Polish & Documentation (Week 8)
**Goal**: Portfolio-ready presentation

- [ ] README updates with architecture diagrams
- [ ] API documentation
- [ ] Dashboard screenshots for portfolio
- [ ] Performance benchmarks documented
- [ ] Security practices documented
- [ ] Demo video/walkthrough

**Deliverable**: Complete portfolio piece

---

## Success Criteria

### Functional Requirements

| Requirement | Metric | Target |
|-------------|--------|--------|
| Pipeline reliability | Success rate | > 95% |
| End-to-end latency | P95 | < 5 minutes |
| Trace coverage | Instrumented spans | 100% of API calls |
| Metric collection | Data points | All specified metrics |
| Authentication | Coverage | All mutating endpoints |
| Rate limiting | Enforcement | Configurable per key |

### Non-Functional Requirements

| Requirement | Metric | Target |
|-------------|--------|--------|
| Dashboard load time | Initial render | < 2 seconds |
| API response time | Health check | < 100ms |
| Database size | After 1000 runs | < 100MB |
| Memory usage | Steady state | < 512MB |
| Startup time | Cold start | < 5 seconds |

### Portfolio Demonstration

| Skill | Demonstration |
|-------|---------------|
| Systems thinking | Architecture diagram, multi-layer design |
| Production engineering | Tracing, metrics, dashboards |
| Security awareness | Auth, rate limiting, input validation |
| Resilience patterns | Circuit breakers, graceful degradation |
| Operational maturity | CI/CD, quality gates, monitoring |
| Documentation | Comprehensive specs, API docs |

---

## Appendix A: Tool Decisions

| Category | Tool | Rationale |
|----------|------|-----------|
| Tracing | OpenTelemetry + Jaeger | Industry standard, free, self-hostable |
| Metrics | Prometheus format | Widely supported, simple |
| Database | SQLite | Embedded, no ops overhead, sufficient scale |
| Dashboard | Custom HTML/JS | Consistent with existing UI, no deps |
| CI/CD | GitHub Actions | Free, integrated with repo |
| Deployment | Railway | Simple, Bun support, reasonable free tier |

### Alternative Considerations

**Langfuse instead of OpenTelemetry**:
- Pro: Purpose-built for LLM observability, nice UI
- Con: External dependency, less standard
- Decision: Support both (OTLP primary, Langfuse optional)

**Grafana instead of custom dashboard**:
- Pro: More powerful, industry standard
- Con: Additional infrastructure, overkill for single app
- Decision: Custom for simplicity, document Grafana as option

**PostgreSQL instead of SQLite**:
- Pro: Better for multi-instance deployment
- Con: Additional ops burden
- Decision: SQLite for now, document migration path

---

## Appendix B: File Structure

```
isee-v2/
├── src/
│   ├── pipeline/              # (existing)
│   ├── clients/               # (existing)
│   ├── config/                # (existing)
│   ├── production/            # NEW: Production layer
│   │   ├── auth/
│   │   │   ├── api-keys.ts    # API key management
│   │   │   └── middleware.ts  # Auth middleware
│   │   ├── observability/
│   │   │   ├── tracing.ts     # OpenTelemetry setup
│   │   │   ├── metrics.ts     # Metrics collection
│   │   │   └── spans.ts       # Span helpers
│   │   ├── resilience/
│   │   │   ├── circuit-breaker.ts
│   │   │   ├── retry.ts
│   │   │   └── timeout.ts
│   │   ├── storage/
│   │   │   ├── database.ts    # SQLite connection
│   │   │   ├── runs.ts        # Run persistence
│   │   │   ├── metrics.ts     # Metrics persistence
│   │   │   └── migrations/    # Schema migrations
│   │   ├── security/
│   │   │   ├── rate-limit.ts
│   │   │   ├── validation.ts
│   │   │   └── cors.ts
│   │   └── dashboard/
│   │       ├── api.ts         # Dashboard endpoints
│   │       └── handlers.ts
│   ├── pipeline.ts            # (modified: add instrumentation)
│   ├── server.ts              # (modified: add middleware)
│   └── types.ts               # (extended)
├── public/
│   ├── index.html             # (existing)
│   └── dashboard.html         # NEW: Operations dashboard
├── test/
│   ├── golden-queries.json    # NEW: Golden test queries
│   └── golden.test.ts         # NEW: Golden tests
├── data/                      # NEW: SQLite database
├── .github/
│   └── workflows/
│       └── ci.yml             # NEW: CI/CD workflow
├── Dockerfile                 # NEW
├── docker-compose.yml         # NEW
├── PRODUCTION-LAYER-SPEC.md   # This document
└── ...
```

---

*Last updated: March 2026*
