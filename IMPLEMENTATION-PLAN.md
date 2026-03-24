# ISEE v2 Production Layer — Implementation Plan

**Status**: Active
**Approach**: Claude Code + Archon Collaboration
**Target**: Phase 1 (Production Layer) from PRODUCTION-LAYER-SPEC.md

---

## Collaboration Model

This implementation uses a **two-agent collaboration** between Claude Code and Archon:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Implementation Workflow                         │
│                                                                     │
│  ┌─────────────┐         ┌─────────────┐         ┌─────────────┐  │
│  │ Claude Code │ ──────▶ │   Archon    │ ──────▶ │   Review    │  │
│  │   (Plan)    │         │ (Implement) │         │ (Validate)  │  │
│  └─────────────┘         └─────────────┘         └─────────────┘  │
│        │                       │                       │          │
│        │                       │                       │          │
│        ▼                       ▼                       ▼          │
│   - Architecture          - Code files            - Type check   │
│   - Specifications        - Tests                 - Lint         │
│   - Complex decisions     - Documentation         - Test run     │
│   - Code review           - Git commits           - Integration  │
│   - Debugging             - PR creation           - Feedback     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Role Division

| Role | Agent | Examples |
|------|-------|----------|
| **Architect** | Claude Code | Define interfaces, make design decisions, write specs |
| **Implementer** | Archon | Write code following specs, create tests, make commits |
| **Reviewer** | Claude Code | Review Archon's PRs, catch issues, refine |
| **Validator** | Archon | Run type checks, tests, linting, CI |
| **Debugger** | Either | Claude Code for complex issues, Archon for straightforward fixes |

### Workflow Pattern

For each component:

1. **Claude Code** creates a detailed task specification
2. **Archon** runs implementation workflow (via CLI or Web UI)
3. **Archon** creates PR with implementation
4. **Claude Code** reviews and provides feedback
5. **Archon** addresses feedback (fix workflow)
6. Merge when validated

---

## Phase 1 Components & Sequencing

Based on dependencies, here's the implementation order:

```
Week 1-2: Foundation
├── 1.1 Database setup (schema, migrations, connection)
├── 1.2 Run persistence (save runs to database)
├── 1.3 API key authentication
├── 1.4 Rate limiting
└── 1.5 Input validation

Week 3-4: Observability
├── 2.1 OpenTelemetry setup
├── 2.2 Trace instrumentation (all stages)
├── 2.3 Metrics collection
├── 2.4 Cost tracking
└── 2.5 Log correlation

Week 5: Resilience
├── 3.1 Circuit breaker implementation
├── 3.2 Retry logic
├── 3.3 Timeout configuration
└── 3.4 Graceful degradation

Week 6: Dashboard
├── 4.1 Dashboard API endpoints
├── 4.2 Dashboard HTML/JS UI
└── 4.3 Real-time metrics display

Week 7: CI/CD & Deployment
├── 5.1 GitHub Actions workflow
├── 5.2 Golden query test suite
├── 5.3 Dockerfile
└── 5.4 Deployment configuration

Week 8: Polish
├── 6.1 Documentation updates
├── 6.2 Performance benchmarks
└── 6.3 Security audit
```

---

## Archon Workflows

### Available Workflows

| Workflow | Purpose | When to Use |
|----------|---------|-------------|
| `isee-implement-component` | Implement a single component | Each component task |
| `isee-implement-phase` | Implement entire phase (Ralph) | Week-level work |
| `isee-validate` | Run all validation checks | After implementation |
| `isee-create-pr` | Create PR with validation | Ready for review |

### Invoking Archon

From CLI (in ISEE-v2 directory):
```bash
# Implement a specific component
archon workflow run isee-implement-component \
  --branch feat/database-setup \
  "Implement database setup per PRODUCTION-LAYER-SPEC.md Section 4.1"

# Implement entire phase
archon workflow run isee-implement-phase \
  --branch feat/foundation-layer \
  "Implement Foundation phase (1.1-1.5) per IMPLEMENTATION-PLAN.md"

# Validate current state
archon workflow run isee-validate

# Create PR for review
archon workflow run isee-create-pr \
  --branch feat/foundation-layer \
  "Foundation Layer: Database, Auth, Rate Limiting"
```

From Web UI:
1. Navigate to Archon Web UI (http://localhost:3090)
2. Select ISEE-v2 project
3. Chat: "Run isee-implement-component for database setup"
4. Monitor progress in real-time

---

## Component Task Specifications

### 1.1 Database Setup

**Branch**: `feat/database-setup`

**Files to create**:
- `src/production/storage/database.ts` — SQLite connection pool
- `src/production/storage/migrations/001_initial.sql` — Schema from spec
- `src/production/storage/migrations/index.ts` — Migration runner

**Requirements**:
- Use `bun:sqlite` for SQLite access
- Implement connection pooling
- Auto-run migrations on startup
- Create `ISEE_DATABASE_PATH` env var handling
- Add to `.env.template`

**Validation**:
- TypeScript compiles
- Can connect and run migrations
- Tables created correctly

**Reference**: PRODUCTION-LAYER-SPEC.md Section 4.1

---

### 1.2 Run Persistence

**Branch**: `feat/run-persistence`
**Depends on**: 1.1 Database Setup

**Files to create**:
- `src/production/storage/runs.ts` — Run CRUD operations
- `src/production/storage/llm-calls.ts` — LLM call logging

**Files to modify**:
- `src/pipeline.ts` — Add run persistence hooks
- `src/types.ts` — Add `RunRecord`, `LlmCallRecord` types

**Requirements**:
- Save run record on pipeline start
- Update on completion/failure
- Log individual LLM calls
- Track stage metrics

**Validation**:
- Run pipeline, verify database records created
- Check all fields populated correctly

**Reference**: PRODUCTION-LAYER-SPEC.md Section 4.1

---

### 1.3 API Key Authentication

**Branch**: `feat/api-auth`
**Depends on**: 1.1 Database Setup

**Files to create**:
- `src/production/auth/api-keys.ts` — Key generation, hashing, validation
- `src/production/auth/middleware.ts` — Auth middleware for Bun server

**Files to modify**:
- `src/server.ts` — Apply auth middleware to protected routes

**Requirements**:
- SHA-256 hash keys before storage
- `ISEE_API_KEY_SALT` env var
- `ISEE_ADMIN_KEY` for key management
- Protect `/api/analyze`, `/api/refine/*`, `/api/runs`
- Leave `/`, `/health`, `/about` public

**Validation**:
- Request without key → 401
- Request with invalid key → 401
- Request with valid key → 200
- Admin key can create new keys

**Reference**: PRODUCTION-LAYER-SPEC.md Section 2.1

---

### 1.4 Rate Limiting

**Branch**: `feat/rate-limiting`
**Depends on**: 1.1, 1.3

**Files to create**:
- `src/production/security/rate-limit.ts` — Token bucket implementation

**Files to modify**:
- `src/server.ts` — Apply rate limiting
- `src/production/storage/migrations/001_initial.sql` — Add rate_limit_buckets table

**Requirements**:
- Token bucket algorithm
- Per-API-key limits (configurable)
- Per-IP limits (for unauthenticated)
- Global limits
- Return `X-RateLimit-*` headers
- 429 response with `retry_after_seconds`

**Validation**:
- Exhaust limit → 429 response
- Headers present on all responses
- Limits reset after window

**Reference**: PRODUCTION-LAYER-SPEC.md Section 2.2

---

### 1.5 Input Validation

**Branch**: `feat/input-validation`

**Files to create**:
- `src/production/security/validation.ts` — Query validation, sanitization
- `src/production/security/cors.ts` — CORS configuration

**Files to modify**:
- `src/server.ts` — Apply validation middleware

**Requirements**:
- Query length: 10-2000 chars
- UTF-8 validation
- HTML/script tag stripping
- SQL injection pattern detection
- CORS configuration per spec

**Validation**:
- Empty query → 400
- Too long query → 400
- Script tags → stripped or rejected
- CORS headers correct

**Reference**: PRODUCTION-LAYER-SPEC.md Section 2.3, 2.5

---

### 2.1 OpenTelemetry Setup

**Branch**: `feat/otel-setup`

**Files to create**:
- `src/production/observability/tracing.ts` — OTLP setup
- `src/production/observability/spans.ts` — Span helper utilities

**Dependencies to add**:
- `@opentelemetry/api`
- `@opentelemetry/sdk-node`
- `@opentelemetry/exporter-trace-otlp-http`

**Requirements**:
- Initialize tracer on startup
- Console exporter for dev
- OTLP exporter for production
- `ISEE_TRACING_ENABLED` env var
- `ISEE_TRACING_ENDPOINT` env var

**Validation**:
- Traces appear in console (dev)
- Can connect to Jaeger (optional)

**Reference**: PRODUCTION-LAYER-SPEC.md Section 1.1

---

### 2.2 Trace Instrumentation

**Branch**: `feat/trace-instrumentation`
**Depends on**: 2.1

**Files to modify**:
- `src/pipeline.ts` — Root span
- `src/pipeline/prep.ts` — Prep stage span
- `src/pipeline/synthesis.ts` — Synthesis spans (per LLM call)
- `src/pipeline/clustering.ts` — Clustering span
- `src/pipeline/tournament.ts` — Tournament spans
- `src/pipeline/synthesizer.ts` — Synthesizer span
- `src/pipeline/translation.ts` — Translation span
- `src/clients/anthropic.ts` — LLM call spans
- `src/clients/openrouter.ts` — LLM call spans

**Requirements**:
- Root span for entire pipeline run
- Child spans for each stage
- Grandchild spans for each LLM call
- Span attributes per spec (model, framework, domain, tokens, cost)

**Validation**:
- Run pipeline, see full trace hierarchy
- All attributes populated

**Reference**: PRODUCTION-LAYER-SPEC.md Section 1.1

---

### 2.3 Metrics Collection

**Branch**: `feat/metrics`
**Depends on**: 1.1, 2.2

**Files to create**:
- `src/production/observability/metrics.ts` — Metric definitions and collection
- `src/production/storage/metrics.ts` — Metric persistence

**Files to modify**:
- `src/server.ts` — Add `/api/metrics` endpoint (Prometheus format)

**Requirements**:
- All metrics from spec Section 1.2
- Hourly aggregation
- Prometheus text format export

**Validation**:
- `/api/metrics` returns valid Prometheus format
- Metrics update after pipeline run

**Reference**: PRODUCTION-LAYER-SPEC.md Section 1.2

---

### 2.4 Cost Tracking

**Branch**: `feat/cost-tracking`
**Depends on**: 1.2, 2.2

**Files to create**:
- `src/production/observability/cost.ts` — Cost calculation

**Files to modify**:
- `src/production/storage/runs.ts` — Store cost per run
- `src/production/storage/llm-calls.ts` — Store cost per call
- `src/clients/anthropic.ts` — Extract token counts
- `src/clients/openrouter.ts` — Extract token counts

**Requirements**:
- Pricing table from spec
- Calculate cost per LLM call
- Aggregate to run total
- Split by provider

**Validation**:
- Run pipeline, check cost fields populated
- Costs match expected based on token counts

**Reference**: PRODUCTION-LAYER-SPEC.md Section 4.3

---

### 2.5 Log Correlation

**Branch**: `feat/log-correlation`
**Depends on**: 2.1

**Files to modify**:
- `src/utils/logger.ts` — Add trace_id, span_id, run_id fields

**Requirements**:
- Extract trace context from OpenTelemetry
- Add to all log entries
- Structured JSON format per spec

**Validation**:
- Logs include trace_id
- Can correlate logs to traces

**Reference**: PRODUCTION-LAYER-SPEC.md Section 1.3

---

### 3.1 Circuit Breaker

**Branch**: `feat/circuit-breaker`

**Files to create**:
- `src/production/resilience/circuit-breaker.ts` — Circuit breaker implementation

**Files to modify**:
- `src/clients/anthropic.ts` — Wrap calls with circuit breaker
- `src/clients/openrouter.ts` — Wrap calls with circuit breaker

**Requirements**:
- Three states: closed, open, half-open
- Per-provider breakers
- Thresholds from spec
- Logging on state transitions

**Validation**:
- Force failures → breaker opens
- Wait → breaker goes half-open
- Success → breaker closes

**Reference**: PRODUCTION-LAYER-SPEC.md Section 3.1

---

### 3.2 Retry Logic

**Branch**: `feat/retry-logic`

**Files to create**:
- `src/production/resilience/retry.ts` — Retry with exponential backoff

**Files to modify**:
- `src/clients/anthropic.ts` — Add retry wrapper
- `src/clients/openrouter.ts` — Add retry wrapper

**Requirements**:
- Config from spec Section 3.2
- Exponential backoff with jitter
- Retryable vs non-retryable errors
- Max attempts

**Validation**:
- Transient error → retry succeeds
- Permanent error → no retry
- Max attempts respected

**Reference**: PRODUCTION-LAYER-SPEC.md Section 3.2

---

### 3.3 Timeout Configuration

**Branch**: `feat/timeouts`

**Files to modify**:
- `src/clients/anthropic.ts` — Add timeout handling
- `src/clients/openrouter.ts` — Add timeout handling
- `src/pipeline.ts` — Stage-level timeouts

**Requirements**:
- Timeouts from spec Section 3.3
- Proper timeout error classification

**Validation**:
- Slow call → timeout error
- Proper error message

**Reference**: PRODUCTION-LAYER-SPEC.md Section 3.3

---

### 3.4 Graceful Degradation

**Branch**: `feat/graceful-degradation`

**Files to modify**:
- `src/pipeline/synthesis.ts` — Degradation logic
- `src/pipeline/tournament.ts` — Degradation logic

**Requirements**:
- Degradation modes from spec Section 3.4
- User notification of degraded mode
- Continue vs abort thresholds

**Validation**:
- 30% synthesis failures → continues with warning
- 60% synthesis failures → aborts
- Tournament degradation works

**Reference**: PRODUCTION-LAYER-SPEC.md Section 3.4

---

### 4.1 Dashboard API

**Branch**: `feat/dashboard-api`
**Depends on**: 1.2, 2.3

**Files to create**:
- `src/production/dashboard/api.ts` — Dashboard endpoints
- `src/production/dashboard/handlers.ts` — Query handlers

**Files to modify**:
- `src/server.ts` — Mount dashboard routes

**Requirements**:
- All endpoints from spec Section 6.2
- Caching per spec
- Auth required

**Validation**:
- Each endpoint returns expected shape
- Caching works

**Reference**: PRODUCTION-LAYER-SPEC.md Section 6.2

---

### 4.2 Dashboard UI

**Branch**: `feat/dashboard-ui`
**Depends on**: 4.1

**Files to create**:
- `public/dashboard.html` — Dashboard single-page app

**Requirements**:
- Layout from spec Section 6.1
- All sections implemented
- Auto-refresh
- Responsive

**Validation**:
- Dashboard loads
- Shows real data
- Updates on refresh

**Reference**: PRODUCTION-LAYER-SPEC.md Section 6.1

---

### 5.1 GitHub Actions

**Branch**: `feat/github-actions`

**Files to create**:
- `.github/workflows/ci.yml` — CI/CD workflow from spec

**Requirements**:
- Quality job (typecheck, lint, test)
- Integration job (golden tests)
- Deploy job (placeholder)

**Validation**:
- Workflow runs on push
- All checks pass

**Reference**: PRODUCTION-LAYER-SPEC.md Section 5.1

---

### 5.2 Golden Tests

**Branch**: `feat/golden-tests`

**Files to create**:
- `test/golden-queries.json` — Golden query definitions
- `test/golden.test.ts` — Golden test implementation

**Requirements**:
- At least 3 golden queries
- Expectations from spec
- 6-minute timeout

**Validation**:
- Tests run
- All pass with real API keys

**Reference**: PRODUCTION-LAYER-SPEC.md Section 5.2

---

### 5.3 Dockerfile

**Branch**: `feat/docker`

**Files to create**:
- `Dockerfile` — From spec
- `docker-compose.yml` — Dev setup
- `.dockerignore` — Exclude unnecessary files

**Requirements**:
- Bun alpine base
- Health check
- Volume mounts for data/output

**Validation**:
- `docker build` succeeds
- Container runs
- Health check passes

**Reference**: PRODUCTION-LAYER-SPEC.md Section 7.1, 7.2

---

### 5.4 Deployment Config

**Branch**: `feat/deployment`

**Files to create**:
- `railway.toml` — Railway configuration
- `fly.toml` — Fly.io configuration (alternative)

**Requirements**:
- Health check path
- Environment variable documentation

**Validation**:
- Config valid per platform docs

**Reference**: PRODUCTION-LAYER-SPEC.md Section 7.3

---

## Validation Checklist

After each component, run:

```bash
# Type check
bun run typecheck

# Lint
bun run lint

# Unit tests
bun test

# Manual verification
bun run dev
# Test the specific functionality
```

After each phase, run integration tests:

```bash
# Golden query tests (requires API keys)
bun run test:golden

# Full pipeline test
bun run pipeline "Test query"
```

---

## Progress Tracking

Update this section as work progresses:

### Foundation (Week 1-2) ✅ COMPLETE
- [x] 1.1 Database setup (PR #14)
- [x] 1.2 Run persistence (PR #15)
- [x] 1.3 API key authentication (PR #16)
- [x] 1.4 Rate limiting (PR #17)
- [x] 1.5 Input validation (PR #18)

### Observability (Week 3-4)
- [x] 2.1 OpenTelemetry setup
- [x] 2.2 Trace instrumentation
- [x] 2.3 Metrics collection
- [x] 2.4 Cost tracking
- [x] 2.5 Log correlation

### Resilience (Week 5)
- [x] 3.1 Circuit breaker
- [x] 3.2 Retry logic
- [x] 3.3 Timeout configuration
- [x] 3.4 Graceful degradation

### Dashboard (Week 6)
- [x] 4.1 Dashboard API
- [x] 4.2 Dashboard UI

### CI/CD & Deployment (Week 7)
- [ ] 5.1 GitHub Actions
- [ ] 5.2 Golden tests
- [ ] 5.3 Dockerfile
- [ ] 5.4 Deployment config

### Polish (Week 8)
- [ ] 6.1 Documentation updates
- [ ] 6.2 Performance benchmarks
- [ ] 6.3 Security audit

---

## Getting Started

### Prerequisites

1. **Archon installed and running**:
   ```bash
   cd /Users/josephfajen/git/remote-coding-agent
   bun install
   bun run dev
   ```

2. **ISEE-v2 registered with Archon**:
   ```bash
   # From Archon CLI or Web UI
   archon /clone /Users/josephfajen/git/isee-v2
   ```

3. **API keys configured** (for golden tests):
   ```bash
   cp .env.template .env
   # Edit .env with your keys
   ```

### Starting Implementation

1. **With Claude Code**: Discuss architecture, review specs
2. **Invoke Archon**: `archon workflow run isee-implement-component --branch feat/database-setup "Implement database setup"`
3. **Review PR**: Claude Code reviews the implementation
4. **Iterate**: Fix issues via Archon fix workflow
5. **Merge**: When validated, merge to main

---

*Last updated: March 2026*
