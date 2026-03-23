# ISEE v2 — Product Requirements Document

**Idea Synthesis and Extraction Engine**  
**Version**: 2.0  
**Status**: Draft  
**Author**: Joseph Fajen  

---

## North Star

> *ISEE expands the possibility space through combinatorial synthesis, then extracts 3 breakthrough ideas through rigorous emergent evaluation. The user receives these ideas with full confidence in how they were found — and retains complete authority over what to do with them.*

ISEE is a thinking amplifier. It does the intellectual labor of generating and evaluating a vast matrix of perspectives so the user can focus entirely on applying the best ideas with their own judgment, creativity, and context.

---

## Problem Statement

### What ISEE v1 Got Right
- The combinatorial premise is valid and valuable: LLMs × Cognitive Frameworks × Knowledge Domains generates genuinely surprising and diverse responses that ordinary prompting cannot reach.
- The 66-response matrix does contain golden nuggets.
- The core name and concept — Idea **Synthesis** and **Extraction** — correctly names both phases.

### What ISEE v1 Got Wrong
- The **Extraction phase** put the burden back on the user. Scoring UIs, ranked file browsers, annotation systems, and "top 3" black-box outputs all required the user to do evaluation work ISEE should have done.
- The codebase grew to ~11,000 lines across 9 modules trying to solve this problem with UI complexity rather than pipeline intelligence.
- Confidence in the extracted ideas was low because the path from 66 responses to 3 results was opaque.

### The Core Design Failure
ISEE v1 solved the Synthesis phase well. It never truly solved the Extraction phase. Every attempt — scoring rubrics, ranked file prefixes, cognitive diversity explorers, annotation platforms — was a workaround for the absence of a genuine evaluation intelligence layer.

---

## Design Principles

1. **ISEE does the work.** The user enters a query and receives 3 extracted ideas. All intellectual labor between those two moments belongs to ISEE.

2. **Confidence through visible reasoning.** The user trusts the 3 ideas not because of a score, but because they can see that ideas competed, were challenged, and survived scrutiny.

3. **Present, don't prescribe.** The final output is a briefing, not a verdict. ISEE hands the user something valuable and explains why it's worth their attention. The user retains full authority over application.

4. **Simplicity is a feature.** The UI should be dramatically simpler than v1. If a feature adds complexity the user must manage, it belongs in the pipeline, not the interface.

5. **Emergent over structural.** Clustering and evaluation should discover the genuine shape of the idea space — not be constrained by the source dimensions (model, framework, domain) that generated it.

---

## Core Pipeline

```
[0] Prep Agent
    Generate 3-5 knowledge domains for this query
       ↓
[1] Synthesis Layer
    LLMs × Cognitive Frameworks × Knowledge Domains
    → Raw response matrix (~60 responses)
       ↓
[2] Emergent Clustering Agent
    Reads all responses without source metadata
    Groups by genuine intellectual angle (target: 5–7 clusters)
       ↓
[3] Tournament Layer
    ├── Advocate Agent (one per cluster)
    │   Argues why its cluster's angle is most valuable
    └── Skeptic Agent
        Challenges each advocate, stress-tests claims
       ↓
[4] Synthesis Agent
    Reads the full debate
    Selects 3 winning ideas with visible reasoning
       ↓
    Briefing Output
    3 extracted ideas + debate summary + confidence narrative
```

### Pipeline Stage Notes

**Stage 0 — Prep Agent**
Generates 3-5 knowledge domains dynamically per query. There is no fixed domain list.

**Stage 1 — Synthesis Layer**
Preserves the v1 matrix approach. Target: ~60 responses across a curated set of heterogeneous LLMs, 11 cognitive frameworks, and dynamically generated knowledge domains. OpenRouter as primary provider.

**Stage 2 — Emergent Clustering Agent**
Key design decision: the clustering agent receives response *content only*, not source metadata (which model, framework, or domain produced it). This ensures clusters represent genuine intellectual angles rather than reflecting the source dimensions. Target: 5–7 clusters. Variance across runs is acceptable and expected — any run should surface valuable ideas.

**Stage 3 — Tournament Layer**
The debate is the evaluation. Each cluster gets one Advocate agent that argues for the value of its angle. A single Skeptic agent challenges all advocates. This layer produces a structured debate transcript that becomes part of the final output.

**Stage 4 — Synthesis Agent**
Reads the full debate and selects 3 ideas. Selection criteria: most surprising, most actionable, most likely to challenge the user's existing assumptions. The synthesis agent must articulate *why* each idea won — this reasoning becomes the confidence narrative. The output is a single rendered briefing document containing:
- 3 extracted ideas, each presented as a standalone insight
- For each idea: the angle it emerged from, how it survived debate, why it was selected
- Optional expandable section: the full debate transcript for users who want to see the reasoning chain

---

## User Experience

### Primary Flow
1. User enters a query
2. User clicks Analyze
3. ISEE runs the full pipeline (estimated time: TBD based on implementation)
4. User receives the briefing document

### UI Surface Area
- Query input
- Single "Analyze" action
- Briefing output view
- Optional: "Show full debate" expandable section

### What the UI Does NOT Include
- Scoring sliders or rubrics
- Response browsers or file explorers
- Annotation or note-taking systems
- Model/framework/domain configuration (handled internally)
- Run history management (out of scope for v2)

---

## Technical Approach

### Stack
- **Language**: TypeScript + Bun (preferred) or Python — decision TBD
- **LLM Provider**: OpenRouter (single API key, 300+ models)
- **Agent Orchestration**: Claude SDK or Pydantic AI — decision TBD based on pipeline needs
- **Frontend**: Minimal. Single-page, possibly a simple React component or plain HTML
- **Storage**: Lightweight. JSON output files, no SQLite required for v2

### Agentic Coding Approach
This project will be built using the PRD-first, agentic coding methodology from the Dynamous curriculum. Key phases:
1. PRD (this document)
2. Architecture plan
3. Phased implementation with Claude Code

### Key Open Questions for Architecture Phase
- What is the right orchestration pattern for the Tournament layer? (Parallel advocates + single skeptic, or sequential debate rounds?)
- How many LLMs in the Synthesis layer for v2? (Fewer than v1's 15 is acceptable if quality is maintained)
- What triggers the Emergent Clustering agent to decide cluster count? (Fixed target, or self-determined?)
- Should the Briefing output be Markdown, HTML, or rendered in-app?

---

## Success Criteria

### Functional
- [ ] User enters a query and receives a briefing document with 3 extracted ideas
- [ ] Each idea includes a confidence narrative explaining how it was selected
- [ ] The full debate transcript is accessible but not primary
- [ ] Pipeline completes in under 10 minutes

### Qualitative
- [ ] A user reading the briefing understands why these 3 ideas were selected without needing to evaluate anything themselves
- [ ] The 3 ideas feel surprising and valuable — not obvious responses to the query
- [ ] The user feels respected as an intelligent person receiving research assistance, not prescribed answers

### Simplicity
- [ ] Core codebase significantly smaller than v1's ~11,000 lines
- [ ] No UI complexity that requires user management or configuration

---

## Out of Scope for v2

- Annotation, note-taking, or favorites systems
- Run history and comparison
- Performance analytics database
- Cost estimation UI
- Cognitive diversity explorer / response browser
- Multi-user or deployment infrastructure
- Docker/nixpacks deployment configuration

---

## Relationship to v1 Codebase

The v1 codebase (`ISEE_Meta_Framework`) is preserved as reference. Specific components worth studying before implementation:

- `instruction_templates.py` — cognitive framework prompt templates (reusable)
- `domain_manager.py` — dynamic knowledge domain generation logic (reusable concept)
- `evaluation_scoring.py` — documents what scoring approaches were tried and why they were insufficient
- `SCORING_SYSTEM_OVERHAUL.md` — useful post-mortem on v1 evaluation failures

The v2 build starts in a new repository.

---

*Last updated: March 2026*
