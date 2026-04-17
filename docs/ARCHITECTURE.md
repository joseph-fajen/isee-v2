# ISEE v2 — Architecture Plan

**Status**: Production
**Depends on**: PRD.md  

---

## What We Learned from v1

Before any design decisions, these are the hard lessons the v1 codebase encodes:

### The scoring trap
`evaluation_scoring.py` grew to 1,204 lines trying to algorithmically score responses. It required constant tuning — buzzword penalties, template detection, weight recalibration. Despite the effort, confidence in results remained low because a scoring formula is fundamentally opaque to the user. **v2 replaces all scoring logic with LLM-based evaluation.**

### Template and buzzword failures
v1 discovered that some LLMs return placeholder text or vague metaphor-laden responses. The solution is not a detection system — it's that the Skeptic agent in the Tournament layer will naturally demolish these responses when challenged to defend them. Low-quality responses self-eliminate through debate.

### The domain manager is a good concept, poorly used
v1's `domain_manager.py` defined static domains (Urban Planning, Healthcare, etc.) that had little to do with the user's actual query. The real value was the *idea* of dynamic domain generation. **v2 generates knowledge domains dynamically per query via an LLM call before synthesis begins. No fixed domain list exists anywhere in the v2 codebase.**

### The cognitive frameworks are solid
`instruction_templates.py` contains 11 well-crafted framework prompts (Analytical, Creative, Critical, Integrative, Pragmatic, First Principles, Systems, Contrarian, Historical, Futurist, Disruption). These are directly reusable in v2 with minor adaptation to TypeScript.

---

## Agentic Design Patterns

ISEE v2 implements several established agentic design patterns. Understanding these patterns helps explain the architectural choices and validates the design against industry best practices.

### Multi-Agent System
ISEE uses specialized agents, each with a distinct role — similar to a hospital where specialists coordinate rather than one generalist doing everything:

| Agent | Role | Analogy |
|-------|------|---------|
| Prep Agent | Generates knowledge domains | Intake coordinator |
| Clustering Agent | Groups responses by intellectual angle | Diagnostician |
| Advocate Agents | Argue for their cluster's value | Specialists presenting cases |
| Skeptic Agent | Challenges all advocates | Quality reviewer |
| Synthesis Agent | Selects final ideas, writes briefing | Chief summarizing recommendations |
| Translation Agent | Converts to plain language | Patient liaison |

### Plan-and-Execute Pattern
Rather than dynamically deciding next steps (ReAct pattern), ISEE uses a fixed 6-stage pipeline. This is appropriate because:
- The problem is well-structured with clear stages
- Each stage has defined inputs and outputs
- Predictability and debuggability are priorities
- No conditional branching or loops are needed

### Hybrid Execution Model
ISEE combines sequential and parallel execution strategically:

| Execution Type | Where Used | Why |
|----------------|------------|-----|
| **Sequential** | Between stages | Each stage depends on previous output |
| **Parallel** | Synthesis (~66 calls) | Independent LLM calls, 15-way concurrency |
| **Parallel** | Advocates (5-7 calls) | Independent per-cluster arguments |
| **Sequential** | Skeptic (1 call) | Must see all advocate outputs |
| **Parallel** | Rebuttals (5-7 calls) | Independent responses to challenges |

### Bounded Autonomy
Each agent operates within strict contracts:
- **Defined inputs**: TypeScript interfaces specify exactly what each agent receives
- **Defined outputs**: Agents must return data matching their output interface
- **No side effects**: Agents don't modify state outside their scope
- **Orchestrator control**: The pipeline orchestrator (`pipeline.ts`) manages all flow

This bounded autonomy provides capability while limiting risk — agents can't take unexpected actions or compound errors across the system.

### Patterns Intentionally Not Used

| Pattern | Why Not Used |
|---------|--------------|
| **ReAct** | Stages are single-turn tasks; thought-action-observation loops add latency without benefit |
| **Reflection** | Tournament layer provides external critique via Skeptic; self-reflection would be redundant |
| **Swarm** | Problem is well-structured; self-organizing agents suit dynamic/open-ended problems |

---

## System Overview

```
┌─────────────────────────────────────────────────────┐
│                    ISEE v2                          │
│                                                     │
│  [Query Input]                                      │
│       │                                             │
│       ▼                                             │
│  ┌─────────────┐                                    │
│  │  Prep Agent │  Generates 3–5 knowledge domains   │
│  └─────────────┘  relevant to this specific query   │
│       │                                             │
│       ▼                                             │
│  ┌─────────────────────────────────────────────┐    │
│  │           Synthesis Layer                   │    │
│  │  LLMs × Frameworks × Domains → ~60 calls   │    │
│  └─────────────────────────────────────────────┘    │
│       │                                             │
│       ▼                                             │
│  ┌─────────────────┐                                │
│  │ Clustering Agent│  Reads content only,           │
│  │  (Emergent)     │  groups into 5–7 angles        │
│  └─────────────────┘                                │
│       │                                             │
│       ▼                                             │
│  ┌─────────────────────────────────────────────┐    │
│  │           Tournament Layer                  │    │
│  │                                             │    │
│  │  Advocate Agent × N clusters               │    │
│  │       ↓                                     │    │
│  │  Skeptic Agent (challenges all)             │    │
│  │       ↓                                     │    │
│  │  Advocate rebuttals (one round)             │    │
│  └─────────────────────────────────────────────┘    │
│       │                                             │
│       ▼                                             │
│  ┌─────────────────┐                                │
│  │ Synthesis Agent │  Selects 3 ideas,              │
│  │                 │  writes confidence narrative   │
│  └─────────────────┘                                │
│       │                                             │
│       ▼                                             │
│  ┌───────────────────┐                              │
│  │ Translation Agent │  Converts to plain language  │
│  │                   │  with concrete action items  │
│  └───────────────────┘                              │
│       │                                             │
│       ▼                                             │
│  [Briefing Output]                                  │
└─────────────────────────────────────────────────────┘
```

---

## Dual-Query Context

All pipeline agents receive a `QueryContext` interface rather than a plain string:

```typescript
interface QueryContext {
  originalQuery: string;   // User's verbatim query — authoritative for all stages
  refinedQuery?: string;   // Additive context from follow-up Q&A — only set when refinement occurred
}
```

**Hierarchy rule**: `originalQuery` is always the ground truth. `refinedQuery` is additive only — it provides extra context but never overrides the original intent or framing. When no refinement occurred, only `originalQuery` is set.

`Briefing.query` always stores `originalQuery`, ensuring users see their actual question in the output regardless of whether refinement occurred.

---

## Stage-by-Stage Design

### Stage 0: Prep Agent

**Purpose**: Generate 3–5 knowledge domains specific to the user's query.
**Input**: `QueryContext` (original query + optional refined query)
**Output**: Array of domain objects `{ name, description, focus }`

**Why this matters**: v1's `domain_manager.py` described itself as dynamic but was actually a hardcoded list of 15 fixed domains (Urban Planning, Healthcare, Sustainability, etc.) — irrelevant to most queries. In v2, domain generation is a genuine LLM call that happens first, per query, every time. No fixed domain list exists anywhere in the codebase. For a query about governance systems, the Prep Agent might generate: Political Theory, Game Theory, Organizational Psychology, Historical Precedents, Distributed Systems. For a query about creative writing, it generates something entirely different. The domains are invented fresh for each run.

**Implementation**: Single LLM call with a focused prompt. Fast, cheap, high value.

---

### Stage 1: Synthesis Layer

**Purpose**: Generate the raw response matrix.
**Input**: Raw query string (extracted from `QueryContext.originalQuery`) + domains array + 11 framework templates
**Output**: Array of ~60 response objects `{ content, model, framework, domain }`

**Matrix construction**:
- Select 6 heterogeneous LLMs from OpenRouter (see Model Selection below)
- Use all 11 cognitive frameworks from v1's `instruction_templates.py`
- Use all domains generated by the Prep Agent
- Sample combinations to target ~60 calls (not the full Cartesian product)

**Key implementation note**: Response objects store `model`, `framework`, and `domain` as metadata, but this metadata is **withheld from the Clustering Agent**. It's preserved for the optional "show full debate" output only.

**Parallel execution**: All ~60 calls run in parallel via `Promise.all` with a concurrency limiter to respect OpenRouter rate limits.

---

### Stage 2: Emergent Clustering Agent

**Purpose**: Discover the genuine intellectual shape of the response space.
**Input**: `QueryContext` + array of response content strings (no synthesis metadata — model/framework/domain are withheld)
**Output**: Array of clusters `{ clusterName, clusterSummary, memberIndices[] }`

**Prompt design (key constraints)**:
- The agent receives numbered responses with no source labels
- Instructed to find 5–7 genuine intellectual angles, not thematic categories
- Instructed to name each cluster by *what argument it makes*, not by its topic
- Example: not "Technology Solutions" but "Replace governance with protocol-level incentives"

**Why emergent matters**: When three completely different framework/domain combinations converge on the same contrarian angle, that convergence is itself a signal. A structural clustering approach would never surface this — it would split them across their source dimensions.

**Handling variance**: Cluster groupings may differ across runs. This is acceptable. The constraint is that *any* valid clustering should surface something valuable, not that results are reproducible.

---

### Stage 3: Tournament Layer

**Purpose**: Surface the strongest ideas through structured debate.  
**Design**: Sequential advocate → skeptic → rebuttal (one round)

#### Advocate Agents (one per cluster, run in parallel)
**Input**: `QueryContext` + the cluster's name, summary, and strongest 2–3 member responses
**Output**: A concise argument for why this cluster's angle is the most valuable response to the original query

**Advocate prompt constraints**:
- Must make a *specific* argument, not a general endorsement
- Must explain what makes this angle surprising or non-obvious
- Must address why the user would not have found this through ordinary prompting

#### Skeptic Agent (single, runs after all advocates)
**Input**: `QueryContext` + all advocate arguments
**Output**: For each advocate: the strongest challenge to its argument

**Skeptic prompt constraints**:
- Must engage specifically with each argument — no generic challenges
- Must test whether the insight is genuinely novel or just reframed conventional wisdom
- Must identify whether the claimed value is real or rhetorical

#### Advocate Rebuttals (parallel, one per cluster)
**Input**: Advocate argument + skeptic challenge  
**Output**: Rebuttal or concession

This is the key confidence mechanism. An idea that cannot survive the skeptic's challenge concedes. An idea that rebuts successfully demonstrates resilience. The user can see this.

---

### Stage 4: Synthesis Agent

**Purpose**: Select 3 ideas and write the briefing.
**Input**: `QueryContext` + full debate transcript (advocates + skeptic challenges + rebuttals)
**Output**: The briefing document (`Briefing.query` is always set to `originalQuery`)

**Selection criteria the agent is instructed to apply**:
1. Which idea is most *surprising* — least likely to emerge from a single direct query?
2. Which idea is most *actionable* — does it point toward something the user can actually do?
3. Which idea most *challenges an assumption* the user probably holds?

**Briefing structure**:

```markdown
## ISEE Briefing: [query summary]

---

### Idea 1: [Idea title]
[2–3 sentence description of the idea]

**Why this emerged**: [Which angle produced it, how it survived debate]
**Why it's worth your attention**: [The confidence narrative — specific, not generic]

---

### Idea 2: [Idea title]
...

---

### Idea 3: [Idea title]
...

---

<details>
<summary>Show full debate transcript</summary>

[Full advocate arguments, skeptic challenges, and rebuttals]

</details>
```

---

### Stage 5: Translation Agent

**Purpose**: Convert the technical briefing into plain language with concrete action items.
**Input**: Briefing (3 ideas) + refined query
**Output**: TranslatedBriefing with simplified ideas

**Why this stage exists**: The Synthesis Agent's output is technically precise but may use jargon or abstract framing. The Translation Agent makes ideas accessible to any reader while preserving the original briefing for those who want the full analysis.

**Output structure per idea**:
```typescript
interface SimplifiedIdea {
  title: string;           // Plain-language title
  explanation: string;     // 2-3 sentence accessible explanation
  whyForYou: string;       // Personal connection to user's context
  actionItems: string[];   // 2-3 concrete next steps
}
```

**Implementation**: Single LLM call. Receives ideas and query only — the debate transcript is preserved in output but not re-translated.

---

## Model Selection for Synthesis Layer

**Target**: 6 models chosen for genuine cognitive heterogeneity, not just brand diversity.

Recommended starting set (all available via OpenRouter):
1. `anthropic/claude-sonnet-4` — strong reasoning and synthesis
2. `openai/gpt-4o` — broad knowledge, reliable
3. `google/gemini-2.5-pro` — strong cross-domain connections
4. `meta-llama/llama-3.3-70b` — open-source reasoning patterns differ meaningfully
5. `deepseek/deepseek-chat` — mathematical/structured reasoning
6. `x-ai/grok-3-mini` — contrarian tendency (valuable for debate seeding)

**Why 6 not 12–15**: v1's 15-model set added marginal diversity while significantly increasing cost and complexity. 6 well-chosen heterogeneous models × 11 frameworks × 3–5 domains produces sufficient combinatorial space. Quality over quantity.

---

## Tech Stack

### Language & Runtime
**TypeScript + Bun**

Rationale:
- Consistent with the obsidian-tagging-agent codebase already built and tested
- Bun's native parallel execution is well-suited to the Synthesis Layer's concurrent API calls
- TypeScript's type system makes the pipeline stages' data contracts explicit and safe
- Smaller, cleaner codebase than Python Flask + async complexity

### LLM Provider
**OpenRouter** — single API key, all 6 synthesis models available, unified billing.

### Agent Orchestration
**Anthropic Claude SDK (TypeScript)** for the intelligent pipeline agents (Clustering, Advocates, Skeptic, Synthesis). These agents need reliable, high-quality reasoning — Claude Sonnet is appropriate for all of them.

The Synthesis Layer's ~60 calls use the OpenRouter client directly (not the Claude SDK) to fan out across heterogeneous models.

### Frontend
**Single HTML file** with embedded CSS and JavaScript. No framework. No build step. Served by Bun's built-in HTTP server.

Rationale: The UI has two states — input form and briefing output. This does not justify a React app. A single HTML file is faster to build, easier to maintain, and consistent with the simplicity principle.

### Storage
**SQLite database** (`data/isee.db`) for production observability:

| Table | Purpose |
|-------|---------|
| `runs` | Run metadata, status, timing, total costs by provider |
| `llm_calls` | Every LLM call with model, tokens, cost, duration |
| `api_keys` | API key management for multi-tenant access |

**Observability layer** (`src/observability/`):
- Cost tracking per run and per provider
- Metrics endpoint for Prometheus
- Distributed tracing with OpenTelemetry

---

## Repository Structure

```
isee-v2/
├── src/
│   ├── pipeline/
│   │   ├── prep.ts           # Stage 0: Domain generation
│   │   ├── synthesis.ts      # Stage 1: Matrix generation (~66 parallel calls)
│   │   ├── clustering.ts     # Stage 2: Emergent clustering
│   │   ├── tournament.ts     # Stage 3: Advocate/Skeptic/Rebuttal
│   │   ├── synthesizer.ts    # Stage 4: Briefing generation
│   │   ├── refinement.ts     # Query refinement (pre-pipeline)
│   │   └── translation.ts    # Stage 5: Plain-language translation
│   ├── config/
│   │   ├── frameworks.ts     # 11 cognitive framework prompts
│   │   ├── models.ts         # 6 synthesis model definitions
│   │   └── prompts/          # All agent prompts with design rationale
│   ├── clients/
│   │   ├── anthropic.ts      # Claude SDK for pipeline agents
│   │   └── openrouter.ts     # OpenRouter for synthesis layer
│   ├── db/
│   │   ├── connection.ts     # SQLite connection management
│   │   ├── schema.ts         # Table definitions
│   │   ├── migrations.ts     # Schema migrations
│   │   ├── runs.ts           # Run persistence
│   │   ├── llm-calls.ts      # LLM call logging
│   │   ├── api-keys.ts       # API key management
│   │   └── metrics.ts        # Aggregated metrics queries
│   ├── security/
│   │   ├── rate-limit.ts     # Token bucket rate limiter
│   │   ├── cors.ts           # CORS configuration
│   │   └── validation.ts     # Input sanitization
│   ├── auth/
│   │   └── middleware.ts     # API key authentication
│   ├── observability/
│   │   ├── cost.ts           # Cost tracking per provider
│   │   ├── metrics.ts        # Prometheus metrics
│   │   ├── spans.ts          # Trace span helpers
│   │   └── tracing.ts        # OpenTelemetry setup
│   ├── resilience/
│   │   ├── circuit-breaker.ts
│   │   ├── retry.ts
│   │   └── timeout.ts
│   ├── dashboard/
│   │   ├── handlers.ts       # Dashboard API endpoints
│   │   └── cache.ts          # Dashboard data caching
│   ├── utils/
│   │   └── logger.ts         # Pino structured logging
│   ├── types.ts              # Shared TypeScript interfaces
│   ├── pipeline.ts           # Orchestrator: runs all stages
│   └── server.ts             # Bun HTTP server + SSE streaming
├── public/
│   ├── index.html            # Main UI
│   └── dashboard.html        # Operations dashboard
├── data/                     # SQLite database (gitignored)
├── test/
│   ├── golden.test.ts        # Full pipeline integration tests
│   └── golden-queries.json   # Test query fixtures
├── .env.template
├── CLAUDE.md
├── PRD.md
├── ARCHITECTURE.md
├── PROMPTS.md
└── package.json
```

---

## Data Contracts (TypeScript Interfaces)

```typescript
// Cross-pipeline query context (defined in src/types.ts)
interface QueryContext {
  originalQuery: string;  // User's verbatim query — authoritative for all stages
  refinedQuery?: string;  // Additive context from follow-up Q&A (only if wasRefined=true)
}

// Stage 0 output
interface Domain {
  name: string;
  description: string;
  focus: string; // what angle this domain contributes
}

// Stage 1 output
interface RawResponse {
  index: number;
  content: string;
  model: string;      // withheld from clustering agent
  framework: string;  // withheld from clustering agent
  domain: string;     // withheld from clustering agent
}

// Stage 2 output
interface Cluster {
  id: number;
  name: string;         // argument-style name, e.g. "Replace X with Y"
  summary: string;
  memberIndices: number[];
}

// Stage 3 output
interface DebateEntry {
  clusterId: number;
  clusterName: string;
  advocateArgument: string;
  skepticChallenge: string;
  rebuttal: string;
}

// Stage 4 output
interface Briefing {
  query: string;
  timestamp: string;
  ideas: ExtractedIdea[];
  debateTranscript: DebateEntry[];
}

interface ExtractedIdea {
  title: string;
  description: string;
  whyEmerged: string;
  whyItMatters: string;
}

// Stage 5 output
interface TranslatedBriefing {
  queryPlainLanguage: string;
  ideas: SimplifiedIdea[];
  originalBriefing: Briefing;  // preserved for full-detail view
}

interface SimplifiedIdea {
  title: string;           // Plain-language title
  explanation: string;     // 2-3 sentence accessible explanation
  whyForYou: string;       // Personal connection to user's context
  actionItems: string[];   // 2-3 concrete next steps
}
```

---

## Implementation Decisions (Resolved)

These questions were open during the design phase and have since been resolved:

| Question | Resolution |
|----------|------------|
| **Clustering prompt engineering** | Implemented with argument-style naming constraint. Prompts in `src/config/prompts/clustering.ts` produce consistent, useful cluster names. |
| **Concurrency limiter** | Set to 15 concurrent requests. Balances throughput against OpenRouter rate limits. Configurable via `concurrencyLimit` parameter. |
| **Advocate count** | No hard cap. Clustering targets 5-7 clusters; Skeptic handles this range well. Graceful degradation if any advocate fails. |
| **Briefing rendering** | Using marked.js for Markdown→HTML conversion in the browser. Works reliably across all tested environments. |

---

## Build Phases (Completed)

All phases have been implemented and are in production.

| Phase | Scope | Status |
|-------|-------|--------|
| **Phase 1** | Pipeline skeleton, types, orchestrator | ✓ Complete |
| **Phase 2** | Synthesis Layer, OpenRouter client, parallel execution | ✓ Complete |
| **Phase 3** | Clustering + Tournament (Advocates, Skeptic, Rebuttals) | ✓ Complete |
| **Phase 4** | Synthesis Agent, Briefing formatter, Bun server, UI | ✓ Complete |
| **Phase 5** | Integration, tuning, Translation Agent | ✓ Complete |
| **Production** | SQLite persistence, API auth, rate limiting, dashboard | ✓ Complete |

---

## Related Documentation

- [FAQ.md](./FAQ.md) — Answers to common questions about ISEE's design choices
- [PRD.md](./PRD.md) — Product requirements and design principles
- [OVERVIEW.md](./OVERVIEW.md) — User-facing explanation of how ISEE works
- [CLAUDE.md](../CLAUDE.md) — Developer conventions for working on this codebase

---

*Last updated: March 2026 (updated to reflect production state and agentic design patterns)*
