# ISEE v2

**Idea Synthesis and Extraction Engine**

ISEE is a thinking amplifier that expands the possibility space through combinatorial synthesis, then extracts 3 breakthrough ideas through rigorous emergent evaluation.

## Quick Start

```bash
# Install dependencies
bun install

# Copy environment template
cp .env.template .env
# Edit .env with your API keys

# Run the development server
bun run dev

# Or run the pipeline directly
bun run pipeline "Your research question here"
```

## How It Works

ISEE runs a 5-stage pipeline:

1. **Prep Agent** - Generates 3-5 knowledge domains specific to your query
2. **Synthesis Layer** - Queries 6 AI models × 11 cognitive frameworks × domains (~60 calls)
3. **Clustering Agent** - Discovers 5-7 distinct intellectual angles (emergent, not structural)
4. **Tournament Layer** - Advocates argue, Skeptic challenges, Rebuttals defend
5. **Synthesis Agent** - Selects 3 ideas with visible reasoning

The output is a briefing document with:
- 3 extracted ideas
- Confidence narratives explaining why each was selected
- Optional full debate transcript

## Project Structure

```
isee-v2/
├── src/
│   ├── pipeline/           # All 5 pipeline stages
│   │   ├── prep.ts         # Stage 0: Domain generation
│   │   ├── synthesis.ts    # Stage 1: Matrix generation
│   │   ├── clustering.ts   # Stage 2: Emergent clustering
│   │   ├── tournament.ts   # Stage 3: Debate
│   │   └── synthesizer.ts  # Stage 4: Briefing
│   ├── config/
│   │   ├── frameworks.ts   # 11 cognitive frameworks
│   │   └── models.ts       # 6 synthesis models
│   ├── types.ts            # TypeScript interfaces
│   ├── pipeline.ts         # Orchestrator
│   └── server.ts           # Bun HTTP server
├── public/
│   └── index.html          # Single-page UI
├── output/                 # Generated briefings
├── PRD.md                  # Product requirements
├── ARCHITECTURE.md         # System design
├── PROMPTS.md              # Pipeline prompts
└── CLAUDE.md               # AI assistant instructions
```

## Development Status

This is a fresh implementation. Current status:

- [x] Repository scaffold
- [x] Type definitions
- [x] Pipeline stubs with mock data
- [x] Basic UI
- [ ] OpenRouter client integration
- [ ] Anthropic SDK integration
- [ ] Real LLM calls
- [ ] Prompt tuning

## Development Strategy: Option B → C

This project follows a two-phase development strategy:

### Option B: Direct Development (Current)
Build ISEE v2 with Claude Code using the PRD and Architecture documents. Each build phase (see ARCHITECTURE.md) is a discrete milestone:

1. **Phase 1** ✅ - Pipeline skeleton with stubs
2. **Phase 2** - Synthesis Layer (OpenRouter client, parallel execution)
3. **Phase 3** - Clustering + Tournament (prompt tuning required)
4. **Phase 4** - Synthesis Agent + Briefing output
5. **Phase 5** - Integration + tuning

### Option C: Archon Integration (Post-MVP)
After the core pipeline works, integrate with [Archon](https://github.com/dynamous-community/remote-coding-agent) — a workflow engine for AI coding agents.

**Why Archon later, not now:**
- The PRD and Architecture docs are sufficient for Claude Code to execute well
- Adding workflow complexity before validating the core pipeline is premature
- First milestone should be: working pipeline, minimal UI

**What Archon enables post-MVP:**
- **YAML-defined workflows** for running ISEE analyses deterministically
- **Multi-interface access** — run ISEE from Slack, Telegram, or GitHub
- **Isolated worktrees** — run multiple analyses in parallel
- **Development workflows** — deterministic CI/CD for ISEE improvements

**Example future workflow:**
```yaml
# .archon/workflows/isee-analyze.yaml
name: isee-analyze
steps:
  - command: run-isee-pipeline
  - command: save-briefing
  - command: notify-user
```

See [Archon CLI docs](https://joseph-fajen.github.io/archon-cli-docs/) for workflow syntax.

## Documentation

- [PRD.md](./PRD.md) - Product requirements and north star
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design and data contracts
- [PROMPTS.md](./PROMPTS.md) - All pipeline prompts with rationale
- [CLAUDE.md](./CLAUDE.md) - Instructions for AI coding assistants

## License

MIT
