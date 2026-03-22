# Feature: Phase 3 - Clustering and Tournament Layer Implementation

The following plan should be complete, but validate documentation and codebase patterns before implementing.

Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

Implement Stage 2 (Clustering) and Stage 3 (Tournament) of the ISEE v2 pipeline with real LLM calls:
- **Stage 2 (Clustering Agent)**: Analyze ~66 anonymized responses and group them into 5-7 clusters based on intellectual angles using Claude's structured output
- **Stage 3 (Tournament Layer)**: Run a structured debate with Advocates (parallel), Skeptic (single), and Rebuttals (parallel) to surface the strongest ideas

This replaces the current stub implementations with production-ready code following the established patterns from Phase 2.

## User Story

As a user submitting a research question
I want ISEE to intelligently cluster the response matrix and run a debate tournament
So that the strongest ideas are surfaced through rigorous intellectual challenge before extraction

## Problem Statement

The current pipeline has stub implementations for clustering and tournament that return mock data. The clustering stage cannot identify genuine intellectual angles, and the tournament layer cannot run actual advocate/skeptic/rebuttal debates. Users cannot receive briefings based on real evaluation.

## Solution Statement

Extend the Anthropic client with 4 new functions for the pipeline agents. Implement clustering using Claude's structured output with Zod schemas to guarantee valid JSON with cluster assignments. Implement tournament using a mix of prose calls (Advocates, Rebuttals) and structured output (Skeptic). Use `Promise.all` for parallel execution of Advocates and Rebuttals. Handle failures gracefully by excluding failed clusters from subsequent stages.

## Feature Metadata

**Feature Type**: New Capability (replacing stubs with real implementation)
**Estimated Complexity**: Medium
**Primary Systems Affected**: `src/pipeline/clustering.ts`, `src/pipeline/tournament.ts`, `src/clients/anthropic.ts`, `src/utils/logger.ts`
**Dependencies**: None new (uses existing `@anthropic-ai/sdk`, `zod`)

---

## CONTEXT REFERENCES

### Relevant Codebase Files - IMPORTANT: READ THESE FILES BEFORE IMPLEMENTING!

**Type Definitions:**
- `src/types.ts` (lines 68-77) - `Cluster` interface that clustering must return
- `src/types.ts` (lines 86-100) - `AdvocateArgument`, `SkepticChallenge`, `Rebuttal` interfaces
- `src/types.ts` (lines 116-122) - `DebateEntry` interface that tournament must return
- `src/types.ts` (lines 54-57) - `AnonymizedResponse` interface for clustering input

**Existing Implementations to Mirror:**
- `src/clients/anthropic.ts` (lines 30-38) - Zod schema definition pattern for structured output
- `src/clients/anthropic.ts` (lines 47-107) - `generateDomainsWithClaude()` - full pattern with retry
- `src/clients/anthropic.ts` (lines 112-125) - Prompt builder function pattern

**Pipeline Modules (stubs to replace):**
- `src/pipeline/clustering.ts` (lines 21-78) - `clusterResponses()` stub to replace
- `src/pipeline/clustering.ts` (lines 84-107) - `anonymizeResponses()` and `getTopMembers()` - KEEP THESE
- `src/pipeline/tournament.ts` (lines 38-59) - `runTournament()` orchestrator stub
- `src/pipeline/tournament.ts` (lines 64-81) - `runAdvocates()` stub
- `src/pipeline/tournament.ts` (lines 86-101) - `runSkeptic()` stub
- `src/pipeline/tournament.ts` (lines 106-125) - `runRebuttals()` stub

**Logging:**
- `src/utils/logger.ts` (lines 35-42) - `LLMCallContext` interface needs new stages

**Prompts:**
- `PROMPTS.md` (lines 42-98) - Clustering Agent prompt specification
- `PROMPTS.md` (lines 102-142) - Advocate Agent prompt specification
- `PROMPTS.md` (lines 146-197) - Skeptic Agent prompt specification
- `PROMPTS.md` (lines 201-240) - Rebuttal prompt specification

### New Files to Create

None - all changes are updates to existing files.

### Relevant Documentation - READ THESE BEFORE IMPLEMENTING!

- [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript)
  - Section: Basic `messages.create()` for prose responses
  - Why: Advocates and Rebuttals return prose, not JSON

- [Anthropic Structured Outputs](https://platform.claude.com/docs/en/docs/build-with-claude/structured-outputs)
  - Section: Using `messages.parse()` with Zod
  - Why: Clustering and Skeptic return JSON via structured output

### Patterns to Follow

**Zod Schema Definition (from anthropic.ts:30-38):**
```typescript
const DomainSchema = z.object({
  name: z.string(),
  description: z.string(),
  focus: z.string(),
});

const DomainsResponseSchema = z.object({
  domains: z.array(DomainSchema),
});
```

**Structured Output Call (from anthropic.ts:62-67):**
```typescript
const response = await getClient().messages.parse({
  model: AGENT_MODEL,
  max_tokens: 1024,
  messages: [{ role: 'user', content: prompt }],
  output_config: { format: zodOutputFormat(DomainsResponseSchema) },
});
const result = response.parsed_output;
```

**Prose Call (standard SDK pattern):**
```typescript
const response = await getClient().messages.create({
  model: AGENT_MODEL,
  max_tokens: 1024,
  messages: [{ role: 'user', content: prompt }],
});
const text = response.content[0].type === 'text' ? response.content[0].text : '';
```

**Retry Loop (from anthropic.ts:51-104):**
```typescript
const maxAttempts = 2;
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try {
    // ... make call
    return result;
  } catch (error) {
    const willRetry = attempt < maxAttempts;
    logLLMCallError(logger, callContext, errorMessage, willRetry);
    if (!willRetry) throw error;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
```

**Console Logging Prefix:**
```typescript
console.log('[clustering] Analyzing responses...');
console.log('[tournament] Running advocates in parallel...');
```

---

## IMPLEMENTATION PLAN

### Phase 1: Logger Extension

Extend the logger to support new pipeline stages.

**Tasks:**
- Update `LLMCallContext.stage` union type to include new stages

### Phase 2: Anthropic Client Extension

Add 4 new functions to the Anthropic client for the clustering and tournament agents.

**Tasks:**
- Add Zod schemas for Clustering and Skeptic responses
- Implement `clusterResponsesWithClaude()` (structured output)
- Implement `generateAdvocateArgument()` (prose)
- Implement `generateSkepticChallenges()` (structured output)
- Implement `generateRebuttal()` (prose)

### Phase 3: Clustering Implementation

Replace the clustering stub with real implementation.

**Tasks:**
- Wire up `clusterResponses()` to use the new Anthropic function
- Add validation for cluster assignments (all indices assigned, no duplicates)
- Pass logger through for structured logging

### Phase 4: Tournament Implementation

Replace the tournament stubs with real implementations.

**Tasks:**
- Implement `runAdvocates()` with `Promise.all`
- Implement `runSkeptic()` with filtered input (exclude failed advocates)
- Implement `runRebuttals()` with `Promise.all`
- Handle failures gracefully (exclude clusters from subsequent stages)

### Phase 5: Integration Testing

Verify the implementation works end-to-end.

**Tasks:**
- Test clustering with real synthesis output
- Test full tournament flow
- Verify briefing output contains real debate content

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

---

### Task 1: UPDATE src/utils/logger.ts - Extend LLMCallContext

- **IMPLEMENT**: Add new stage values to the `LLMCallContext.stage` union type
- **PATTERN**: Follow existing union type style (line 36)
- **IMPORTS**: None needed
- **GOTCHA**: Must be a union of string literals, not a general string type
- **VALIDATE**: `bun run typecheck`

**Change this (line 36):**
```typescript
stage: 'prep' | 'synthesis';
```

**To this:**
```typescript
stage: 'prep' | 'synthesis' | 'clustering' | 'advocate' | 'skeptic' | 'rebuttal';
```

---

### Task 2: UPDATE src/clients/anthropic.ts - Add Zod Schemas

- **IMPLEMENT**: Add Zod schemas for Clustering and Skeptic structured outputs
- **PATTERN**: Mirror `DomainSchema` and `DomainsResponseSchema` (lines 30-38)
- **IMPORTS**: None needed (z already imported)
- **GOTCHA**: Schema must match exactly what PROMPTS.md specifies as JSON output
- **VALIDATE**: `bun run typecheck`

**Add after DomainsResponseSchema (around line 38):**
```typescript
// Clustering Agent schemas
const ClusterSchema = z.object({
  id: z.number(),
  name: z.string(),
  summary: z.string(),
  memberIndices: z.array(z.number()),
});

const ClusteringResponseSchema = z.object({
  clusters: z.array(ClusterSchema),
});

// Skeptic Agent schemas
const SkepticChallengeSchema = z.object({
  clusterId: z.number(),
  clusterName: z.string(),
  challenge: z.string(),
});

const SkepticChallengesResponseSchema = z.object({
  challenges: z.array(SkepticChallengeSchema),
});
```

---

### Task 3: UPDATE src/clients/anthropic.ts - Add clusterResponsesWithClaude()

- **IMPLEMENT**: Function that takes anonymized responses and returns clusters via structured output
- **PATTERN**: Mirror `generateDomainsWithClaude()` structure (lines 47-107)
- **IMPORTS**: Add `Cluster` to imports from `../types`
- **GOTCHA**: Use max_tokens of 4096 - clustering output can be large with 66 responses
- **VALIDATE**: `bun run typecheck`

**Add after generateDomainsWithClaude function:**
```typescript
/**
 * Cluster responses by intellectual angle using structured output.
 */
export async function clusterResponsesWithClaude(
  query: string,
  anonymizedResponses: Array<{ index: number; content: string }>,
  logger: Logger
): Promise<Cluster[]> {
  const maxAttempts = 2;
  const prompt = buildClusteringPrompt(query, anonymizedResponses);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const callContext = {
      stage: 'clustering' as const,
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
        output_config: { format: zodOutputFormat(ClusteringResponseSchema) },
      });

      const durationMs = Date.now() - startTime;

      if (!response.parsed_output) {
        throw new Error('Clustering Agent returned no structured output');
      }

      const clusters = response.parsed_output.clusters;

      // Validate cluster count
      if (clusters.length < 5 || clusters.length > 7) {
        logger.warn(
          { clusterCount: clusters.length, expected: '5-7' },
          'Unexpected cluster count from Clustering Agent'
        );
      }

      logLLMCallSuccess(logger, callContext, durationMs, JSON.stringify(clusters).length);

      return clusters;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const willRetry = attempt < maxAttempts;

      logLLMCallError(logger, callContext, errorMessage, willRetry);

      if (!willRetry) {
        throw new Error(`Clustering Agent failed after ${maxAttempts} attempts: ${errorMessage}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Unexpected: retry loop completed without result');
}

/**
 * Build the Clustering Agent prompt from PROMPTS.md specification.
 */
function buildClusteringPrompt(
  query: string,
  responses: Array<{ index: number; content: string }>
): string {
  const responsesText = responses
    .map((r) => `[Response ${r.index}]\n${r.content}`)
    .join('\n\n---\n\n');

  return `You are an intellectual analyst. You will receive a numbered list of responses to this query:

QUERY: ${query}

Your task is to identify the distinct intellectual angles present across all responses.

WHAT YOU ARE LOOKING FOR:
Each "angle" is a distinct position or argument — not a topic or theme. An angle answers the question: "What is this response actually claiming or proposing?"

Examples of topic labels (WRONG):
- "Technology Solutions"
- "Governance Approaches"
- "Human-Centered Design"

Examples of argument-style angle names (CORRECT):
- "Automate the human decision layer out of existence"
- "The problem is in the incentive structure, not the process"
- "Small-scale experimentation outperforms top-down design every time"

INSTRUCTIONS:
1. Read all responses carefully
2. Identify 5–7 genuinely distinct intellectual angles
3. Name each angle as a specific claim or stance (8–12 words)
4. Assign each response index to its closest angle
5. Write a 2-sentence summary of each angle

IMPORTANT CONSTRAINTS:
- Do not name angles after their source domain or methodology
- Do not create an angle for responses that are vague, generic, or fail to take a position — assign these to the closest angle that does
- If two angles feel similar, merge them — prefer fewer, sharper angles over more, blurry ones
- Every response index must be assigned to exactly one angle

RESPONSES:

${responsesText}

Respond with your clusters.`;
}
```

Also add `Cluster` to the type imports at the top of the file:
```typescript
import type { Domain, Cluster } from '../types';
```

---

### Task 4: UPDATE src/clients/anthropic.ts - Add generateAdvocateArgument()

- **IMPLEMENT**: Function that generates a prose argument for a cluster's angle
- **PATTERN**: Use `messages.create()` (not `.parse()`) for prose output
- **IMPORTS**: None needed
- **GOTCHA**: Extract text from `response.content[0]` - check type is 'text'
- **VALIDATE**: `bun run typecheck`

**Add after clusterResponsesWithClaude:**
```typescript
/**
 * Generate an advocate argument for a cluster (prose output).
 */
export async function generateAdvocateArgument(
  query: string,
  clusterName: string,
  clusterSummary: string,
  topMemberResponses: string[],
  logger: Logger
): Promise<string> {
  const maxAttempts = 2;
  const prompt = buildAdvocatePrompt(query, clusterName, clusterSummary, topMemberResponses);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const callContext = {
      stage: 'advocate' as const,
      model: AGENT_MODEL,
      attempt,
    };

    logLLMCallStart(logger, callContext);
    const startTime = Date.now();

    try {
      const response = await getClient().messages.create({
        model: AGENT_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const durationMs = Date.now() - startTime;
      const textBlock = response.content[0];
      const text = textBlock.type === 'text' ? textBlock.text : '';

      if (!text) {
        throw new Error('Advocate returned empty response');
      }

      logLLMCallSuccess(logger, callContext, durationMs, text.length);

      return text;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const willRetry = attempt < maxAttempts;

      logLLMCallError(logger, callContext, errorMessage, willRetry);

      if (!willRetry) {
        throw new Error(`Advocate failed after ${maxAttempts} attempts: ${errorMessage}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Unexpected: retry loop completed without result');
}

/**
 * Build the Advocate Agent prompt from PROMPTS.md specification.
 */
function buildAdvocatePrompt(
  query: string,
  clusterName: string,
  clusterSummary: string,
  topMemberResponses: string[]
): string {
  const responsesText = topMemberResponses
    .map((r, i) => `[Supporting Response ${i + 1}]\n${r}`)
    .join('\n\n');

  return `You are an intellectual advocate. You have been assigned to represent one angle that emerged from a large-scale analysis of this query:

QUERY: ${query}

YOUR ASSIGNED ANGLE:
Name: ${clusterName}
Summary: ${clusterSummary}

Supporting responses from the analysis:
${responsesText}

YOUR TASK:
Make the strongest possible case for why this angle represents the most valuable response to the original query.

Your argument must:
1. STATE THE CLAIM — What is this angle actually asserting? Be specific and direct.
2. EXPLAIN THE SURPRISE — Why would this angle not emerge from ordinary prompting or single-model querying? What does it see that conventional approaches miss?
3. MAKE THE CASE FOR VALUE — Why does this matter for someone asking this specific query? What could they do, think, or decide differently because of it?

Your argument must NOT:
- Simply restate or summarize the angle — argue for it
- Make generic claims about novelty or importance without specifics
- Appeal to how many responses support it — volume is not value
- Use vague language like "paradigm shift" or "transformative potential" without concrete grounding

Length: 150–200 words. Tight, specific, defensible.`;
}
```

---

### Task 5: UPDATE src/clients/anthropic.ts - Add generateSkepticChallenges()

- **IMPLEMENT**: Function that generates challenges for all advocates via structured output
- **PATTERN**: Mirror `clusterResponsesWithClaude()` with different schema
- **IMPORTS**: Add `SkepticChallenge` to imports from `../types`
- **GOTCHA**: Input is array of advocate arguments; output must include clusterId for matching
- **VALIDATE**: `bun run typecheck`

**Add after generateAdvocateArgument:**
```typescript
/**
 * Generate skeptic challenges for all advocate arguments (structured output).
 */
export async function generateSkepticChallenges(
  query: string,
  advocateArguments: Array<{ clusterId: number; clusterName: string; argument: string }>,
  logger: Logger
): Promise<SkepticChallenge[]> {
  const maxAttempts = 2;
  const prompt = buildSkepticPrompt(query, advocateArguments);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const callContext = {
      stage: 'skeptic' as const,
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
        output_config: { format: zodOutputFormat(SkepticChallengesResponseSchema) },
      });

      const durationMs = Date.now() - startTime;

      if (!response.parsed_output) {
        throw new Error('Skeptic Agent returned no structured output');
      }

      const challenges = response.parsed_output.challenges;

      logLLMCallSuccess(logger, callContext, durationMs, JSON.stringify(challenges).length);

      return challenges;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const willRetry = attempt < maxAttempts;

      logLLMCallError(logger, callContext, errorMessage, willRetry);

      if (!willRetry) {
        throw new Error(`Skeptic Agent failed after ${maxAttempts} attempts: ${errorMessage}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Unexpected: retry loop completed without result');
}

/**
 * Build the Skeptic Agent prompt from PROMPTS.md specification.
 */
function buildSkepticPrompt(
  query: string,
  advocateArguments: Array<{ clusterId: number; clusterName: string; argument: string }>
): string {
  const advocatesText = advocateArguments
    .map(
      (a) => `[Cluster ${a.clusterId}: "${a.clusterName}"]
${a.argument}`
    )
    .join('\n\n---\n\n');

  return `You are a rigorous intellectual skeptic. You have observed a debate in which several advocates each argued for a different angle emerging from a large-scale analysis of this query:

QUERY: ${query}

THE ADVOCATES' ARGUMENTS:
${advocatesText}

YOUR TASK:
Challenge each advocate's argument. Your goal is not to dismiss — it is to find the precise point where each argument is weakest, and press on it.

For each advocate, deliver ONE focused challenge that targets the most vulnerable part of their specific argument.

Your challenge should probe one or more of these pressure points:
- IS IT ACTUALLY NOVEL? Could this angle have emerged from a single well-crafted prompt to one model? If so, what has ISEE's combinatorial approach actually added?
- IS THE VALUE REAL OR RHETORICAL? Does the argument demonstrate concrete value for someone asking this query, or does it assert importance without showing it?
- IS IT INTERNALLY CONSISTENT? Does the claim hold together, or does it contradict itself when examined closely?
- IS IT ACTUALLY DISTINCT? If two angles are making substantially the same claim in different language, name this directly.

Your challenge must NOT:
- Ask clarifying questions — make a specific challenge
- Apply generic skepticism ("but is this really new?") without specifics
- Challenge the topic — challenge the *argument the advocate made*
- Be longer than 100 words per advocate

Respond with your challenges.`;
}
```

Also add `SkepticChallenge` to the type imports:
```typescript
import type { Domain, Cluster, SkepticChallenge } from '../types';
```

---

### Task 6: UPDATE src/clients/anthropic.ts - Add generateRebuttal()

- **IMPLEMENT**: Function that generates a prose rebuttal to a skeptic challenge
- **PATTERN**: Mirror `generateAdvocateArgument()` structure
- **IMPORTS**: None needed
- **GOTCHA**: Input includes both original argument AND skeptic challenge
- **VALIDATE**: `bun run typecheck`

**Add after generateSkepticChallenges:**
```typescript
/**
 * Generate a rebuttal to a skeptic challenge (prose output).
 */
export async function generateRebuttal(
  query: string,
  clusterName: string,
  advocateArgument: string,
  skepticChallenge: string,
  logger: Logger
): Promise<string> {
  const maxAttempts = 2;
  const prompt = buildRebuttalPrompt(query, clusterName, advocateArgument, skepticChallenge);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const callContext = {
      stage: 'rebuttal' as const,
      model: AGENT_MODEL,
      attempt,
    };

    logLLMCallStart(logger, callContext);
    const startTime = Date.now();

    try {
      const response = await getClient().messages.create({
        model: AGENT_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const durationMs = Date.now() - startTime;
      const textBlock = response.content[0];
      const text = textBlock.type === 'text' ? textBlock.text : '';

      if (!text) {
        throw new Error('Rebuttal returned empty response');
      }

      logLLMCallSuccess(logger, callContext, durationMs, text.length);

      return text;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const willRetry = attempt < maxAttempts;

      logLLMCallError(logger, callContext, errorMessage, willRetry);

      if (!willRetry) {
        throw new Error(`Rebuttal failed after ${maxAttempts} attempts: ${errorMessage}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Unexpected: retry loop completed without result');
}

/**
 * Build the Rebuttal prompt from PROMPTS.md specification.
 */
function buildRebuttalPrompt(
  query: string,
  clusterName: string,
  advocateArgument: string,
  skepticChallenge: string
): string {
  return `You are an intellectual advocate defending a position under challenge.

ORIGINAL QUERY: ${query}

YOUR ANGLE:
Name: ${clusterName}
Your original argument: ${advocateArgument}

THE SKEPTIC'S CHALLENGE:
${skepticChallenge}

YOUR TASK:
Respond to the skeptic's challenge directly. You have one response.

A strong rebuttal does one of three things:
1. REFUTES the challenge — shows specifically why the skeptic's concern does not apply, or rests on a false assumption
2. CONCEDES AND HOLDS — acknowledges the challenge has merit on one point, but demonstrates the core claim survives it
3. SHARPENS the original argument — uses the challenge to articulate the claim more precisely, showing the skeptic identified a weakness in the *framing*, not the *substance*

Your rebuttal must NOT:
- Simply restate your original argument without engaging the challenge
- Claim the challenge misunderstood you without introducing entirely new claims not present in your original argument
- Be defensive in tone — engage the challenge as an intellectual peer

Length: 100–150 words.`;
}
```

---

### Task 7: UPDATE src/pipeline/clustering.ts - Replace stub with real implementation

- **IMPLEMENT**: Wire up `clusterResponses()` to use the Anthropic client function
- **PATTERN**: Follow Phase 2 pattern of passing logger, handling errors
- **IMPORTS**: Add imports for Anthropic client function and logger
- **GOTCHA**: Must validate that all response indices are assigned exactly once
- **VALIDATE**: `bun run typecheck`

**Replace the entire file with:**
```typescript
/**
 * Stage 2: Emergent Clustering Agent
 *
 * Discovers the genuine intellectual shape of the response space.
 * CRITICAL: Receives response content ONLY - no source metadata.
 * This ensures clusters represent genuine intellectual angles rather
 * than reflecting the source dimensions (model, framework, domain).
 *
 * See PROMPTS.md for the full prompt specification.
 */

import type { RawResponse, AnonymizedResponse, Cluster } from '../types';
import { clusterResponsesWithClaude } from '../clients/anthropic';
import { logger as baseLogger, type Logger } from '../utils/logger';

/**
 * Cluster responses by emergent intellectual angle.
 *
 * @param responses - Raw responses (metadata will be stripped)
 * @param query - Original query for context
 * @param runLogger - Optional logger with run context
 * @returns Array of 5-7 clusters with argument-style names
 */
export async function clusterResponses(
  responses: RawResponse[],
  query: string,
  runLogger?: Logger
): Promise<Cluster[]> {
  const log = runLogger || baseLogger;

  // Strip metadata - clustering agent sees content only
  const anonymized = anonymizeResponses(responses);

  log.info({ responseCount: anonymized.length }, 'Clustering agent starting');

  const clusters = await clusterResponsesWithClaude(query, anonymized, log);

  // Validate all indices are assigned
  const validation = validateClusterAssignments(clusters, responses.length);
  if (!validation.valid) {
    log.warn(
      {
        issues: validation.issues,
        clusterCount: clusters.length,
        responseCount: responses.length,
      },
      'Cluster assignment validation warnings'
    );
  }

  log.info(
    {
      clusterCount: clusters.length,
      clusterNames: clusters.map((c) => c.name),
    },
    'Clustering agent complete'
  );

  return clusters;
}

/**
 * Strip source metadata from responses for clustering.
 * The clustering agent must not know which model/framework/domain produced each response.
 */
function anonymizeResponses(responses: RawResponse[]): AnonymizedResponse[] {
  return responses.map((r) => ({
    index: r.index,
    content: r.content,
  }));
}

/**
 * Validate that cluster assignments cover all responses exactly once.
 */
function validateClusterAssignments(
  clusters: Cluster[],
  totalResponses: number
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const assignedIndices = new Set<number>();

  for (const cluster of clusters) {
    for (const idx of cluster.memberIndices) {
      if (idx < 0 || idx >= totalResponses) {
        issues.push(`Invalid index ${idx} in cluster "${cluster.name}" (valid range: 0-${totalResponses - 1})`);
      } else if (assignedIndices.has(idx)) {
        issues.push(`Duplicate assignment: index ${idx} appears in multiple clusters`);
      } else {
        assignedIndices.add(idx);
      }
    }
  }

  // Check for unassigned indices
  for (let i = 0; i < totalResponses; i++) {
    if (!assignedIndices.has(i)) {
      issues.push(`Unassigned response: index ${i} not in any cluster`);
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Get the top member responses for a cluster (by length and specificity).
 * Used to provide the Advocate with the strongest representatives.
 */
export function getTopMembers(
  cluster: Cluster,
  responses: RawResponse[],
  count: number = 3
): RawResponse[] {
  const members = cluster.memberIndices
    .map((idx) => responses[idx])
    .filter(Boolean)
    // Sort by content length as proxy for specificity
    .sort((a, b) => b.content.length - a.content.length);

  return members.slice(0, count);
}
```

---

### Task 8: UPDATE src/pipeline/tournament.ts - Replace stubs with real implementations

- **IMPLEMENT**: Wire up all tournament functions to use Anthropic client
- **PATTERN**: Parallel execution with `Promise.all`, filter failed clusters
- **IMPORTS**: Add Anthropic client functions and logger imports
- **GOTCHA**: If advocate fails, exclude that cluster from skeptic input and rebuttals
- **VALIDATE**: `bun run typecheck`

**Replace the entire file with:**
```typescript
/**
 * Stage 3: Tournament Layer
 *
 * Surfaces the strongest ideas through structured debate:
 * 1. Advocate Agents (parallel) - One per cluster argues for its angle
 * 2. Skeptic Agent (single) - Challenges all advocates
 * 3. Rebuttal (parallel) - Each advocate responds to their challenge
 *
 * See PROMPTS.md for all prompt specifications.
 */

import type {
  Cluster,
  RawResponse,
  AdvocateArgument,
  SkepticChallenge,
  Rebuttal,
  DebateEntry,
} from '../types';
import { getTopMembers } from './clustering';
import {
  generateAdvocateArgument,
  generateSkepticChallenges,
  generateRebuttal,
} from '../clients/anthropic';
import { logger as baseLogger, type Logger } from '../utils/logger';

interface TournamentConfig {
  query: string;
  clusters: Cluster[];
  responses: RawResponse[];
  runLogger?: Logger;
}

interface TournamentResult {
  debateEntries: DebateEntry[];
}

/**
 * Run the full tournament: advocates → skeptic → rebuttals.
 *
 * @param config - Query, clusters, and raw responses
 * @returns Complete debate transcript for all clusters
 */
export async function runTournament(config: TournamentConfig): Promise<TournamentResult> {
  const { query, clusters, responses, runLogger } = config;
  const log = runLogger || baseLogger;

  log.info({ clusterCount: clusters.length }, 'Tournament starting');

  // Phase 3a: Run all advocates in parallel
  const advocateResults = await runAdvocates(query, clusters, responses, log);
  const successfulAdvocates = advocateResults.filter((r) => r.success);

  log.info(
    {
      total: clusters.length,
      successful: successfulAdvocates.length,
      failed: clusters.length - successfulAdvocates.length,
    },
    'Advocates complete'
  );

  if (successfulAdvocates.length === 0) {
    throw new Error('All advocate calls failed - cannot continue tournament');
  }

  // Phase 3b: Run skeptic (single call, sees only successful advocates)
  const advocateArgs = successfulAdvocates.map((r) => r.argument!);
  const challenges = await runSkeptic(query, advocateArgs, log);

  log.info({ challengeCount: challenges.length }, 'Skeptic complete');

  // Phase 3c: Run all rebuttals in parallel
  const rebuttals = await runRebuttals(query, advocateArgs, challenges, log);

  log.info(
    {
      total: advocateArgs.length,
      successful: rebuttals.filter((r) => r.success).length,
    },
    'Rebuttals complete'
  );

  // Combine into debate entries
  const debateEntries = combineDebate(advocateArgs, challenges, rebuttals);

  log.info({ entryCount: debateEntries.length }, 'Tournament complete');

  return { debateEntries };
}

interface AdvocateResult {
  clusterId: number;
  success: boolean;
  argument?: AdvocateArgument;
  error?: string;
}

/**
 * Run advocate agents for all clusters in parallel.
 */
async function runAdvocates(
  query: string,
  clusters: Cluster[],
  responses: RawResponse[],
  log: Logger
): Promise<AdvocateResult[]> {
  const promises = clusters.map(async (cluster): Promise<AdvocateResult> => {
    try {
      const topMembers = getTopMembers(cluster, responses, 3);
      const topMemberContents = topMembers.map((m) => m.content);

      const argumentText = await generateAdvocateArgument(
        query,
        cluster.name,
        cluster.summary,
        topMemberContents,
        log
      );

      return {
        clusterId: cluster.id,
        success: true,
        argument: {
          clusterId: cluster.id,
          clusterName: cluster.name,
          argument: argumentText,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error(
        { clusterId: cluster.id, clusterName: cluster.name, error: errorMessage },
        'Advocate failed'
      );
      return {
        clusterId: cluster.id,
        success: false,
        error: errorMessage,
      };
    }
  });

  return Promise.all(promises);
}

/**
 * Run the skeptic agent (single call, challenges all advocates).
 */
async function runSkeptic(
  query: string,
  advocateArgs: AdvocateArgument[],
  log: Logger
): Promise<SkepticChallenge[]> {
  const advocateInputs = advocateArgs.map((a) => ({
    clusterId: a.clusterId,
    clusterName: a.clusterName,
    argument: a.argument,
  }));

  const challenges = await generateSkepticChallenges(query, advocateInputs, log);

  return challenges;
}

interface RebuttalResult {
  clusterId: number;
  success: boolean;
  rebuttal?: Rebuttal;
  error?: string;
}

/**
 * Run rebuttal agents for all clusters in parallel.
 */
async function runRebuttals(
  query: string,
  advocateArgs: AdvocateArgument[],
  challenges: SkepticChallenge[],
  log: Logger
): Promise<RebuttalResult[]> {
  const promises = advocateArgs.map(async (arg): Promise<RebuttalResult> => {
    const challenge = challenges.find((c) => c.clusterId === arg.clusterId);

    if (!challenge) {
      // No challenge for this cluster (shouldn't happen, but handle gracefully)
      return {
        clusterId: arg.clusterId,
        success: false,
        error: 'No skeptic challenge found for this cluster',
      };
    }

    try {
      const rebuttalText = await generateRebuttal(
        query,
        arg.clusterName,
        arg.argument,
        challenge.challenge,
        log
      );

      return {
        clusterId: arg.clusterId,
        success: true,
        rebuttal: {
          clusterId: arg.clusterId,
          clusterName: arg.clusterName,
          rebuttal: rebuttalText,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error(
        { clusterId: arg.clusterId, clusterName: arg.clusterName, error: errorMessage },
        'Rebuttal failed'
      );
      return {
        clusterId: arg.clusterId,
        success: false,
        error: errorMessage,
      };
    }
  });

  return Promise.all(promises);
}

/**
 * Combine all tournament phases into debate entries.
 */
function combineDebate(
  advocateArgs: AdvocateArgument[],
  challenges: SkepticChallenge[],
  rebuttalResults: RebuttalResult[]
): DebateEntry[] {
  return advocateArgs.map((arg) => {
    const challenge = challenges.find((c) => c.clusterId === arg.clusterId);
    const rebuttalResult = rebuttalResults.find((r) => r.clusterId === arg.clusterId);

    return {
      clusterId: arg.clusterId,
      clusterName: arg.clusterName,
      advocateArgument: arg.argument,
      skepticChallenge: challenge?.challenge || '[No challenge generated]',
      rebuttal: rebuttalResult?.success
        ? rebuttalResult.rebuttal!.rebuttal
        : `[Rebuttal failed: ${rebuttalResult?.error || 'Unknown error'}]`,
    };
  });
}
```

---

### Task 9: UPDATE src/pipeline.ts - Pass logger to clustering and tournament

- **IMPLEMENT**: Pass runLogger to clustering and tournament function calls
- **PATTERN**: Same pattern used for prep and synthesis stages
- **IMPORTS**: None needed (already imported)
- **GOTCHA**: Must update function call signatures to include runLogger
- **VALIDATE**: `bun run typecheck`

**Update the clustering call (around line 100):**
```typescript
const clusters = await clusterResponses(responses, query, runLogger);
```

**Update the tournament call (around line 111):**
```typescript
const { debateEntries } = await runTournament({
  query,
  clusters,
  responses,
  runLogger,
});
```

---

### Task 10: CREATE test script for Phase 3

- **IMPLEMENT**: Test script that runs clustering and tournament with real data
- **PATTERN**: Similar to test-synthesis.ts from Phase 2
- **PURPOSE**: Verify implementation before full pipeline runs
- **VALIDATE**: Manual run with `bun run src/test-clustering-tournament.ts`

**Create new file src/test-clustering-tournament.ts:**
```typescript
/**
 * Test script for Phase 3 implementation.
 * Tests clustering and tournament with mock synthesis data.
 */

import { clusterResponses } from './pipeline/clustering';
import { runTournament } from './pipeline/tournament';
import { createRunLogger } from './utils/logger';
import type { RawResponse } from './types';

// Mock responses for testing (simulating synthesis output)
const mockResponses: RawResponse[] = Array.from({ length: 20 }, (_, i) => ({
  index: i,
  content: getMockContent(i),
  model: `model-${i % 3}`,
  framework: `framework-${i % 5}`,
  domain: `domain-${i % 4}`,
}));

function getMockContent(index: number): string {
  const perspectives = [
    'The key insight is that automation can remove human bottlenecks entirely. Rather than trying to improve human decision-making, we should design systems where critical decisions are encoded into protocols that execute automatically. This shifts the challenge from training humans to designing better rules.',
    'Incentive structures are the root cause of most organizational dysfunction. Process improvements fail because they don\'t address the underlying incentives that drive behavior. Realign incentives first, and processes will self-organize toward desired outcomes.',
    'Historical precedents show that complex organizational challenges are rarely "solved" - they are managed, mitigated, and adapted to. The most successful organizations accept inherent complexity rather than seeking simplistic solutions.',
    'Small-scale experimentation consistently outperforms top-down design. Rather than betting on one comprehensive solution, run many small experiments in parallel. The failures teach you about constraints, and the successes can be scaled.',
    'Cross-domain synthesis reveals unexpected solutions. By combining insights from behavioral economics, network theory, and ecological systems, we can see patterns that domain experts miss because they\'re too embedded in conventional thinking.',
    'The problem is framed incorrectly. Instead of asking "how do we improve X," we should ask "do we need X at all?" Many organizational structures exist because of historical accident, not actual necessity.',
  ];
  return perspectives[index % perspectives.length] + ` (Response ${index})`;
}

async function testPhase3() {
  const query = 'How might we improve decision-making in complex organizations?';
  const runLogger = createRunLogger('test-phase3');

  console.log('='.repeat(60));
  console.log('ISEE v2 - Phase 3 Test');
  console.log('='.repeat(60));
  console.log(`Query: ${query}`);
  console.log(`Mock responses: ${mockResponses.length}`);
  console.log('');

  // Test Clustering
  console.log('Testing Clustering Agent...');
  const clusters = await clusterResponses(mockResponses, query, runLogger);
  console.log(`Generated ${clusters.length} clusters:`);
  clusters.forEach((c) => {
    console.log(`  [${c.id}] ${c.name}`);
    console.log(`      Members: ${c.memberIndices.join(', ')}`);
  });
  console.log('');

  // Test Tournament
  console.log('Testing Tournament Layer...');
  const { debateEntries } = await runTournament({
    query,
    clusters,
    responses: mockResponses,
    runLogger,
  });
  console.log(`Generated ${debateEntries.length} debate entries:`);
  debateEntries.forEach((entry) => {
    console.log('');
    console.log(`--- Cluster: ${entry.clusterName} ---`);
    console.log(`Advocate: ${entry.advocateArgument.substring(0, 150)}...`);
    console.log(`Skeptic: ${entry.skepticChallenge.substring(0, 150)}...`);
    console.log(`Rebuttal: ${entry.rebuttal.substring(0, 150)}...`);
  });

  console.log('');
  console.log('='.repeat(60));
  console.log('Phase 3 test complete!');
}

testPhase3().catch(console.error);
```

---

## TESTING STRATEGY

### Unit Tests

Focus on validation logic that can be tested without API calls:

- `validateClusterAssignments()` correctly identifies missing, duplicate, and out-of-range indices
- `getTopMembers()` returns correct number of members sorted by length
- `anonymizeResponses()` strips metadata correctly

### Integration Tests

- **Clustering**: Run with mock responses, verify 5-7 clusters returned with valid assignments
- **Tournament**: Run with mock clusters, verify all phases complete and debate entries generated
- **Full Pipeline**: Run end-to-end with real API calls (manual test)

### Edge Cases

- Empty responses array → Graceful error
- All advocates fail → Error with clear message
- Skeptic returns mismatched cluster IDs → Handled in combineDebate()
- Clustering returns invalid indices → Warning logged, pipeline continues
- Single cluster (edge case) → Should still work

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

### Level 3: Test Script (Mock Data)

```bash
# Test clustering and tournament with mock data
bun run src/test-clustering-tournament.ts
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
- [ ] Logger accepts new stage types without error
- [ ] Clustering produces 5-7 clusters with argument-style names
- [ ] All response indices are assigned to exactly one cluster
- [ ] Advocates run in parallel and produce arguments
- [ ] Failed advocates are excluded from Skeptic input
- [ ] Skeptic generates targeted challenges for each advocate
- [ ] Rebuttals run in parallel and respond to challenges
- [ ] Full pipeline completes with real debate content in briefing
- [ ] Test script runs successfully with mock data

---

## COMPLETION CHECKLIST

- [ ] All 10 tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully
- [ ] `bun run typecheck` passes
- [ ] Test script runs end-to-end with mock data
- [ ] Full pipeline produces real debate content
- [ ] Logging output shows all stages with context
- [ ] No regressions in existing functionality

---

## NOTES

### Design Decisions

1. **Structured output for Clustering and Skeptic**: These return JSON that needs to be parsed reliably. Using Anthropic's structured output feature guarantees valid JSON matching our Zod schemas.

2. **Prose output for Advocates and Rebuttals**: These return natural language arguments that don't need structured parsing. Using simple `messages.create()` is cleaner.

3. **Exclude failed clusters**: If an advocate fails, we exclude that cluster from the Skeptic's input rather than generating a placeholder. This ensures the Skeptic only challenges real arguments.

4. **Validation with warnings**: Cluster assignment validation logs warnings but doesn't fail. The LLM might occasionally miss an index, and partial results are better than failure.

### Trade-offs

- **No retry for tournament orchestration**: Individual calls retry, but if the entire advocate phase produces zero successes, we fail rather than retry the whole thing.

- **Promise.all vs p-limit**: We use raw Promise.all for advocates/rebuttals since we're only doing 5-7 parallel calls, not 66 like synthesis.

### Potential Improvements

- Add timeout for individual Claude calls
- Consider streaming for long responses
- Add cost tracking based on token counts
- Consider caching clustering results for debugging

### Sources Referenced

- [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript)
- [Anthropic Structured Outputs](https://platform.claude.com/docs/en/docs/build-with-claude/structured-outputs)
