# Feature: Phase 4 - Synthesis Agent and Briefing Generation

The following plan should be complete, but validate documentation and codebase patterns before implementing.

Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

Implement Stage 4 (Synthesis Agent) of the ISEE v2 pipeline with real LLM calls:
- **Stage 4 (Synthesis Agent)**: Read the full debate transcript, select 3 ideas using explicit criteria (most surprising, most actionable, most assumption-challenging), and generate confidence narratives explaining each selection

This replaces the current stub implementation that returns mock `ExtractedIdea[]` data with a production-ready Synthesis Agent following the established patterns from Phases 2 and 3.

## User Story

As a user submitting a research question
I want ISEE to select the 3 most valuable ideas from the tournament debate and explain why each was chosen
So that I receive a briefing document with high-confidence recommendations and visible reasoning

## Problem Statement

The current pipeline has a stub implementation for the Synthesis Agent that returns hardcoded mock ideas. Users cannot receive briefings based on actual LLM-driven evaluation of the debate transcript. The final stage of the pipeline—the one that produces user-facing output—is non-functional.

## Solution Statement

Add a new function `generateBriefingWithClaude()` to the Anthropic client that uses structured output with Zod to guarantee valid `ExtractedIdea[]` responses. Design a Synthesis Agent prompt that evaluates debate entries against three explicit criteria and selects one idea per criterion (ensuring diversity). Replace the stub in `synthesizer.ts` with a real implementation that calls this function. The `renderBriefingMarkdown()` function is already implemented and will be kept as-is.

## Feature Metadata

**Feature Type**: New Capability (replacing stub with real implementation)
**Estimated Complexity**: Medium
**Primary Systems Affected**: `src/clients/anthropic.ts`, `src/pipeline/synthesizer.ts`, `src/utils/logger.ts`
**Dependencies**: None new (uses existing `@anthropic-ai/sdk`, `zod`)

---

## CONTEXT REFERENCES

### Relevant Codebase Files - IMPORTANT: READ THESE FILES BEFORE IMPLEMENTING!

**Type Definitions:**
- `src/types.ts` (lines 131-140) - `ExtractedIdea` interface: title, description, whyEmerged, whyItMatters
- `src/types.ts` (lines 145-158) - `Briefing` interface: query, timestamp, ideas[], debateTranscript[], domains, stats
- `src/types.ts` (lines 116-122) - `DebateEntry` interface: clusterId, clusterName, advocateArgument, skepticChallenge, rebuttal
- `src/types.ts` (lines 167-184) - `RunStats` interface for pipeline statistics

**Existing Implementations to Mirror:**
- `src/clients/anthropic.ts` (lines 41-61) - Zod schema definition pattern (ClusterSchema, ClusteringResponseSchema)
- `src/clients/anthropic.ts` (lines 153-213) - `clusterResponsesWithClaude()` - structured output pattern with retry
- `src/clients/anthropic.ts` (lines 218-263) - `buildClusteringPrompt()` - prompt builder function pattern
- `src/clients/anthropic.ts` (line 65) - `AGENT_MODEL = 'claude-sonnet-4-5'` constant

**Pipeline Module (stub to replace):**
- `src/pipeline/synthesizer.ts` (lines 31-96) - `generateBriefing()` stub returning mock ideas
- `src/pipeline/synthesizer.ts` (lines 101-159) - `renderBriefingMarkdown()` - KEEP THIS, already implemented

**Logging:**
- `src/utils/logger.ts` (line 36) - `LLMCallContext.stage` union type needs `'synthesizer'` added

**Design Intent (from PROMPTS.md lines 244-259):**
- Read full debate transcript across all clusters
- Select 3 ideas using: most surprising, most actionable, most assumption-challenging
- Write briefing with confidence narratives
- Tone: research briefing, presenting not prescribing

### New Files to Create

None - all changes are updates to existing files.

### Relevant Documentation - READ THESE BEFORE IMPLEMENTING!

- [Anthropic Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
  - Section: TypeScript with Zod integration
  - Why: Shows `messages.parse()` and `zodOutputFormat()` usage for guaranteed JSON schema compliance

- [Claude 4 Prompting Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices)
  - Section: Multi-criteria evaluation, output formatting
  - Why: Best practices for selection tasks and tone calibration

### Patterns to Follow

**Zod Schema Definition (from anthropic.ts:41-61):**
```typescript
const ClusterSchema = z.object({
  id: z.number(),
  name: z.string(),
  summary: z.string(),
  memberIndices: z.array(z.number()),
});

const ClusteringResponseSchema = z.object({
  clusters: z.array(ClusterSchema),
});
```

**Structured Output Call (from anthropic.ts:172-177):**
```typescript
const response = await getClient().messages.parse({
  model: AGENT_MODEL,
  max_tokens: 4096,
  messages: [{ role: 'user', content: prompt }],
  output_config: { format: zodOutputFormat(ResponseSchema) },
});

if (!response.parsed_output) {
  throw new Error('Agent returned no structured output');
}

const result = response.parsed_output;
```

**Retry Loop (from anthropic.ts:161-212):**
```typescript
const maxAttempts = 2;
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  const callContext = { stage: 'synthesizer' as const, model: AGENT_MODEL, attempt };
  logLLMCallStart(logger, callContext);
  const startTime = Date.now();

  try {
    // ... make call
    logLLMCallSuccess(logger, callContext, durationMs, responseLength);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const willRetry = attempt < maxAttempts;
    logLLMCallError(logger, callContext, errorMessage, willRetry);

    if (!willRetry) {
      throw new Error(`Synthesis Agent failed after ${maxAttempts} attempts: ${errorMessage}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
```

**Prompt Builder Pattern (from anthropic.ts:218-263):**
```typescript
function buildSynthesisPrompt(
  query: string,
  debateEntries: DebateEntry[]
): string {
  const debateText = debateEntries
    .map((entry) => `<cluster id="${entry.clusterId}" name="${entry.clusterName}">
<advocate>${entry.advocateArgument}</advocate>
<skeptic>${entry.skepticChallenge}</skeptic>
<rebuttal>${entry.rebuttal}</rebuttal>
</cluster>`)
    .join('\n\n');

  return `You are a research synthesis agent...

<query>${query}</query>

<debate_transcript>
${debateText}
</debate_transcript>

YOUR TASK: ...`;
}
```

**Console Logging Prefix:**
```typescript
console.log('[synthesizer] Generating briefing from debate transcript...');
```

---

## IMPLEMENTATION PLAN

### Phase 1: Logger Extension

Extend the logger to support the synthesizer stage.

**Tasks:**
- Update `LLMCallContext.stage` union type to include `'synthesizer'`

### Phase 2: Anthropic Client Extension

Add the Synthesis Agent function to the Anthropic client.

**Tasks:**
- Add Zod schemas for `ExtractedIdea` and `BriefingResponse`
- Implement `generateBriefingWithClaude()` (structured output)
- Implement `buildSynthesisPrompt()` prompt builder

### Phase 3: Synthesizer Implementation

Replace the stub with real implementation.

**Tasks:**
- Update `generateBriefing()` to use the new Anthropic function
- Pass logger through for structured logging
- Keep `renderBriefingMarkdown()` unchanged

### Phase 4: Testing & Validation

Verify the implementation works end-to-end.

**Tasks:**
- Create test script for Phase 4
- Run full pipeline test
- Verify briefing output quality

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

---

### Task 1: UPDATE src/utils/logger.ts - Extend LLMCallContext

- **IMPLEMENT**: Add `'synthesizer'` to the `LLMCallContext.stage` union type
- **PATTERN**: Follow existing union type style (line 36)
- **IMPORTS**: None needed
- **GOTCHA**: Must be a union of string literals, not a general string type
- **VALIDATE**: `bun run typecheck`

**Change this (line 36):**
```typescript
stage: 'prep' | 'synthesis' | 'clustering' | 'advocate' | 'skeptic' | 'rebuttal';
```

**To this:**
```typescript
stage: 'prep' | 'synthesis' | 'clustering' | 'advocate' | 'skeptic' | 'rebuttal' | 'synthesizer';
```

---

### Task 2: UPDATE src/clients/anthropic.ts - Add Zod Schemas for Synthesis Agent

- **IMPLEMENT**: Add Zod schemas for `ExtractedIdea` and `BriefingResponse` structured outputs
- **PATTERN**: Mirror `ClusterSchema` and `ClusteringResponseSchema` (lines 41-50)
- **IMPORTS**: None needed (z already imported)
- **GOTCHA**: Schema field names must match `ExtractedIdea` interface exactly (camelCase)
- **VALIDATE**: `bun run typecheck`

**Add after SkepticChallengesResponseSchema (around line 61):**
```typescript
// Synthesis Agent schemas
const ExtractedIdeaSchema = z.object({
  title: z.string(),
  description: z.string(),
  whyEmerged: z.string(),
  whyItMatters: z.string(),
});

const BriefingResponseSchema = z.object({
  ideas: z.array(ExtractedIdeaSchema),
});
```

---

### Task 3: UPDATE src/clients/anthropic.ts - Add generateBriefingWithClaude()

- **IMPLEMENT**: Function that takes query and debate entries, returns `ExtractedIdea[]` via structured output
- **PATTERN**: Mirror `clusterResponsesWithClaude()` structure (lines 153-213)
- **IMPORTS**: Add `ExtractedIdea, DebateEntry` to imports from `../types`
- **GOTCHA**: Use max_tokens of 4096 - each idea needs ~200 words for narratives
- **VALIDATE**: `bun run typecheck`

**Add after generateRebuttal function (around line 554):**
```typescript
/**
 * Generate the final briefing by selecting 3 ideas from the debate (structured output).
 */
export async function generateBriefingWithClaude(
  query: string,
  debateEntries: DebateEntry[],
  logger: Logger
): Promise<ExtractedIdea[]> {
  const maxAttempts = 2;
  const prompt = buildSynthesisPrompt(query, debateEntries);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const callContext = {
      stage: 'synthesizer' as const,
      model: AGENT_MODEL,
      attempt,
    };

    logLLMCallStart(logger, callContext);
    const startTime = Date.now();

    try {
      const response = await getClient().messages.parse({
        model: AGENT_MODEL,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
        output_config: { format: zodOutputFormat(BriefingResponseSchema) },
      });

      const durationMs = Date.now() - startTime;

      if (!response.parsed_output) {
        throw new Error('Synthesis Agent returned no structured output');
      }

      const ideas = response.parsed_output.ideas;

      // Validate we got exactly 3 ideas
      if (ideas.length !== 3) {
        logger.warn(
          { ideaCount: ideas.length, expected: 3 },
          'Unexpected idea count from Synthesis Agent'
        );
      }

      logLLMCallSuccess(logger, callContext, durationMs, JSON.stringify(ideas).length);

      return ideas;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const willRetry = attempt < maxAttempts;

      logLLMCallError(logger, callContext, errorMessage, willRetry);

      if (!willRetry) {
        throw new Error(`Synthesis Agent failed after ${maxAttempts} attempts: ${errorMessage}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Unexpected: retry loop completed without result');
}
```

**Also add to type imports at top of file:**
```typescript
import type { Domain, Cluster, SkepticChallenge, ExtractedIdea, DebateEntry } from '../types';
```

---

### Task 4: UPDATE src/clients/anthropic.ts - Add buildSynthesisPrompt()

- **IMPLEMENT**: Prompt builder function for the Synthesis Agent
- **PATTERN**: Mirror `buildClusteringPrompt()` structure (lines 218-263)
- **IMPORTS**: None needed
- **GOTCHA**: Use XML tags for debate entries; emphasize "presenting not prescribing" tone
- **VALIDATE**: `bun run typecheck`

**Add after generateBriefingWithClaude:**
```typescript
/**
 * Build the Synthesis Agent prompt.
 *
 * Design intent (from PROMPTS.md):
 * - Read full debate transcript
 * - Select 3 ideas using: most surprising, most actionable, most assumption-challenging
 * - Write confidence narratives
 * - Tone: research briefing, presenting not prescribing
 */
function buildSynthesisPrompt(query: string, debateEntries: DebateEntry[]): string {
  const debateText = debateEntries
    .map(
      (entry) => `<cluster id="${entry.clusterId}" name="${entry.clusterName}">
<advocate_argument>
${entry.advocateArgument}
</advocate_argument>
<skeptic_challenge>
${entry.skepticChallenge}
</skeptic_challenge>
<rebuttal>
${entry.rebuttal}
</rebuttal>
</cluster>`
    )
    .join('\n\n');

  return `You are a research synthesis agent. You have observed a structured debate among multiple intellectual angles responding to a user's query. Your task is to select the 3 most valuable ideas and explain why each deserves the user's attention.

ORIGINAL QUERY:
${query}

DEBATE TRANSCRIPT:
The following clusters each represent a distinct intellectual angle. For each, an Advocate argued for the angle's value, a Skeptic challenged that argument, and the Advocate provided a Rebuttal.

${debateText}

YOUR TASK:
Select exactly 3 ideas from the debate using these criteria. Choose ONE idea that best exemplifies each criterion:

1. MOST SURPRISING
   - Which idea is least likely to emerge from a single direct query to one AI model?
   - What does ISEE's combinatorial approach surface that conventional prompting would miss?

2. MOST ACTIONABLE
   - Which idea points toward something concrete the user can actually do, think, or decide differently?
   - Avoid ideas that are merely interesting but offer no clear path forward.

3. MOST ASSUMPTION-CHALLENGING
   - Which idea most directly challenges a belief or assumption the user probably holds?
   - Look for ideas that reframe the problem or invert conventional wisdom.

FOR EACH SELECTED IDEA, provide:
- title: A concise title (5-10 words) that captures the core insight
- description: 2-3 sentences explaining the idea itself
- whyEmerged: 2-3 sentences explaining which angle produced this idea and how it survived the debate (reference the advocate/skeptic/rebuttal exchange)
- whyItMatters: 2-3 sentences explaining why this idea deserves the user's attention - be specific, not generic. This is the confidence narrative.

IMPORTANT CONSTRAINTS:
- Select exactly 3 ideas, one for each criterion above
- Each idea must come from a different cluster (no repeating clusters)
- Your tone should be that of a research briefing: present findings and explain reasoning, but do NOT prescribe what the user should do
- The user retains full authority over how to apply these insights
- Avoid vague praise ("transformative", "paradigm-shifting") - be concrete and specific
- If an idea conceded points during the rebuttal, acknowledge this honestly

Respond with your selected ideas.`;
}
```

---

### Task 5: UPDATE src/pipeline/synthesizer.ts - Replace stub with real implementation

- **IMPLEMENT**: Wire up `generateBriefing()` to use the new Anthropic client function
- **PATTERN**: Follow Phase 3 pattern of passing logger, handling errors
- **IMPORTS**: Add import for `generateBriefingWithClaude` from anthropic client, add logger imports
- **GOTCHA**: Keep `renderBriefingMarkdown()` unchanged - it's already working
- **VALIDATE**: `bun run typecheck`

**Replace the generateBriefing function (lines 31-96) with:**
```typescript
import { generateBriefingWithClaude } from '../clients/anthropic';
import { logger as baseLogger, type Logger } from '../utils/logger';

interface SynthesizerConfig {
  query: string;
  domains: Domain[];
  debateEntries: DebateEntry[];
  stats: Partial<RunStats>;
  runLogger?: Logger;
}

/**
 * Generate the final briefing from the debate transcript.
 *
 * @param config - Query, debate entries, and run statistics
 * @returns Complete briefing document
 */
export async function generateBriefing(config: SynthesizerConfig): Promise<Briefing> {
  const { query, domains, debateEntries, stats, runLogger } = config;
  const log = runLogger || baseLogger;

  log.info({ debateEntryCount: debateEntries.length }, 'Synthesis agent starting');

  // Call the LLM to select and explain 3 ideas
  const ideas = await generateBriefingWithClaude(query, debateEntries, log);

  log.info(
    {
      ideaCount: ideas.length,
      ideaTitles: ideas.map((i) => i.title),
    },
    'Synthesis agent complete'
  );

  const briefing: Briefing = {
    query,
    timestamp: new Date().toISOString(),
    ideas,
    debateTranscript: debateEntries,
    domains,
    stats: {
      synthesisCallCount: stats.synthesisCallCount || 0,
      successfulCalls: stats.successfulCalls || 0,
      clusterCount: debateEntries.length,
      totalDurationMs: stats.totalDurationMs || 0,
      stageDurations: stats.stageDurations || {
        prep: 0,
        synthesis: 0,
        clustering: 0,
        tournament: 0,
        synthesizer: 0,
      },
    },
  };

  return briefing;
}
```

**Also update the imports at the top of the file to include:**
```typescript
import type { Domain, DebateEntry, ExtractedIdea, Briefing, RunStats } from '../types';
import { generateBriefingWithClaude } from '../clients/anthropic';
import { logger as baseLogger, type Logger } from '../utils/logger';
```

**Remove these lines (the old mock ideas and console.log statements):**
- Remove `console.log('[synthesizer] Generating briefing...')` statements
- Remove the `mockIdeas` array
- Remove the TODO comment

---

### Task 6: UPDATE src/pipeline.ts - Pass logger to synthesizer

- **IMPLEMENT**: Pass runLogger to generateBriefing function call
- **PATTERN**: Same pattern used for clustering and tournament stages
- **IMPORTS**: None needed (already imported)
- **GOTCHA**: Must update the function call to include runLogger in config
- **VALIDATE**: `bun run typecheck`

**Update the generateBriefing call (around line 133) from:**
```typescript
const briefing = await generateBriefing({
  query,
  domains,
  debateEntries,
  stats: partialStats,
});
```

**To:**
```typescript
const briefing = await generateBriefing({
  query,
  domains,
  debateEntries,
  stats: partialStats,
  runLogger,
});
```

---

### Task 7: CREATE test script for Phase 4

- **IMPLEMENT**: Test script that runs the synthesizer with mock debate data
- **PATTERN**: Similar to test-clustering-tournament.ts from Phase 3
- **PURPOSE**: Verify implementation before full pipeline runs
- **VALIDATE**: Manual run with `bun run src/test-synthesizer.ts`

**Create new file src/test-synthesizer.ts:**
```typescript
/**
 * Test script for Phase 4 implementation.
 * Tests the Synthesis Agent with mock debate data.
 */

import { generateBriefing, renderBriefingMarkdown } from './pipeline/synthesizer';
import { createRunLogger } from './utils/logger';
import type { DebateEntry, Domain } from './types';

// Mock debate entries (simulating tournament output)
const mockDebateEntries: DebateEntry[] = [
  {
    clusterId: 1,
    clusterName: 'Automate the human decision layer out of existence',
    advocateArgument:
      'This angle argues that rather than improving human decision-making processes, we should encode decisions directly into protocol rules that execute automatically. The value lies not in making humans better at deciding, but in removing the human bottleneck entirely. This is surprising because it inverts the typical "improve the human" framing. The combinatorial synthesis surfaced this by having contrarian and systems thinking frameworks converge independently on automation-first approaches. For someone asking about organizational decision-making, this offers a concrete reframe: instead of training people to decide better, identify which decisions can be eliminated entirely through protocol design.',
    skepticChallenge:
      'This argument conflates two different claims: that automation is valuable (uncontroversial) and that it should replace human judgment entirely (controversial). The advocate has not demonstrated that the "bottleneck" is humans per se, rather than poor system design that could be improved while retaining human judgment. A single well-crafted prompt about automation could surface this angle.',
    rebuttal:
      'The skeptic correctly identifies that I conflated automation value with total human replacement. Let me sharpen: the distinctive claim is not "automate everything" but rather "the framing of improvement is wrong." Most approaches ask "how do we help humans decide better?" This angle asks "which decisions should humans not be making at all?" The value is in the question itself, not a blanket automation prescription. This reframe would not naturally emerge from a direct query about organizational improvement.',
  },
  {
    clusterId: 2,
    clusterName: 'The problem is in the incentive structure, not the process',
    advocateArgument:
      'This angle claims that process improvements fail because they do not address underlying incentive misalignments. The insight is that organizational dysfunction is a symptom of rational actors responding to poorly designed incentives, not a cause to be fixed through training or procedures. This emerged from behavioral economics and game theory domains converging on incentive analysis. The actionable value: before redesigning any process, first map what people are actually incentivized to do versus what the process assumes they want to do.',
    skepticChallenge:
      'The claim that "incentives matter more than process" is well-established in organizational theory. This is not a novel insight from combinatorial synthesis—it is conventional wisdom. The advocate has not shown what ISEE adds beyond what any MBA textbook contains.',
    rebuttal:
      'I concede that incentive analysis is not novel in isolation. However, the value is not the concept but the specific diagnostic application: the angle suggests a concrete first step (map actual vs assumed incentives) before any process change. This operational specificity—treat incentive mapping as a prerequisite, not an afterthought—is what distinguishes it from generic "incentives matter" advice. The synthesis surfaced this as a blocking dependency, not just a consideration.',
  },
  {
    clusterId: 3,
    clusterName: 'Embrace inherent complexity rather than seeking simplistic solutions',
    advocateArgument:
      'Historical analysis shows that complex organizational challenges are rarely "solved" in the traditional sense. The most successful organizations accept inherent complexity and develop adaptive management approaches rather than seeking silver-bullet solutions. This challenges the assumption embedded in the original query that decision-making can be "improved" in some definitive way. The real improvement may be accepting that improvement is continuous adaptation, not a destination.',
    skepticChallenge:
      'This argument risks being a sophisticated way of saying "do nothing differently." If the advice is "accept complexity," what concrete action follows? The angle may challenge an assumption, but it does not offer actionable value to someone trying to actually improve their organization.',
    rebuttal:
      'The skeptic identifies a real weakness: acceptance without action is not valuable. Let me refine the actionable core: the insight is that framing organizational challenges as problems to solve sets up for failure, while framing them as conditions to manage enables sustained progress. The action is to shift success metrics from "problem solved" to "adaptive capacity improved." This changes how you measure, fund, and sustain improvement efforts.',
  },
  {
    clusterId: 4,
    clusterName: 'Small-scale experimentation consistently outperforms top-down design',
    advocateArgument:
      'Rather than designing comprehensive solutions, run many small experiments in parallel. The failures reveal constraints that planning cannot anticipate, and successes can be scaled. This emerged from multiple frameworks independently recommending experimental approaches over planning. The value is methodological: it de-risks improvement efforts and generates learning that planning-based approaches miss.',
    skepticChallenge:
      'Experimentation as a methodology is well-known (lean startup, agile, etc.). What is the specific insight beyond "try small things first"? The advocate needs to show what ISEE adds to standard experimental methodology advice.',
    rebuttal:
      'Fair challenge. The specific insight is the framing of failures as primary value, not unfortunate outcomes. Most experimental approaches still optimize for success. This angle suggests deliberately designing experiments expected to fail in order to map constraint boundaries. The methodological shift is from "test to validate" to "test to discover constraints." This is subtle but meaningfully different from standard lean methodology.',
  },
  {
    clusterId: 5,
    clusterName: 'Question whether the organizational structure itself is necessary',
    advocateArgument:
      'Instead of asking how to improve decision-making within existing structures, ask whether those structures need to exist at all. Many organizational layers exist due to historical accident rather than necessity. The most challenging assumption is that current organizational forms are given rather than contingent. This emerged from first-principles and contrarian frameworks converging on structural questioning.',
    skepticChallenge:
      'This is abstractly provocative but practically unhelpful. Few people asking about organizational improvement have the authority or appetite to eliminate organizational structures entirely. The angle challenges assumptions the user cannot act on.',
    rebuttal:
      'I partially concede: wholesale structural elimination is unrealistic for most users. However, the actionable kernel is smaller-scale: for any given decision process being improved, ask whether the decision itself is necessary or whether it exists because of a structure that no longer serves its original purpose. This is not about eliminating the org chart but about questioning individual decision points.',
  },
];

const mockDomains: Domain[] = [
  { name: 'Behavioral Economics', description: 'Study of psychological factors in decision-making', focus: 'Incentive structures and cognitive biases' },
  { name: 'Systems Theory', description: 'Analysis of complex interconnected systems', focus: 'Feedback loops and emergent behavior' },
  { name: 'Organizational Psychology', description: 'Human behavior in organizational contexts', focus: 'Group dynamics and culture' },
];

async function testPhase4() {
  const query = 'How might we improve decision-making in complex organizations?';
  const runLogger = createRunLogger('test-phase4');

  console.log('='.repeat(60));
  console.log('ISEE v2 - Phase 4 Test (Synthesis Agent)');
  console.log('='.repeat(60));
  console.log(`Query: ${query}`);
  console.log(`Debate entries: ${mockDebateEntries.length}`);
  console.log('');

  // Test Synthesis Agent
  console.log('Testing Synthesis Agent...');
  const briefing = await generateBriefing({
    query,
    domains: mockDomains,
    debateEntries: mockDebateEntries,
    stats: {
      synthesisCallCount: 66,
      successfulCalls: 64,
      stageDurations: {
        prep: 2000,
        synthesis: 45000,
        clustering: 5000,
        tournament: 15000,
        synthesizer: 0,
      },
    },
    runLogger,
  });

  console.log(`Generated ${briefing.ideas.length} ideas:`);
  briefing.ideas.forEach((idea, i) => {
    console.log('');
    console.log(`--- Idea ${i + 1}: ${idea.title} ---`);
    console.log(`Description: ${idea.description}`);
    console.log(`Why Emerged: ${idea.whyEmerged.substring(0, 150)}...`);
    console.log(`Why It Matters: ${idea.whyItMatters.substring(0, 150)}...`);
  });

  // Render markdown
  console.log('');
  console.log('='.repeat(60));
  console.log('RENDERED MARKDOWN OUTPUT:');
  console.log('='.repeat(60));
  console.log('');
  const markdown = renderBriefingMarkdown(briefing);
  console.log(markdown);

  console.log('');
  console.log('='.repeat(60));
  console.log('Phase 4 test complete!');
}

testPhase4().catch(console.error);
```

---

## TESTING STRATEGY

### Unit Tests

Focus on validation logic that can be tested without API calls:

- `renderBriefingMarkdown()` produces valid markdown structure
- Briefing object contains all required fields
- Ideas array has correct structure

### Integration Tests

- **Synthesis Agent**: Run with mock debate entries, verify 3 ideas returned with correct structure
- **Full Pipeline**: Run end-to-end with real API calls (manual test)

### Edge Cases

- Empty debate entries array → Graceful error
- Synthesis Agent returns wrong number of ideas → Warning logged, continue
- Very long debate entries → Should still work within context window
- API failure → Retry once, then fail with clear message

---

## VALIDATION COMMANDS

Execute every command to ensure zero regressions and 100% feature correctness.

### Level 1: Type Checking

```bash
bun run typecheck
```

### Level 2: Linting

```bash
bun run lint || echo "Lint not configured - skipping"
```

### Level 3: Test Script (Mock Debate Data)

```bash
# Test synthesis agent with mock data
bun run src/test-synthesizer.ts
```

### Level 4: Full Pipeline Test

```bash
# Run full pipeline with real API calls
bun run pipeline "How might we improve decision-making in complex organizations?"
```

### Level 5: Server Test

```bash
# Start server and test via API
bun run dev &
sleep 2
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"query": "How can we improve urban transportation?"}'
```

---

## ACCEPTANCE CRITERIA

- [ ] `bun run typecheck` passes with zero errors
- [ ] Logger accepts `'synthesizer'` stage type without error
- [ ] Synthesis Agent produces exactly 3 ideas with valid structure
- [ ] Each idea has: title, description, whyEmerged, whyItMatters
- [ ] Ideas represent diverse selection criteria (surprising, actionable, assumption-challenging)
- [ ] Confidence narratives reference the debate (advocate/skeptic/rebuttal)
- [ ] Tone is "presenting not prescribing" (research briefing, not verdict)
- [ ] Full pipeline completes with real briefing content
- [ ] `renderBriefingMarkdown()` still works correctly
- [ ] Test script runs successfully with mock data

---

## COMPLETION CHECKLIST

- [ ] All 7 tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully
- [ ] `bun run typecheck` passes
- [ ] Test script runs end-to-end with mock data
- [ ] Full pipeline produces real briefing content
- [ ] Logging output shows synthesizer stage with context
- [ ] No regressions in existing functionality
- [ ] README development status updated (if needed)

---

## NOTES

### Design Decisions

1. **Structured output for Synthesis Agent**: Using Anthropic's structured output with Zod guarantees valid `ExtractedIdea[]` response, eliminating JSON parsing errors and ensuring type safety.

2. **One idea per criterion**: Selecting one idea for each criterion (surprising, actionable, assumption-challenging) ensures diversity and prevents the model from selecting 3 similar "most surprising" ideas.

3. **Single LLM call**: Selection reasoning and narrative generation are naturally intertwined, so a single call is cleaner than separate calls for selection and explanation.

4. **Keep renderBriefingMarkdown()**: This function is already implemented and working correctly. Only the idea generation needs to be replaced.

5. **max_tokens = 4096**: Each idea needs ~200 words for narratives (title + description + whyEmerged + whyItMatters). With 3 ideas plus reasoning overhead, 4096 tokens provides comfortable headroom.

### Trade-offs

- **Prompt length vs. specificity**: The prompt is detailed to ensure the model understands the selection criteria and tone requirements. This trades token efficiency for output quality.

- **No prompt tuning built-in**: The prompt may need iteration based on real output quality. This is expected per PROMPTS.md which noted the prompt was "deferred to implementation phase."

### Potential Improvements

- Add explicit diversity constraint if model selects similar ideas despite criteria separation
- Consider adding example output to prompt if formatting needs are not met
- Add cost tracking based on token counts
- Consider caching briefing results for debugging

### Sources Referenced

- [Anthropic Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [Claude 4 Prompting Best Practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices)
- [Claude Context Windows](https://platform.claude.com/docs/en/build-with-claude/context-windows)
