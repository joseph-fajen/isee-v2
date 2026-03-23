# CLAUDE.md

This file provides guidance to Claude Code when working on the ISEE v2 codebase.

## What is ISEE v2?

ISEE (Idea Synthesis and Extraction Engine) is a thinking amplifier that:
1. **Synthesizes** diverse perspectives by querying multiple LLMs through multiple cognitive frameworks across dynamically-generated knowledge domains
2. **Extracts** the 3 most valuable ideas through an emergent clustering + tournament evaluation pipeline

**North Star**: ISEE expands the possibility space through combinatorial synthesis, then extracts 3 breakthrough ideas through rigorous emergent evaluation. The user receives these ideas with full confidence in how they were found — and retains complete authority over what to do with them.

## Core Design Principles

See [PRD.md](./PRD.md#design-principles) for the 5 core design principles. Key principles to keep in mind while coding:
- **ISEE does the work** — no user-facing evaluation UI
- **Emergent over structural** — clustering discovers angles, doesn't impose categories

## Architecture Overview

> Full design details in [ARCHITECTURE.md](./ARCHITECTURE.md)

```
[Query Input]
     ↓
[Stage 0: Prep Agent]        → Generates 3-5 knowledge domains for this query
     ↓
[Stage 1: Synthesis Layer]   → LLMs × Frameworks × Domains → ~60 responses
     ↓
[Stage 2: Clustering Agent]  → Groups by intellectual angle (5-7 clusters)
     ↓
[Stage 3: Tournament Layer]  → Advocates argue, Skeptic challenges, Rebuttals
     ↓
[Stage 4: Synthesis Agent]   → Selects 3 ideas, writes briefing
     ↓
[Briefing Output]            → 3 ideas + confidence narratives + debate transcript
```

## Tech Stack

> Full stack details in [ARCHITECTURE.md](./ARCHITECTURE.md)

Key details for implementation:
- **OpenRouter**: Used for Synthesis Layer (6 heterogeneous models)
- **Anthropic Claude SDK**: Used for pipeline agents (Clustering, Advocates, Skeptic, Synthesis)

## Key Files

| File | Purpose |
|------|---------|
| `src/pipeline.ts` | Main orchestrator - runs all stages in sequence |
| `src/server.ts` | Bun HTTP server - serves UI and handles API |
| `src/types.ts` | Shared TypeScript interfaces (data contracts) |
| `src/pipeline/prep.ts` | Stage 0: Dynamic domain generation |
| `src/pipeline/synthesis.ts` | Stage 1: Matrix generation (~60 LLM calls) |
| `src/pipeline/clustering.ts` | Stage 2: Emergent clustering |
| `src/pipeline/tournament.ts` | Stage 3: Advocate/Skeptic/Rebuttal |
| `src/pipeline/synthesizer.ts` | Stage 4: Briefing generation |
| `src/config/frameworks.ts` | 11 cognitive framework prompts |
| `src/config/models.ts` | 6 synthesis model definitions |
| `public/index.html` | Single-page UI |

## Development Commands

```bash
# Install dependencies
bun install

# Run development server
bun run dev

# Run pipeline directly (for testing)
bun run pipeline

# Type check
bun run typecheck

# Run tests
bun test
```

## Important Conventions

### Data Flow Contracts

Each pipeline stage has strict input/output contracts defined in `src/types.ts`. When modifying a stage:
1. Check the interface it must satisfy
2. Ensure output matches the expected shape
3. The orchestrator in `pipeline.ts` validates data flow

### Metadata Handling

**Critical**: The Clustering Agent must NOT receive source metadata (model, framework, domain). It receives response content only. Metadata is preserved separately and reunited in the final briefing for the "show full debate" section.

### Domain Generation

Domains are generated dynamically per query in Stage 0. There is NO fixed domain list anywhere in this codebase. If you see hardcoded domains, that's a bug from v1 patterns leaking in.

### Cognitive Frameworks

The 11 frameworks in `src/config/frameworks.ts` are a fixed asset ported from v1. They are well-tested and should not be modified without good reason.

### Parallel Execution

- Stage 1 (Synthesis): All ~60 calls run in parallel with concurrency limiter
- Stage 3 (Advocates): All advocate calls run in parallel
- Stage 3 (Skeptic): Single call after all advocates complete
- Stage 3 (Rebuttals): All rebuttal calls run in parallel

### Error Handling

Individual LLM failures should not crash the pipeline:
- Synthesis Layer: Continue with remaining successful calls
- Tournament: If an advocate fails, exclude that cluster from debate
- If critical agents fail (Clustering, Synthesis), the run fails gracefully with explanation

## Build Phases

Reference [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed build phases.

## Reference Documents

- [PRD.md](./PRD.md) - Product requirements, design principles, success criteria
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Stage-by-stage design, data contracts, project structure
- [PROMPTS.md](./PROMPTS.md) - All pipeline prompts with design rationale

## What NOT to Build

See [PRD.md](./PRD.md#out-of-scope-for-v2) for the complete scope exclusion list. In short: no scoring UIs, no file browsers, no annotation systems, no configuration UI.
