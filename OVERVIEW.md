# ISEE v2 — Idea Synthesis and Extraction Engine

## What is ISEE?

ISEE is a thinking amplifier. You give it a strategic question; it returns 3 breakthrough ideas you wouldn't find from a single AI query.

**The problem it solves:** When you ask an AI a complex question, you get *an* answer — plausible, coherent, and limited to one perspective. ISEE expands the possibility space by querying multiple models through multiple cognitive frameworks, then extracts signal from that noise through structured debate.

## How It Works

```
Your Question
     ↓
┌─────────────────────────────────────────┐
│  Stage 0: Prep Agent                    │
│  Generate 3-5 knowledge domains         │
└─────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────┐
│  Stage 1: Synthesis Layer               │
│  6 AI models × 11 frameworks × domains  │
│  = ~60 diverse perspectives             │
└─────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────┐
│  Stage 2: Clustering                    │
│  Group by intellectual angle, not source│
│  → 5-7 emergent clusters                │
└─────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────┐
│  Stage 3: Tournament                    │
│  Advocates argue → Skeptic challenges   │
│  → Rebuttals defend                     │
└─────────────────────────────────────────┘
     ↓
┌─────────────────────────────────────────┐
│  Stage 4: Synthesis                     │
│  Select 3 ideas that survived scrutiny  │
│  + confidence narratives                │
└─────────────────────────────────────────┘
     ↓
Your Briefing: 3 ideas with full debate transcript
```

## Why This Architecture?

**Diversity without noise.** Multiple models and frameworks generate genuine intellectual diversity. Clustering by angle (not by source) ensures you see distinct perspectives, not variations on the same theme.

**Ideas earn their place.** The tournament isn't theater — the Skeptic challenges are adversarial, and ideas that can't defend themselves don't make the final briefing. What survives has been stress-tested.

**Confidence through visible reasoning.** You trust the 3 ideas not because of a score, but because you can read the debate transcript and see how they held up under challenge.

## Quick Start

```bash
# Install dependencies
bun install

# Start the server
bun run dev

# Open http://localhost:3000
```

Enter a question worth exploring deeply. Expect 3-5 minutes for a full run.

## Good Questions for ISEE

ISEE works best on strategic, open-ended questions where multiple valid approaches exist:

- "How might we improve decision-making in organizations while preserving autonomy?"
- "What approaches help remote teams maintain serendipitous collaboration?"
- "How can I design a workflow that balances automation with human curation?"

ISEE is **not** for factual lookups, code generation, or questions with single correct answers.

## What You Get

A briefing containing:

1. **3 extracted ideas** — each with:
   - The insight itself
   - Why it emerged from the debate
   - Why it matters for your situation

2. **Full debate transcript** (expandable) — see how each cluster's advocate argued, how the skeptic challenged, and how the rebuttal responded

3. **Statistics** — synthesis calls, clusters analyzed, duration

## The Models

ISEE queries 6 heterogeneous AI models through OpenRouter:

| Model | Why It's Included |
|-------|-------------------|
| Claude Sonnet | Nuanced reasoning, strong synthesis |
| GPT-4o | Broad knowledge, reliable structure |
| Gemini 2.5 Pro | Cross-domain connections, thinking model |
| Llama 3.3 70B | Different training perspective |
| DeepSeek R1 | Technical depth, reasoning focus |
| Grok 3 Mini | Contrarian tendencies, debate seeding |

## The Frameworks

Each model responds through 11 cognitive frameworks:

- Analytical, Creative, Critical, Pragmatic
- Systems Thinking, First Principles, Historical
- Futurist, Integrative, Contrarian, Disruption

This isn't prompt decoration — frameworks genuinely shift how models approach problems.

## For Developers

See [ARCHITECTURE.md](./ARCHITECTURE.md) for tech stack, project structure, data contracts, and build phases.

## Further Reading

- [PRD.md](./PRD.md) — Design principles, scope boundaries, success criteria
- [ARCHITECTURE.md](./ARCHITECTURE.md) — Stage-by-stage technical design, data contracts, project structure
- [PROMPTS.md](./PROMPTS.md) — All LLM prompts with design rationale
- [CLAUDE.md](./CLAUDE.md) — Developer conventions for working on this codebase
