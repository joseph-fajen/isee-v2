# ISEE v2

**Idea Synthesis and Extraction Engine**

ISEE is a thinking amplifier that expands the possibility space through combinatorial synthesis, then extracts 3 breakthrough ideas through rigorous emergent evaluation.

> See [OVERVIEW.md](./OVERVIEW.md) for a detailed explanation of how ISEE works.

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

## Status

ISEE v2 is fully functional. Features include:

- Smart query refinement with follow-up questions
- Multi-model synthesis (6 models × 11 frameworks × dynamic domains)
- Emergent clustering by intellectual angle
- Advocate/Skeptic/Rebuttal tournament
- Plain-language briefings with action items
- Full analysis with debate transcripts

## Documentation

| Document | Purpose |
|----------|---------|
| [OVERVIEW.md](./OVERVIEW.md) | What ISEE is, how it works, what you get |
| [PRD.md](./PRD.md) | Product requirements, design principles, scope |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technical design, data contracts, project structure |
| [PROMPTS.md](./PROMPTS.md) | All pipeline prompts with design rationale |
| [CLAUDE.md](./CLAUDE.md) | Developer conventions for AI coding assistants |

## License

MIT
