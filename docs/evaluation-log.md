# ISEE Evaluation Log

This document records what we learn from evaluating ISEE's output quality and defines the repeatable methodology for running evaluations. Ongoing improvement of output quality is the highest priority for this project.

---

## Part 1: Evaluation Methodology

### Purpose

ISEE's value comes from surfacing ideas that wouldn't emerge from a single direct query. Evaluation tests whether the pipeline actually delivers on that promise — whether the 3 extracted ideas are surprising, actionable, and assumption-challenging, and whether the user's original intent survives intact through all 6 pipeline stages.

### Selecting Evaluation Queries

**Use queries that stress-test signal preservation:**

1. **Planted hypotheses** — Queries that embed an explicit third option or unusual framing, e.g., "Is the real answer neither A nor B, but C?" These test whether the pipeline preserves deliberate rhetorical structure or flattens it into a generic restatement.

2. **Assumption-laden framing** — Queries that contain implicit beliefs the user wants challenged, e.g., "How might we improve X while preserving Y?" The tension between X and Y is the signal; if the pipeline drops "while preserving Y," the ideas won't address the real constraint.

3. **Domain-crossing questions** — Queries that span multiple fields test whether the domain generation (Stage 0) and clustering (Stage 2) actually produce diverse angles rather than collapsing into a single frame.

4. **Ambiguous intent** — Queries where reasonable people might interpret the goal differently. These test whether the refinement stage (when triggered) adds helpful context without overriding the original.

**Avoid:**
- Simple factual questions (ISEE isn't designed for lookup)
- Queries so broad they lack evaluable criteria ("What should I do with my life?")

### What to Look For in Briefing Outputs

When reading a completed briefing, evaluate across four dimensions:

| Dimension | What to check | Red flags |
|-----------|--------------|-----------|
| **Signal fidelity** | Does `queryPlainLanguage` preserve the original query's rhetorical structure? Do the ideas address what the user actually asked? | Generic restatement, dropped constraints, flattened third-option hypotheses |
| **Dialectical quality** | Do the debate entries show genuine tension? Did the Skeptic find real weaknesses? Did rebuttals engage substantively? | Rubber-stamp challenges, rebuttals that ignore the critique, advocates all agreeing |
| **Synthesis integrity** | Do the 3 extracted ideas reflect the debate, or could they have come from a single direct query? | Ideas that don't trace to specific clusters, generic advice disconnected from debate |
| **Novelty** | Would these ideas surprise the user? Do they challenge assumptions embedded in the query? | Obvious suggestions, ideas the user likely already considered |

### From Observation to Diagnostic Hypothesis

When output quality falls short:

1. **Isolate the symptom** — Which dimension failed? Be specific: "The third-option hypothesis I planted was missing from `queryPlainLanguage`" not "the output felt generic."

2. **Trace the data flow** — Follow the query through pipeline stages. Where does the signal degrade? Read the intermediate artifacts (domains, clusters, debate entries) to pinpoint the stage.

3. **Distinguish agent failure from prompt failure** — Is the LLM ignoring clear instructions, or are the instructions ambiguous/missing? Read the actual prompt the agent received.

4. **Form a testable hypothesis** — "The Translation agent is paraphrasing because the prompt says 'restate conversationally' without emphasizing fidelity" is testable. "Something is wrong with translation" is not.

### Confirming a Fix Empirically

Before committing a fix:

1. **Re-run the failing query** — The exact query that exposed the problem, not a similar one.

2. **Check the specific field** — If the bug was in `queryPlainLanguage`, read that field in the new output. Don't just skim the briefing.

3. **Run at least one additional query** — Confirm the fix doesn't break other cases. Ideally use a query that exercises the same code path differently (e.g., a query that doesn't trigger refinement if the original did).

4. **Add a regression test** — If the fix is to prompt language, add a test that checks for the key phrases. If the fix is to data flow, add a unit test for the function.

---

## Part 2: Evaluation Log

### 2026-03-28: Signal Loss in Query Preservation

**Queries evaluated:**

1. > "How might we improve decision-making in complex organizations while preserving individual autonomy?"

2. > "What approaches help distributed teams maintain serendipitous collaboration and spontaneous innovation when they can't rely on physical proximity — or is the real answer that they shouldn't try to replicate in-office dynamics at all, but instead lean into the unique strengths of asynchronous, written-first cultures?"

**Observed behavior:**

Query 2 contained a deliberately planted third-option hypothesis ("or is the real answer..."). When reviewing the briefing output, the `queryPlainLanguage` field had flattened this into a generic two-sided question, losing the third option entirely. The user's deliberate framing — suggesting that the dichotomy itself might be wrong — was erased before the ideas were presented.

**Diagnostic finding:**

Two distinct issues identified:

1. **Translation prompt fidelity gap** — The `buildTranslationPrompt` instruction for `queryPlainLanguage` said "restate it conversationally" without emphasizing that planted hypotheses, explicit third options, and unusual framings must be preserved. The agent was optimizing for simplicity over fidelity.

2. **Synthesis prompt mislabeling** — The synthesis prompt labeled a field as "ORIGINAL QUERY" when it was actually receiving the (potentially refined) query. This didn't cause the observed symptom but would have caused confusion if refinement had triggered.

A deeper investigation revealed that the entire pipeline was vulnerable: if refinement triggered, agents only saw the refined query — the original was not passed through. The refined query should be *additive context*, not a replacement.

**What changed:**

PR #42 merged with 4 commits:

| Commit | Change |
|--------|--------|
| `c37bcd7` | Fixed synthesis prompt mislabeling ("ORIGINAL QUERY" → "QUERY") |
| `721a06a` | Rewrote `queryPlainLanguage` instruction to prioritize fidelity over simplification, with explicit guidance to preserve embedded hypotheses |
| `41992be` | Dual-query refactor: all 6 agent prompts now receive both `originalQuery` (authoritative) and `refinedQuery` (additive context) |
| `66a60e5` | Fixed TypeScript errors in test scripts, moved `QueryContext` to `types.ts`, added 10 new tests |

**Validation:**

- Re-ran Query 2 after the translation fix — the planted third-option hypothesis appeared in `queryPlainLanguage`
- 223 tests passing, including 10 new tests covering `buildQueryContext`, prompt builder authority labels, and translation fidelity

**What remains open:**

| Issue | Description |
|-------|-------------|
| #43 | Add synthesizer unit test verifying `briefing.query` uses `originalQuery` |
| #44 | Investigate `RefinementMetadata.refinedQuery` redundancy with `PipelineConfig.query` |
| #45 | Add prompt builder tests for remaining 5 builders (advocate, clustering, skeptic, rebuttal, synthesis) |
| #46 | Add `@param queryContext` JSDoc to Anthropic client functions |

**What to watch in the next evaluation:**

1. **Refinement-triggered queries** — Today's test queries didn't trigger refinement (both were deemed "sufficient" by the refinement agent). The dual-query architecture is in place but hasn't been validated end-to-end with a query that actually triggers refinement. Find or craft a deliberately underspecified query and confirm both queries flow through correctly.

2. **Translation agent extra ideas** — The translation agent returned 6 ideas instead of 3 on one run (truncated by the schema fix from an earlier session). Watch whether this recurs; may indicate the prompt's "exactly 3" instruction isn't strong enough.

3. **Clustering agent index drift** — Clustering agent occasionally produces invalid indices (referencing responses that don't exist). This was logged as a warning but didn't block the pipeline. If it recurs, investigate whether the response count is being communicated clearly in the clustering prompt.

---

### 2026-03-28 (Evening): Translation Fix Confirmed, Annotation Authority Risk Identified

**Queries evaluated:**

1. > "I'm a technical writer designing a personal productivity system built on AI agents. The hard problem isn't capability — it's boundary design. I don't want an agent that does 'everything I ask' because that's actually the failure mode: I'll accidentally delegate the parts of my work that give me meaning. How do I design agent boundaries that preserve the parts worth keeping? Is this even a technical design question, or is it more like deciding what kind of worker I want to be? Maybe the framing is wrong — instead of a hard boundary, maybe I need a 'dimmer switch' that lets me modulate involvement without having to consciously decide what's meaningful in advance. How would experienced workflow designers think about this?"

2. > "I just committed a fix to an LLM pipeline architecture issue. The bug was: when a query gets refined through follow-up questions, downstream agents only saw the refined query — the original was lost. My fix preserves the original query as authoritative and treats refined context as additive. But now I'm second-guessing the design principle itself. Is 'original query is always authoritative' actually the right heuristic? What if the user's original framing was wrong, and the refinement process revealed what they actually needed? By privileging the original, am I cementing a bad frame? Or is preserving the original the only way to maintain user intent as ground truth? I want this pipeline to genuinely challenge my thinking — so tell me: is your fix actually the right design principle, or does it create new problems you haven't seen yet?"

**Translation fix confirmation:**

Both runs confirmed the PR #42 translation fix is working in production:

- **Query 1** preserved the core anxiety framing: "without accidentally automating the parts that make my work worth doing" survived into `queryPlainLanguage`
- **Query 2** preserved the explicit self-challenge: "is your fix actually the right design principle, or does it create new problems you haven't seen yet" survived into `queryPlainLanguage`

Planted framings survived in both cases. The fidelity instruction in `buildTranslationPrompt` is doing its job.

**Output quality observations:**

**Briefing 2 was the stronger output.** The Advocate/Skeptic dialectic on "users discover intent through interaction, not before it" produced a genuine philosophical insight: the user only discovered their intent was pre-formed because the system broke it. The Skeptic's challenge was sharp, and the rebuttal improved on it rather than deflecting.

The **annotation authority drift risk** emerged from Briefing 2's full analysis — an architectural risk in the current pipeline that wasn't visible before this evaluation session. This has been captured as GitHub issue #47.

**Briefing 1 Idea 2** ("Would I publish this unchanged?") is immediately actionable as a decision rule and represents the kind of non-obvious practical insight ISEE is designed to produce.

**Cluster count as quality signal:**

| Briefing | Cluster count | Approximate runtime |
|----------|---------------|---------------------|
| Briefing 1 | 6 clusters | baseline |
| Briefing 2 | 9 clusters | ~40 seconds longer |

The query with a specific technical premise and embedded self-challenge generated more interpretive divergence. Track cluster count as a leading indicator of output richness going forward.

**What remains open:**

| Item | Status |
|------|--------|
| Annotation authority drift | GitHub issue #47 created and detailed |
| Issues #43–46 from PR #42 | Still in backlog |
| Cluster count → quality correlation | No regression test confirming this holds across multiple runs |

**What to watch in the next evaluation:**

1. **Cluster count as quality predictor** — Does higher cluster count reliably predict better idea quality, or was this session an outlier?
2. **Annotation authority drift** — Does the risk identified in issue #47 manifest in longer queries with more complex refinement context?
3. **Refinement-triggered queries** — Still haven't validated dual-query architecture with a query that actually triggers refinement (both queries in this session were deemed "sufficient").

---

## Appendix: Files Relevant to Evaluation

| File | Purpose |
|------|---------|
| `src/config/prompts/translation.ts` | Translation agent prompt — controls `queryPlainLanguage` fidelity |
| `src/config/prompts/*.ts` | All agent prompts — each should show dual-query structure |
| `src/pipeline.ts` | `buildQueryContext` helper — constructs query context from config |
| `src/types.ts` | `QueryContext` interface — defines original/refined query contract |
| `output/isee-briefing-*.md` | Briefing outputs — primary artifacts for evaluation |
| `notes/isee-evaluation-framework.md` | Extended notes on evaluation approaches (gitignored) |
