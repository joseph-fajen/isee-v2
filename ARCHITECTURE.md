# ISEE v2 — Architecture Plan

**Status**: Draft  
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
│  [Briefing Output]                                  │
└─────────────────────────────────────────────────────┘
```

---

## Stage-by-Stage Design

### Stage 0: Prep Agent

**Purpose**: Generate 3–5 knowledge domains specific to the user's query.  
**Input**: Raw user query  
**Output**: Array of domain objects `{ name, description, focus }` 

**Why this matters**: v1's `domain_manager.py` described itself as dynamic but was actually a hardcoded list of 15 fixed domains (Urban Planning, Healthcare, Sustainability, etc.) — irrelevant to most queries. In v2, domain generation is a genuine LLM call that happens first, per query, every time. No fixed domain list exists anywhere in the codebase. For a query about governance systems, the Prep Agent might generate: Political Theory, Game Theory, Organizational Psychology, Historical Precedents, Distributed Systems. For a query about creative writing, it generates something entirely different. The domains are invented fresh for each run.

**Implementation**: Single LLM call with a focused prompt. Fast, cheap, high value.

---

### Stage 1: Synthesis Layer

**Purpose**: Generate the raw response matrix.  
**Input**: Query + domains array + 11 framework templates  
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
**Input**: Array of response content strings (no metadata)  
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
**Input**: The cluster's name, summary, and strongest 2–3 member responses  
**Output**: A concise argument for why this cluster's angle is the most valuable response to the original query

**Advocate prompt constraints**:
- Must make a *specific* argument, not a general endorsement
- Must explain what makes this angle surprising or non-obvious
- Must address why the user would not have found this through ordinary prompting

#### Skeptic Agent (single, runs after all advocates)
**Input**: All advocate arguments + original query  
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
**Input**: Full debate transcript (advocates + skeptic challenges + rebuttals)  
**Output**: The briefing document

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
**JSON files only**. Each run produces one output file: `isee-briefing-[timestamp].md`. No SQLite, no performance tracking database, no annotation storage.

---

## Repository Structure (New Repo)

```
isee-v2/
├── src/
│   ├── pipeline/
│   │   ├── prep.ts           # Stage 0: Domain generation
│   │   ├── synthesis.ts      # Stage 1: Matrix generation
│   │   ├── clustering.ts     # Stage 2: Emergent clustering
│   │   ├── tournament.ts     # Stage 3: Advocate/Skeptic/Rebuttal
│   │   └── synthesizer.ts    # Stage 4: Briefing generation
│   ├── config/
│   │   ├── frameworks.ts     # 11 cognitive framework prompts (from v1)
│   │   └── models.ts         # 6 synthesis model definitions
│   ├── types.ts              # Shared TypeScript interfaces
│   ├── pipeline.ts           # Orchestrator: runs all stages in sequence
│   └── server.ts             # Bun HTTP server
├── public/
│   └── index.html            # Single-page UI
├── output/                   # Generated briefing files
├── .env.template
├── CLAUDE.md
├── PRD.md
└── package.json
```

---

## Data Contracts (TypeScript Interfaces)

```typescript
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
```

---

## Open Questions for Implementation Phase

1. **Clustering prompt engineering**: What level of instruction produces consistently useful cluster names? Needs experimentation — test with 3–4 different prompt versions before committing.

2. **Concurrency limiter**: OpenRouter rate limits vary by model. What's the right concurrent request ceiling for the Synthesis Layer? Start conservative (10 concurrent) and tune.

3. **Advocate count**: If emergent clustering produces 7 clusters, 7 parallel advocate calls is fine. But the skeptic prompt grows with cluster count. Is there a ceiling above which the skeptic's quality degrades? May need to cap at 6 clusters.

4. **Briefing rendering**: Markdown output is simple but requires the user to have a Markdown renderer. HTML output works everywhere but adds complexity. Recommendation: render Markdown to HTML in `index.html` using a lightweight library (marked.js, ~50kb).

---

## Build Phases

### Phase 1: Pipeline skeleton
- Scaffold repo structure
- Implement types.ts
- Implement stub versions of all 5 pipeline stages
- Wire orchestrator
- Verify data flows end-to-end with mock responses

### Phase 2: Synthesis Layer
- Implement OpenRouter multi-model client
- Port cognitive framework prompts from v1
- Implement dynamic domain generation (Prep Agent)
- Implement parallel execution with concurrency limiter
- Test with 3 models × 3 frameworks × 2 domains = 18 calls

### Phase 3: Clustering + Tournament
- Implement Emergent Clustering Agent with prompt experimentation
- Implement Advocate Agents (parallel)
- Implement Skeptic Agent
- Implement Rebuttal round
- Test full Tournament layer with real Synthesis output

### Phase 4: Synthesis Agent + Briefing
- Implement Synthesis Agent with selection criteria
- Implement Briefing formatter (Markdown + HTML)
- Implement Bun HTTP server
- Build index.html UI

### Phase 5: Integration + tuning
- End-to-end run with full ~60 call matrix
- Tune cluster count, advocate prompts, synthesis criteria
- Verify briefing quality against north star

---

*Last updated: March 2026*
