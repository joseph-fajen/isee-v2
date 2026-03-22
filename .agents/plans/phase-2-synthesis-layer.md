# Feature: Phase 2 - Synthesis Layer Implementation

The following plan should be complete, but validate documentation and codebase patterns before implementing.

Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

Implement the first two pipeline stages with real LLM calls:
- **Stage 0 (Prep Agent)**: Generate 3-5 knowledge domains dynamically per query using Anthropic Claude with structured JSON output
- **Stage 1 (Synthesis Layer)**: Query multiple AI models through cognitive frameworks across domains, producing ~60 responses via OpenRouter

This replaces the current stub implementations with production-ready code including structured logging, error handling with retry, and parallel execution with concurrency limiting.

## User Story

As a user entering a research question
I want ISEE to generate relevant knowledge domains and query multiple AI models
So that I receive a diverse matrix of ~60 responses representing different perspectives

## Problem Statement

The current pipeline has stub implementations that return mock data. Users cannot actually run ISEE to get real AI-generated responses. The infrastructure for making LLM calls, handling errors, and logging does not exist.

## Solution Statement

Create reusable client wrappers for OpenRouter and Anthropic APIs with built-in logging and error handling. Implement the Prep Agent using Anthropic's structured output feature with Zod schemas. Implement the Synthesis Layer using OpenRouter with p-limit for concurrency control. Add Pino-based structured logging throughout for debugging visibility.

## Feature Metadata

**Feature Type**: New Capability (replacing stubs with real implementation)
**Estimated Complexity**: Medium-High
**Primary Systems Affected**: `src/pipeline/prep.ts`, `src/pipeline/synthesis.ts`, new client/utility modules
**Dependencies**: `p-limit`, `pino`, `pino-pretty`, `zod`

---

## CONTEXT REFERENCES

### Relevant Codebase Files - IMPORTANT: READ THESE FILES BEFORE IMPLEMENTING!

- `src/types.ts` (lines 16-23) - `Domain` interface that Prep Agent must return
- `src/types.ts` (lines 33-48) - `RawResponse` interface that Synthesis must return
- `src/types.ts` (lines 203-212) - `PipelineProgress` interface for progress callbacks
- `src/types.ts` (lines 221-230) - `CognitiveFramework` interface structure
- `src/types.ts` (lines 235-246) - `SynthesisModel` interface with `openRouterId` field
- `src/config/frameworks.ts` (lines 146-154) - `formatFrameworkPrompt()` helper - USE THIS
- `src/config/models.ts` (lines 15-58) - `MODELS` array with OpenRouter model IDs
- `src/pipeline/prep.ts` (lines 19-49) - Current stub to replace
- `src/pipeline/synthesis.ts` (lines 28-65) - Current stub to replace
- `src/pipeline/synthesis.ts` (lines 77-91) - `buildCombinations()` function - KEEP THIS PATTERN
- `src/pipeline.ts` (lines 51-59) - Progress emission pattern to follow
- `src/pipeline.ts` (lines 78-83) - How synthesis progress callback is used
- `src/server.ts` (lines 68-77) - Error handling pattern with `instanceof Error`
- `.env.template` - Required environment variables (OPENROUTER_API_KEY, ANTHROPIC_API_KEY)
- `PROMPTS.md` (lines 8-37) - Prep Agent prompt specification

### New Files to Create

- `src/utils/logger.ts` - Pino logger setup with child logger factory
- `src/clients/openrouter.ts` - OpenRouter client wrapper using OpenAI SDK
- `src/clients/anthropic.ts` - Anthropic client wrapper with structured output

### Relevant Documentation - READ THESE BEFORE IMPLEMENTING!

- [OpenRouter Quickstart](https://openrouter.ai/docs/quickstart)
  - Section: TypeScript setup with OpenAI SDK
  - Why: Shows exact baseURL and configuration pattern

- [OpenRouter OpenAI SDK Guide](https://openrouter.ai/docs/guides/community/openai-sdk)
  - Section: SDK compatibility details
  - Why: Confirms drop-in replacement approach

- [Anthropic Structured Outputs](https://platform.claude.com/docs/en/docs/build-with-claude/structured-outputs)
  - Section: TypeScript with Zod integration
  - Why: Shows `messages.parse()` and `zodOutputFormat()` usage

- [Pino Logger Guide](https://betterstack.com/community/guides/logging/how-to-install-setup-and-use-pino-to-log-node-js-applications/)
  - Section: Child loggers with context
  - Why: Pattern for request/run ID propagation

- [p-limit GitHub](https://github.com/sindresorhus/p-limit)
  - Section: Basic usage with Promise.all
  - Why: Exact concurrency limiting pattern

### Patterns to Follow

**Type Imports (from synthesis.ts:11-13):**
```typescript
import type { Domain, RawResponse } from '../types';
import { FRAMEWORKS } from '../config/frameworks';
import { MODELS } from '../config/models';
```

**Error Handling (from server.ts:68-77):**
```typescript
catch (error) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  // handle error with message
}
```

**Console Logging Prefix (throughout codebase):**
```typescript
console.log('[stageName] Action description');
// Examples: [prep], [synthesis], [openrouter], [anthropic]
```

**Progress Callback (from pipeline.ts:78-83):**
```typescript
const responses = await generateSynthesisMatrix(
  { query, domains, concurrencyLimit },
  (current, total) => {
    emit('synthesis', 'progress', `${current}/${total} calls completed`, { current, total });
  }
);
```

**Combination Building (from synthesis.ts:81-88):**
```typescript
for (const model of MODELS) {
  for (const framework of FRAMEWORKS) {
    const domain = domains[combinations.length % domains.length];
    combinations.push({ model, framework, domain });
  }
}
```

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation (Dependencies & Logger)

Set up the infrastructure needed by all other components.

**Tasks:**
- Add npm dependencies (p-limit, pino, pino-pretty, zod)
- Create Pino logger utility with child logger factory
- Configure log levels and formatting

### Phase 2: API Clients

Create reusable client wrappers with logging and error handling.

**Tasks:**
- Create OpenRouter client wrapper using OpenAI SDK
- Create Anthropic client wrapper with structured output helper
- Add retry logic to both clients

### Phase 3: Pipeline Stage Implementation

Replace stubs with real implementations.

**Tasks:**
- Implement Prep Agent (Stage 0) with Anthropic structured output
- Implement Synthesis Layer (Stage 1) with OpenRouter + p-limit
- Integrate logging throughout both stages

### Phase 4: Testing & Validation

Verify the implementation works end-to-end.

**Tasks:**
- Test with reduced matrix (3 models × 11 frameworks = 33 calls)
- Verify error handling and retry logic
- Confirm logging output is useful for debugging

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

---

### Task 1: ADD dependencies to package.json

- **IMPLEMENT**: Add p-limit, pino, zod as dependencies; pino-pretty as devDependency
- **PATTERN**: Follow existing package.json structure (lines 16-20)
- **IMPORTS**: N/A
- **GOTCHA**: p-limit v6+ is ESM-only, which is fine since project uses `"type": "module"`
- **VALIDATE**: `bun install && bun run typecheck`

```bash
bun add p-limit pino zod
bun add -d pino-pretty
```

---

### Task 2: CREATE src/utils/logger.ts

- **IMPLEMENT**: Pino logger with:
  - Base logger configured for JSON output
  - `createRunLogger(runId)` factory for child loggers
  - Log level from `LOG_LEVEL` env var (default: 'info')
  - ISO timestamps
  - Helper functions for consistent log structure
- **PATTERN**: Mirror type export style from `src/types.ts`
- **IMPORTS**: `pino`
- **GOTCHA**: Don't use pino-pretty in production - it's for dev only via CLI pipe
- **VALIDATE**: `bun run typecheck`

```typescript
/**
 * ISEE v2 Structured Logger
 *
 * Uses Pino for high-performance JSON logging.
 * Child loggers propagate runId for request tracing.
 */

import pino from 'pino';

// Base logger configuration
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
});

/**
 * Create a child logger with run context.
 * All logs from this logger will include the runId.
 */
export function createRunLogger(runId: string) {
  return logger.child({ runId });
}

/**
 * Logger type for passing to functions.
 */
export type Logger = pino.Logger;

/**
 * Log context for LLM calls.
 */
export interface LLMCallContext {
  stage: 'prep' | 'synthesis';
  model?: string;
  framework?: string;
  domain?: string;
  callIndex?: number;
  attempt?: number;
}

/**
 * Log an LLM call start (debug level).
 */
export function logLLMCallStart(log: Logger, ctx: LLMCallContext) {
  log.debug(ctx, 'LLM call starting');
}

/**
 * Log an LLM call success.
 */
export function logLLMCallSuccess(
  log: Logger,
  ctx: LLMCallContext,
  durationMs: number,
  responseLength: number
) {
  log.info({ ...ctx, durationMs, responseLength, status: 'success' }, 'LLM call completed');
}

/**
 * Log an LLM call failure.
 */
export function logLLMCallError(
  log: Logger,
  ctx: LLMCallContext,
  error: string,
  willRetry: boolean
) {
  const level = willRetry ? 'warn' : 'error';
  log[level]({ ...ctx, error, willRetry, status: 'failed' }, 'LLM call failed');
}

/**
 * Log stage start.
 */
export function logStageStart(log: Logger, stage: string, context: Record<string, unknown>) {
  log.info({ stage, ...context }, `${stage} stage starting`);
}

/**
 * Log stage completion.
 */
export function logStageComplete(
  log: Logger,
  stage: string,
  stats: { durationMs: number; [key: string]: unknown }
) {
  log.info({ stage, ...stats }, `${stage} stage complete`);
}
```

---

### Task 3: CREATE src/clients/openrouter.ts

- **IMPLEMENT**: OpenRouter client wrapper with:
  - OpenAI SDK configured for OpenRouter baseURL
  - `callModel(modelId, prompt)` function
  - Retry-once logic on failure
  - Structured logging integration
- **PATTERN**: Use OpenAI SDK as shown in OpenRouter docs
- **IMPORTS**: `openai`, `../utils/logger`
- **GOTCHA**: Model IDs must use OpenRouter format (e.g., `anthropic/claude-sonnet-4`)
- **VALIDATE**: `bun run typecheck`

```typescript
/**
 * OpenRouter Client
 *
 * Uses OpenAI SDK with OpenRouter baseURL for multi-model access.
 * Includes retry logic and structured logging.
 */

import OpenAI from 'openai';
import type { Logger } from '../utils/logger';
import { logLLMCallStart, logLLMCallSuccess, logLLMCallError } from '../utils/logger';

// Lazy initialization to avoid errors when env vars not set
let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OPENROUTER_API_KEY environment variable is required');
    }
    client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/isee-v2',
        'X-Title': 'ISEE v2',
      },
    });
  }
  return client;
}

export interface OpenRouterCallOptions {
  model: string;           // OpenRouter model ID (e.g., 'anthropic/claude-sonnet-4')
  prompt: string;
  maxTokens?: number;
  logger: Logger;
  context: {
    framework: string;
    domain: string;
    callIndex: number;
  };
}

export interface OpenRouterResult {
  content: string;
  model: string;
  durationMs: number;
  tokens?: number;
}

/**
 * Call an OpenRouter model with retry logic.
 * Retries once on failure before throwing.
 */
export async function callOpenRouter(options: OpenRouterCallOptions): Promise<OpenRouterResult> {
  const { model, prompt, maxTokens = 1500, logger, context } = options;
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const callContext = {
      stage: 'synthesis' as const,
      model,
      framework: context.framework,
      domain: context.domain,
      callIndex: context.callIndex,
      attempt,
    };

    logLLMCallStart(logger, callContext);
    const startTime = Date.now();

    try {
      const completion = await getClient().chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });

      const durationMs = Date.now() - startTime;
      const content = completion.choices[0]?.message?.content || '';
      const tokens = completion.usage?.total_tokens;

      logLLMCallSuccess(logger, callContext, durationMs, content.length);

      return {
        content,
        model,
        durationMs,
        tokens,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const willRetry = attempt < maxAttempts;

      logLLMCallError(logger, callContext, errorMessage, willRetry);

      if (!willRetry) {
        throw new Error(`OpenRouter call failed after ${maxAttempts} attempts: ${errorMessage}`);
      }

      // Brief delay before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // TypeScript requires this, but we'll never reach it
  throw new Error('Unexpected: retry loop completed without result');
}
```

---

### Task 4: CREATE src/clients/anthropic.ts

- **IMPLEMENT**: Anthropic client wrapper with:
  - SDK configured from environment
  - `generateDomains(query)` using structured output with Zod
  - Retry-once logic
  - Structured logging
- **PATTERN**: Use `messages.parse()` with `zodOutputFormat()` per Anthropic docs
- **IMPORTS**: `@anthropic-ai/sdk`, `zod`, `@anthropic-ai/sdk/helpers/zod`, `../utils/logger`
- **GOTCHA**: Structured outputs require specific model versions supporting the feature
- **VALIDATE**: `bun run typecheck`

```typescript
/**
 * Anthropic Client
 *
 * Uses Anthropic SDK with structured output for type-safe responses.
 * Currently used for pipeline agents (Prep, Clustering, etc.)
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { Logger } from '../utils/logger';
import type { Domain } from '../types';
import { logLLMCallStart, logLLMCallSuccess, logLLMCallError } from '../utils/logger';

// Lazy initialization
let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

// Zod schema matching the Domain interface
const DomainSchema = z.object({
  name: z.string(),
  description: z.string(),
  focus: z.string(),
});

const DomainsResponseSchema = z.object({
  domains: z.array(DomainSchema),
});

// Model to use for pipeline agents
const AGENT_MODEL = 'claude-sonnet-4-20250514';

/**
 * Generate knowledge domains for a query using structured output.
 */
export async function generateDomainsWithClaude(
  query: string,
  logger: Logger
): Promise<Domain[]> {
  const maxAttempts = 2;
  const prompt = buildPrepAgentPrompt(query);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const callContext = {
      stage: 'prep' as const,
      model: AGENT_MODEL,
      attempt,
    };

    logLLMCallStart(logger, callContext);
    const startTime = Date.now();

    try {
      const response = await getClient().messages.parse({
        model: AGENT_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
        output_config: { format: zodOutputFormat(DomainsResponseSchema) },
      });

      const durationMs = Date.now() - startTime;
      const domains = response.parsed_output.domains;

      // Validate we got 3-5 domains
      if (domains.length < 3 || domains.length > 5) {
        logger.warn({
          domainCount: domains.length,
          expected: '3-5'
        }, 'Unexpected domain count from Prep Agent');
      }

      logLLMCallSuccess(logger, callContext, durationMs, JSON.stringify(domains).length);

      return domains;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const willRetry = attempt < maxAttempts;

      logLLMCallError(logger, callContext, errorMessage, willRetry);

      if (!willRetry) {
        throw new Error(`Prep Agent failed after ${maxAttempts} attempts: ${errorMessage}`);
      }

      // Brief delay before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Unexpected: retry loop completed without result');
}

/**
 * Build the Prep Agent prompt from PROMPTS.md specification.
 */
function buildPrepAgentPrompt(query: string): string {
  return `You are an expert research strategist. A user has submitted the following query for deep multi-perspective analysis:

QUERY: ${query}

Your task is to identify 3–5 knowledge domains that would provide the most illuminating perspectives on this query.

A good domain is:
- Genuinely relevant to the query's core challenge
- Distinct from the other domains — each should add a different lens
- Specific enough to focus the analysis (not just "Science" but "Behavioral Economics")

Respond with your domains.`;
}
```

---

### Task 5: UPDATE src/pipeline/prep.ts

- **IMPLEMENT**: Replace stub with real implementation:
  - Import and use `generateDomainsWithClaude` from anthropic client
  - Accept optional logger parameter (create default if not provided)
  - Maintain exact same function signature for compatibility
- **PATTERN**: Mirror existing stub structure (lines 19-49)
- **IMPORTS**: `../clients/anthropic`, `../utils/logger`
- **GOTCHA**: Must return `Domain[]` exactly as defined in types.ts
- **VALIDATE**: `bun run typecheck`

```typescript
/**
 * Stage 0: Prep Agent - Dynamic Domain Generation
 *
 * Generates 3-5 knowledge domains specific to the user's query.
 * This is a genuine LLM call that happens first, per query, every time.
 * NO fixed domain list exists anywhere in this codebase.
 *
 * See PROMPTS.md for the full prompt specification.
 */

import type { Domain } from '../types';
import { generateDomainsWithClaude } from '../clients/anthropic';
import { logger as baseLogger, createRunLogger, type Logger } from '../utils/logger';

/**
 * Generate knowledge domains relevant to the given query.
 *
 * @param query - The user's research question
 * @param runLogger - Optional logger with run context (creates default if not provided)
 * @returns Array of 3-5 dynamically generated domains
 */
export async function generateDomains(
  query: string,
  runLogger?: Logger
): Promise<Domain[]> {
  const log = runLogger || baseLogger;

  log.info({ queryPreview: query.substring(0, 100) }, 'Prep agent starting domain generation');

  const domains = await generateDomainsWithClaude(query, log);

  log.info({
    domainCount: domains.length,
    domains: domains.map(d => d.name)
  }, 'Prep agent generated domains');

  return domains;
}
```

---

### Task 6: UPDATE src/pipeline/synthesis.ts

- **IMPLEMENT**: Replace stub with real implementation:
  - Use p-limit for concurrency control
  - Call OpenRouter for each combination
  - Track successful/failed calls
  - Emit progress after each call
  - Continue on individual failures (after retry)
  - Return all successful responses
- **PATTERN**: Keep existing `buildCombinations()` function (lines 77-91)
- **IMPORTS**: `p-limit`, `../clients/openrouter`, `../utils/logger`, `../config/frameworks` (formatFrameworkPrompt)
- **GOTCHA**: Must handle partial failures gracefully - don't fail entire matrix for one bad call
- **VALIDATE**: `bun run typecheck`

```typescript
/**
 * Stage 1: Synthesis Layer - Matrix Generation
 *
 * Generates the raw response matrix by querying multiple LLMs
 * through multiple cognitive frameworks across the generated domains.
 *
 * Target: ~60 responses (6 models × 11 frameworks × ~1 domain sample)
 * All calls run in parallel with concurrency limiting.
 */

import pLimit from 'p-limit';
import type { Domain, RawResponse, CognitiveFramework, SynthesisModel } from '../types';
import { FRAMEWORKS, formatFrameworkPrompt } from '../config/frameworks';
import { MODELS } from '../config/models';
import { callOpenRouter } from '../clients/openrouter';
import { logger as baseLogger, createRunLogger, logStageStart, logStageComplete, type Logger } from '../utils/logger';

interface SynthesisConfig {
  query: string;
  domains: Domain[];
  concurrencyLimit?: number;
  runLogger?: Logger;
}

/**
 * Generate the synthesis matrix.
 *
 * @param config - Query, domains, and execution settings
 * @param onProgress - Callback for progress updates
 * @returns Array of raw responses from all combinations
 */
export async function generateSynthesisMatrix(
  config: SynthesisConfig,
  onProgress?: (current: number, total: number) => void
): Promise<RawResponse[]> {
  const { query, domains, concurrencyLimit = 10, runLogger } = config;
  const log = runLogger || baseLogger;

  // Build combination list
  const combinations = buildCombinations(domains);
  const total = combinations.length;

  logStageStart(log, 'synthesis', {
    totalCalls: total,
    concurrencyLimit,
    models: MODELS.map(m => m.id),
    frameworks: FRAMEWORKS.length,
    domains: domains.map(d => d.name)
  });

  const limit = pLimit(concurrencyLimit);
  const startTime = Date.now();

  // Track results
  let completed = 0;
  let failed = 0;
  const responses: RawResponse[] = [];
  const failures: Array<{ model: string; framework: string; domain: string; error: string }> = [];

  // Create all limited promises
  const promises = combinations.map((combo, index) =>
    limit(async () => {
      const prompt = formatFrameworkPrompt(combo.framework, query, combo.domain.name);

      try {
        const result = await callOpenRouter({
          model: combo.model.openRouterId,
          prompt,
          logger: log,
          context: {
            framework: combo.framework.id,
            domain: combo.domain.name,
            callIndex: index,
          },
        });

        const response: RawResponse = {
          index,
          content: result.content,
          model: combo.model.id,
          framework: combo.framework.id,
          domain: combo.domain.name,
          tokens: result.tokens,
          responseTimeMs: result.durationMs,
        };

        responses.push(response);
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        failures.push({
          model: combo.model.id,
          framework: combo.framework.id,
          domain: combo.domain.name,
          error: errorMessage,
        });
        // Don't throw - continue with remaining calls
      } finally {
        completed++;
        onProgress?.(completed, total);
      }
    })
  );

  // Wait for all to complete
  await Promise.all(promises);

  const durationMs = Date.now() - startTime;

  logStageComplete(log, 'synthesis', {
    durationMs,
    total,
    successful: responses.length,
    failed,
    failures: failures.length > 0 ? failures : undefined,
    avgCallDurationMs: responses.length > 0
      ? Math.round(responses.reduce((sum, r) => sum + (r.responseTimeMs || 0), 0) / responses.length)
      : 0,
  });

  return responses;
}

interface Combination {
  model: SynthesisModel;
  framework: CognitiveFramework;
  domain: Domain;
}

/**
 * Build the list of all combinations to execute.
 * Uses sampling to target ~60 calls rather than full Cartesian product.
 */
function buildCombinations(domains: Domain[]): Combination[] {
  const combinations: Combination[] = [];

  // For each model, use all frameworks with sampled domains
  for (const model of MODELS) {
    for (const framework of FRAMEWORKS) {
      // Sample 1 domain per model/framework pair to keep total reasonable
      // With 6 models × 11 frameworks × 1 domain = 66 combinations
      const domain = domains[combinations.length % domains.length];
      combinations.push({ model, framework, domain });
    }
  }

  return combinations;
}

/**
 * Calculate expected number of API calls for a given configuration.
 */
export function estimateCallCount(domainCount: number): number {
  return MODELS.length * FRAMEWORKS.length; // ~66 with 6 models × 11 frameworks
}
```

---

### Task 7: UPDATE src/pipeline.ts to pass logger

- **IMPLEMENT**: Create run logger and pass to stages:
  - Generate runId at pipeline start
  - Create child logger with runId
  - Pass logger to generateDomains and generateSynthesisMatrix
- **PATTERN**: Follow existing orchestrator structure (lines 31-143)
- **IMPORTS**: Add `createRunLogger` from `./utils/logger`
- **GOTCHA**: Don't break existing progress callback interface
- **VALIDATE**: `bun run typecheck`

Update these sections in pipeline.ts:

```typescript
// Add import at top
import { createRunLogger } from './utils/logger';

// Inside runPipeline function, after startTime declaration:
const runId = crypto.randomUUID();
const runLogger = createRunLogger(runId);

runLogger.info({ query: query.substring(0, 100) }, 'Pipeline starting');

// Update generateDomains call:
const domains = await generateDomains(query, runLogger);

// Update generateSynthesisMatrix call:
const responses = await generateSynthesisMatrix(
  { query, domains, concurrencyLimit, runLogger },
  (current, total) => {
    emit('synthesis', 'progress', `${current}/${total} calls completed`, { current, total });
  }
);

// Add at end before return:
runLogger.info({
  runId,
  totalDurationMs: Date.now() - startTime,
  ideasGenerated: briefing.ideas.length
}, 'Pipeline complete');
```

---

### Task 8: UPDATE .env.template with LOG_LEVEL

- **IMPLEMENT**: Add LOG_LEVEL configuration option
- **PATTERN**: Follow existing env var documentation style
- **VALIDATE**: `cat .env.template` to verify

Add this line:

```
# Logging Configuration
# Options: trace, debug, info, warn, error, fatal
LOG_LEVEL=info
```

---

### Task 9: CREATE test script for reduced matrix

- **IMPLEMENT**: Create a test script that runs with 3 models instead of 6
- **PATTERN**: Similar to existing CLI in pipeline.ts
- **PURPOSE**: Verify implementation before full 66-call runs
- **VALIDATE**: Manual run with `bun run src/test-synthesis.ts`

```typescript
/**
 * Test script for Phase 2 implementation.
 * Runs synthesis with reduced model set (3 models × 11 frameworks = 33 calls)
 */

import { generateDomains } from './pipeline/prep';
import { generateSynthesisMatrix } from './pipeline/synthesis';
import { createRunLogger } from './utils/logger';

// Override MODELS for testing - import and filter
import { MODELS } from './config/models';

async function testSynthesis() {
  const query = 'How might we improve decision-making in complex organizations?';
  const runLogger = createRunLogger('test-run');

  console.log('='.repeat(60));
  console.log('ISEE v2 - Phase 2 Test');
  console.log('='.repeat(60));
  console.log(`Query: ${query}`);
  console.log('');

  // Test Prep Agent
  console.log('Testing Prep Agent...');
  const domains = await generateDomains(query, runLogger);
  console.log(`Generated ${domains.length} domains:`);
  domains.forEach(d => console.log(`  - ${d.name}: ${d.focus}`));
  console.log('');

  // Test Synthesis Layer (full matrix for now, but with progress logging)
  console.log('Testing Synthesis Layer...');
  console.log(`Expected calls: ${MODELS.length} models × 11 frameworks = ${MODELS.length * 11}`);

  const responses = await generateSynthesisMatrix(
    { query, domains, concurrencyLimit: 5, runLogger },
    (current, total) => {
      process.stdout.write(`\rProgress: ${current}/${total}`);
    }
  );

  console.log(''); // newline after progress
  console.log(`Received ${responses.length} responses`);

  // Show sample response
  if (responses.length > 0) {
    const sample = responses[0];
    console.log('');
    console.log('Sample response:');
    console.log(`  Model: ${sample.model}`);
    console.log(`  Framework: ${sample.framework}`);
    console.log(`  Domain: ${sample.domain}`);
    console.log(`  Duration: ${sample.responseTimeMs}ms`);
    console.log(`  Content preview: ${sample.content.substring(0, 200)}...`);
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Test complete!');
}

testSynthesis().catch(console.error);
```

---

## TESTING STRATEGY

### Unit Tests

For Phase 2, focus on integration testing since we're wrapping external APIs. Unit tests can cover:

- `buildCombinations()` function returns correct number of combinations
- Logger helper functions produce expected output structure
- Error handling correctly extracts error messages

### Integration Tests

- **Prep Agent**: Run with sample query, verify 3-5 domains returned with correct structure
- **Synthesis Layer**: Run with 1 model × 2 frameworks × 1 domain = 2 calls, verify responses

### Edge Cases

- Missing API keys → Clear error message
- API rate limiting → Retry succeeds or fails gracefully
- Invalid model ID → Error captured and logged
- Empty response from LLM → Handled without crash
- Partial matrix failure → Remaining responses still returned

---

## VALIDATION COMMANDS

Execute every command to ensure zero regressions and 100% feature correctness.

### Level 1: Syntax & Dependencies

```bash
# Install dependencies
bun install

# Verify no missing dependencies
bun run typecheck
```

### Level 2: Type Checking

```bash
bun run typecheck
```

### Level 3: Linting (if configured)

```bash
bun run lint || echo "Lint not configured"
```

### Level 4: Test Script

```bash
# Requires valid API keys in .env
bun run src/test-synthesis.ts
```

### Level 5: Full Pipeline Test

```bash
# Run full pipeline with verbose logging
LOG_LEVEL=debug bun run pipeline "How can we improve urban transportation?"
```

### Level 6: Pretty Logging (Development)

```bash
# View logs in human-readable format
bun run pipeline "Test query" | npx pino-pretty
```

---

## ACCEPTANCE CRITERIA

- [ ] `bun install` completes without errors
- [ ] `bun run typecheck` passes with zero errors
- [ ] Prep Agent generates 3-5 domains for any query
- [ ] Synthesis Layer produces ~66 responses (or fewer on partial failure)
- [ ] Individual LLM failures don't crash the pipeline
- [ ] Failed calls are retried once before being skipped
- [ ] All API calls are logged with structured context
- [ ] Logs include runId for tracing entire pipeline runs
- [ ] Progress callback fires after each synthesis call
- [ ] Test script completes successfully with valid API keys

---

## COMPLETION CHECKLIST

- [ ] All 9 tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully
- [ ] `bun run typecheck` passes
- [ ] Test script runs end-to-end
- [ ] Logging output is informative for debugging
- [ ] No regressions in existing functionality (server still works)
- [ ] Acceptance criteria all met

---

## NOTES

### Design Decisions

1. **Lazy client initialization**: Clients are initialized on first use, not at import time. This prevents errors when running code that doesn't need API access (e.g., type checking).

2. **Retry once, then continue**: We retry failed calls once, but if they fail again, we skip them rather than crashing. This ensures partial results are better than no results.

3. **Logger passed as parameter**: Rather than global state, we pass loggers explicitly. This enables testing and ensures run context propagates correctly.

4. **Structured output for Prep Agent**: Using Anthropic's structured output feature guarantees valid JSON, eliminating parsing errors and validation code.

### Trade-offs

- **p-limit vs. built-in**: We use p-limit for simplicity. A custom implementation could have more features but would be more code to maintain.

- **Single retry**: We retry once for simplicity. More sophisticated retry (exponential backoff, circuit breaker) could be added later if needed.

- **Full matrix vs. sampling**: We run all 66 combinations by default. For testing, the test script can be modified to use fewer models.

### Future Improvements

- Add exponential backoff for retries
- Implement circuit breaker pattern for repeated failures
- Add cost tracking based on token counts
- Consider streaming responses for faster perceived performance
- Add request timeout configuration
