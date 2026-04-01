# ISEE v2 — Frequently Asked Questions

---

## Why does ISEE require both an Anthropic API key and an OpenRouter API key?

**Short answer:** It's a design choice for reliability and structured outputs, not a technical requirement.

### What Each Key Does

| Provider | Used For | Call Count per Run |
|----------|----------|-------------------|
| **OpenRouter** | Synthesis Layer only (Stage 1) | ~66 parallel calls to 6 different models |
| **Anthropic Direct** | All 6 agent stages | ~15-20 calls total |

### Why Two Keys?

**1. Structured Outputs (the main reason)**

The pipeline agents (Prep, Clustering, Skeptic, Synthesis, Translation) need to return data matching specific TypeScript interfaces. The Anthropic SDK's native `messages.parse()` method with Zod schemas (Zod is a TypeScript validation library that checks data at runtime) guarantees type-safe responses:

```typescript
const response = await getClient().messages.parse({
  model: AGENT_MODEL,
  messages: [{ role: 'user', content: prompt }],
  output_config: { format: zodOutputFormat(DomainsResponseSchema) },
});
```

OpenRouter proxies the chat completions API but doesn't expose Anthropic's structured output feature in the same way.

**2. Separate Rate Limit Pools**

The synthesis layer fires ~66 calls in ~15 seconds. By using OpenRouter for synthesis and Anthropic for agents, the two workloads don't compete for the same rate limits.

**3. Resilience**

ISEE has separate circuit breakers for each provider. If OpenRouter has issues during synthesis, the agent stages can still run. Provider isolation prevents cascade failures.

### Could It Run With Just OpenRouter?

Yes, with code changes. You'd need to:
1. Replace `messages.parse()` calls with regular `chat.completions.create()` calls
2. Add manual JSON parsing + Zod validation of response content
3. Accept routing all traffic through one provider (losing resilience benefits)

### Could It Run With Just Anthropic?

Also possible, but you'd lose model diversity in synthesis. The synthesis layer queries 6 different models (GPT-4o, Gemini, Llama, DeepSeek, Grok, and Claude Sonnet via OpenRouter) to generate genuinely different perspectives. Using only Claude would defeat this purpose.

### Is It Worth Changing?

Probably not:
- Direct Anthropic SDK is more reliable for structured outputs
- Cost difference is negligible (OpenRouter markup is ~0%)
- Two keys takes 2 minutes to set up
- Resilience benefits are real

---

## Do agents have unique prompts? Can users customize them?

**Yes, each agent has its own dedicated prompt.** No, users cannot currently customize them.

### Prompt Architecture

Each agent has a dedicated file in `src/config/prompts/` containing:
- Design rationale in comments
- TypeScript interface defining inputs
- A `build*Prompt()` function that constructs the prompt

| Agent | File | Purpose |
|-------|------|---------|
| Prep Agent | `prep.ts` | Generate 3-5 knowledge domains |
| Clustering Agent | `clustering.ts` | Group responses into 5-7 intellectual angles |
| Advocate Agent | `advocate.ts` | Argue for a cluster's value (one instance per cluster) |
| Skeptic Agent | `skeptic.ts` | Challenge all advocates (single instance, sees all arguments) |
| Rebuttal Agent | `rebuttal.ts` | Respond to skeptic's challenge (one instance per cluster) |
| Synthesis Agent | `synthesis.ts` | Select 3 ideas, write the briefing |
| Translation Agent | `translation.ts` | Convert to plain language with action items |
| Refinement Agents | `refinement.ts` | Assess query quality, generate follow-ups, rewrite |

### Prompt Engineering

Each prompt is carefully engineered with explicit constraints. For example, the Clustering Agent prompt specifies:

> **Examples of topic labels (WRONG):**
> - "Technology Solutions"
> - "Governance Approaches"
>
> **Examples of argument-style angle names (CORRECT):**
> - "Automate the human decision layer out of existence"
> - "The problem is in the incentive structure, not the process"

### Why No User Customization?

This is a deliberate design choice:
- Prompts are tightly coupled to the pipeline's data contracts
- Each prompt references specific output schemas (Zod validation)
- The prompts work together as a system — changing one could break the chain
- ISEE's value proposition is that it does the work; exposing prompt configuration shifts cognitive burden back to the user

**Could customization be added?** Yes, but it would require a configuration layer and validation that customized prompts still produce valid structured outputs.

---

## How do agents relate to one another?

The agents form a **sequential pipeline with deliberate information flow**. Each agent's output becomes the next agent's input, with strict TypeScript interfaces defining the data contracts.

### Pipeline Data Flow

```
[User Query]
     │
     ▼
┌─────────┐
│  PREP   │ → Generates 3-5 knowledge domains
└────┬────┘
     │ domains[]
     ▼
┌───────────┐
│ SYNTHESIS │ → 6 models × 11 frameworks × domains ≈ 66 calls
│ (OpenR)   │   (Only stage using OpenRouter, not Anthropic)
└────┬──────┘
     │ responses[] (content + metadata)
     ▼
┌────────────┐
│ CLUSTERING │ → Receives content ONLY (metadata stripped)
└────┬───────┘   Groups into 5-7 clusters
     │ clusters[]
     ▼
┌──────────────────────────────────────────────┐
│               TOURNAMENT                      │
│  ┌──────────┐                                │
│  │ ADVOCATE │ × N clusters (parallel)        │
│  │  (×5-7)  │ → Each argues for their cluster│
│  └────┬─────┘                                │
│       │ advocateArguments[]                  │
│       ▼                                      │
│  ┌─────────┐                                 │
│  │ SKEPTIC │ → Single agent sees ALL args    │
│  │  (×1)   │   Challenges each one           │
│  └────┬────┘                                 │
│       │ skepticChallenges[]                  │
│       ▼                                      │
│  ┌──────────┐                                │
│  │ REBUTTAL │ × N clusters (parallel)        │
│  │  (×5-7)  │ → Each responds to challenge   │
│  └────┬─────┘                                │
└───────┼──────────────────────────────────────┘
        │ debateEntries[]
        ▼
┌────────────┐
│ SYNTHESIZER│ → Reads full debate, selects 3 ideas
└────┬───────┘
     │ briefing (3 ideas + debate transcript)
     ▼
┌─────────────┐
│ TRANSLATION │ → Converts to plain language + action items
└────┬────────┘
     │
     ▼
[Final Briefing]
```

### Key Design Decisions

**1. Clustering is blind to source metadata**

The Clustering Agent only sees response content — not which model, framework, or domain produced each response. This ensures clusters represent genuine intellectual angles, not artifacts of how responses were generated.

**2. Skeptic sees all advocates before challenging**

This is critical. By seeing all advocate arguments together, the Skeptic can identify when two clusters are making substantially the same claim in different words.

**3. Every agent receives the original query**

Each prompt includes the user's `originalQuery` as the authoritative signal. This prevents semantic drift as information flows through the pipeline.

**4. Strict output contracts**

Each agent's output is validated against TypeScript interfaces via Zod schemas. The pipeline fails fast if an agent returns malformed data, rather than propagating errors downstream.

### Which Model Powers Each Agent?

| Stage | Model | Provider |
|-------|-------|----------|
| Synthesis (Stage 1) | 6 heterogeneous models | OpenRouter |
| All other agents | `claude-sonnet-4-5` | Anthropic Direct |

The pipeline agents all use `claude-sonnet-4-5` via the direct Anthropic SDK because it supports structured outputs with Zod schema validation.

---

## Why is ISEE built with TypeScript? What are data contracts?

**Short answer:** TypeScript catches errors at compile time rather than runtime, and data contracts define the exact shape of data passed between pipeline stages so errors are caught early.

### The Problem Without Contracts

Imagine the Clustering Agent returns this:

```json
{
  "groups": [
    { "title": "Tech stuff", "responses": [1, 5, 12] }
  ]
}
```

But the Tournament Agent expects this:

```json
{
  "clusters": [
    { "id": 1, "name": "...", "summary": "...", "memberIndices": [1, 5, 12] }
  ]
}
```

The field names don't match. The pipeline breaks — but where? When? With what error message? In a dynamic language, you might not find out until runtime, deep in the tournament code, with a confusing `KeyError: 'clusters'`.

### The Solution: TypeScript Interfaces + Zod Validation

ISEE uses two layers of enforcement:

**Layer 1: TypeScript Interface (compile-time)**

```typescript
// src/types.ts
export interface Cluster {
  id: number;
  name: string;
  summary: string;
  memberIndices: number[];
}
```

This tells the TypeScript compiler: "Anywhere code handles a `Cluster`, it must have these exact fields with these exact types." If you write code that accesses `cluster.title` instead of `cluster.name`, the compiler catches it before you ever run the code.

**Layer 2: Zod Schema (runtime)**

```typescript
// src/clients/anthropic.ts
const ClusterSchema = z.object({
  id: z.number(),
  name: z.string(),
  summary: z.string(),
  memberIndices: z.array(z.number()),
});
```

This validates the actual JSON that comes back from Claude. If the LLM returns malformed data (wrong field name, missing field, wrong type), Zod throws an error immediately — not three stages later when something mysteriously fails.

### Why TypeScript Was Chosen

From ARCHITECTURE.md:

> **TypeScript + Bun**
> - TypeScript's type system makes the pipeline stages' data contracts explicit and safe
> - Consistent with other projects in the portfolio
> - Bun's native parallel execution suits the Synthesis Layer's concurrent API calls

The key advantage is **fail-fast behavior**:

| Problem | Dynamic Language | TypeScript |
|---------|------------------|------------|
| Wrong field name | Runtime error, maybe deep in code | Compile-time error, immediate |
| Missing field | `None`/`undefined` propagates silently | Compiler error |
| Wrong type | Runtime `TypeError` eventually | Compiler error |
| LLM returns bad JSON | Discovered later | Zod catches immediately |

### Practical Example: What Happens When Things Go Wrong

**Scenario:** Claude's Clustering Agent returns a cluster with `indices` instead of `memberIndices`.

**Without contracts (dynamic language):**

```python
# Clustering returns: {"indices": [1, 2, 3]}
# Tournament tries to use it much later:
for idx in cluster["memberIndices"]:  # KeyError! But where did it come from?
    process(idx)
```

**With contracts (TypeScript + Zod):**

```typescript
// Zod validation fails immediately when parsing Claude's response:
// ZodError: Required field "memberIndices" is missing

// The error happens in the Clustering stage, with a clear message,
// before any downstream code tries to use the bad data.
```

### The Chain of Contracts in ISEE

Each arrow represents a data contract enforced by TypeScript at compile time and Zod at runtime:

```
QueryContext ──→ Prep Agent ──→ Domain[]
                                    │
                                    ▼
Domain[] + Query ──→ Synthesis ──→ RawResponse[]
                                        │
                                        ▼
RawResponse[] ──→ Clustering ──→ Cluster[]
                                     │
                                     ▼
Cluster[] ──→ Advocates ──→ AdvocateArgument[]
                                   │
                                   ▼
AdvocateArgument[] ──→ Skeptic ──→ SkepticChallenge[]
                                         │
                                         ▼
(all of above) ──→ Synthesizer ──→ Briefing
                                       │
                                       ▼
Briefing ──→ Translation ──→ TranslatedBriefing
```

All contract interfaces are defined in `src/types.ts`. Zod schemas that validate LLM responses are defined in `src/clients/anthropic.ts`.

---
