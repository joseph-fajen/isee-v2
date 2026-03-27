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
import type { Domain, Cluster, SkepticChallenge, ExtractedIdea, DebateEntry, SimplifiedIdea } from '../types';
import { logLLMCallStart, logLLMCallSuccess, logLLMCallError } from '../utils/logger';
import { getTracer } from '../observability/tracing';
import { setLLMAttributes, setLLMResultAttributes, SpanKind } from '../observability/spans';
import { calculateCost } from '../observability/cost';
import { DEFAULT_RETRY_CONFIG, isRetryableError, calculateDelay } from '../resilience/retry';
import { TIMEOUTS, createTimeoutSignal } from '../resilience/timeout';
import { getCircuitBreaker, CircuitOpenError } from '../resilience/circuit-breaker';
import { logLlmCall } from '../db/llm-calls';
import {
  buildPrepAgentPrompt,
  buildClusteringPrompt,
  buildAdvocatePrompt,
  buildSkepticPrompt,
  buildRebuttalPrompt,
  buildSynthesisPrompt,
  buildTranslationPrompt,
  buildAssessmentPrompt,
  buildQuestionGeneratorPrompt,
  buildRewriterPrompt,
} from '../config/prompts';

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

// Translation Agent schemas
const SimplifiedIdeaSchema = z.object({
  title: z.string(),
  explanation: z.string(),
  whyForYou: z.string(),
  actionItems: z.array(z.string()).min(2, 'Must have at least 2 action items'),
});

const TranslatedBriefingResponseSchema = z.object({
  queryPlainLanguage: z.string(),
  ideas: z.array(SimplifiedIdeaSchema),
});

// Query Refinement schemas
const QueryAssessmentSchema = z.object({
  sufficient: z.boolean(),
  missingCriteria: z.array(z.enum(['decision', 'constraints', 'perspective', 'openness'])),
  reasoning: z.string(),
});

const RefinementQuestionsSchema = z.object({
  questions: z.array(z.object({
    targetsCriterion: z.enum(['decision', 'constraints', 'perspective', 'openness']),
    question: z.string(),
  })),
});

// Model to use for pipeline agents
// Must be a model that supports structured outputs (claude-sonnet-4-5, claude-sonnet-4-6, etc.)
const AGENT_MODEL = 'claude-sonnet-4-5';

// Circuit breaker for all Anthropic API calls
const getBreaker = () => getCircuitBreaker('anthropic');

/**
 * Generate knowledge domains for a query using structured output.
 */
export async function generateDomainsWithClaude(query: string, logger: Logger, runId?: string): Promise<Domain[]> {
  const maxAttempts = DEFAULT_RETRY_CONFIG.maxAttempts;
  const prompt = buildPrepAgentPrompt({ query });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const callContext = {
      stage: 'prep' as const,
      model: AGENT_MODEL,
      attempt,
    };

    logLLMCallStart(logger, callContext);
    const startTime = Date.now();
    const span = getTracer().startSpan('isee.llm.call', { kind: SpanKind.CLIENT });
    setLLMAttributes(span, { provider: 'anthropic', model: AGENT_MODEL, stage: 'prep' });

    try {
      const response = await getBreaker().execute(() => getClient().messages.parse(
        {
          model: AGENT_MODEL,
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
          output_config: { format: zodOutputFormat(DomainsResponseSchema) },
        },
        { signal: createTimeoutSignal(TIMEOUTS.LLM_CALL_MS) }
      ));

      const durationMs = Date.now() - startTime;

      if (!response.parsed_output) {
        throw new Error('Prep Agent returned no structured output');
      }

      const domains = response.parsed_output.domains;

      // Validate we got 3-5 domains
      if (domains.length < 3 || domains.length > 5) {
        logger.warn(
          {
            domainCount: domains.length,
            expected: '3-5',
          },
          'Unexpected domain count from Prep Agent'
        );
      }

      const inputTokens = response.usage?.input_tokens;
      const outputTokens = response.usage?.output_tokens;
      const costUsd = (inputTokens && outputTokens) ? calculateCost(AGENT_MODEL, inputTokens, outputTokens) : undefined;
      setLLMResultAttributes(span, { inputTokens, outputTokens, costUsd, latencyMs: durationMs, success: true });
      logLLMCallSuccess(logger, callContext, durationMs, JSON.stringify(domains).length);

      if (runId) {
        logLlmCall({ runId, stage: 'prep', provider: 'anthropic', model: AGENT_MODEL, inputTokens, outputTokens, latencyMs: durationMs, success: true, costUsd, timestamp: new Date().toISOString() });
      }

      return domains;
    } catch (error) {
      if (error instanceof CircuitOpenError) throw error;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const willRetry = attempt < maxAttempts && isRetryableError(error);

      setLLMResultAttributes(span, { latencyMs: Date.now() - startTime, success: false, error: errorMessage });
      logLLMCallError(logger, callContext, errorMessage, willRetry);

      if (!willRetry) {
        if (runId) {
          logLlmCall({ runId, stage: 'prep', provider: 'anthropic', model: AGENT_MODEL, latencyMs: Date.now() - startTime, success: false, errorType: error instanceof Error ? error.constructor.name : 'Error', errorMessage, timestamp: new Date().toISOString() });
        }
        throw new Error(`Prep Agent failed after ${maxAttempts} attempts: ${errorMessage}`);
      }

      // Brief delay before retry
      await new Promise((resolve) => setTimeout(resolve, calculateDelay(attempt, DEFAULT_RETRY_CONFIG)));
    } finally {
      span.end();
    }
  }

  throw new Error('Unexpected: retry loop completed without result');
}

/**
 * Cluster responses by intellectual angle using structured output.
 */
export async function clusterResponsesWithClaude(
  query: string,
  anonymizedResponses: Array<{ index: number; content: string }>,
  logger: Logger,
  runId?: string
): Promise<Cluster[]> {
  const maxAttempts = DEFAULT_RETRY_CONFIG.maxAttempts;
  const prompt = buildClusteringPrompt({ query, responses: anonymizedResponses });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const callContext = {
      stage: 'clustering' as const,
      model: AGENT_MODEL,
      attempt,
    };

    logLLMCallStart(logger, callContext);
    const startTime = Date.now();
    const span = getTracer().startSpan('isee.llm.call', { kind: SpanKind.CLIENT });
    setLLMAttributes(span, { provider: 'anthropic', model: AGENT_MODEL, stage: 'clustering' });

    try {
      const response = await getBreaker().execute(() => getClient().messages.parse(
        {
          model: AGENT_MODEL,
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
          output_config: { format: zodOutputFormat(ClusteringResponseSchema) },
        },
        { signal: createTimeoutSignal(TIMEOUTS.LLM_CALL_MS) }
      ));

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

      const inputTokens = response.usage?.input_tokens;
      const outputTokens = response.usage?.output_tokens;
      const costUsd = (inputTokens && outputTokens) ? calculateCost(AGENT_MODEL, inputTokens, outputTokens) : undefined;
      setLLMResultAttributes(span, { inputTokens, outputTokens, costUsd, latencyMs: durationMs, success: true });
      logLLMCallSuccess(logger, callContext, durationMs, JSON.stringify(clusters).length);

      if (runId) {
        logLlmCall({ runId, stage: 'clustering', provider: 'anthropic', model: AGENT_MODEL, inputTokens, outputTokens, latencyMs: durationMs, success: true, costUsd, timestamp: new Date().toISOString() });
      }

      return clusters;
    } catch (error) {
      if (error instanceof CircuitOpenError) throw error;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const willRetry = attempt < maxAttempts && isRetryableError(error);

      setLLMResultAttributes(span, { latencyMs: Date.now() - startTime, success: false, error: errorMessage });
      logLLMCallError(logger, callContext, errorMessage, willRetry);

      if (!willRetry) {
        if (runId) {
          logLlmCall({ runId, stage: 'clustering', provider: 'anthropic', model: AGENT_MODEL, latencyMs: Date.now() - startTime, success: false, errorType: error instanceof Error ? error.constructor.name : 'Error', errorMessage, timestamp: new Date().toISOString() });
        }
        throw new Error(`Clustering Agent failed after ${maxAttempts} attempts: ${errorMessage}`);
      }

      await new Promise((resolve) => setTimeout(resolve, calculateDelay(attempt, DEFAULT_RETRY_CONFIG)));
    } finally {
      span.end();
    }
  }

  throw new Error('Unexpected: retry loop completed without result');
}

/**
 * Generate an advocate argument for a cluster (prose output).
 */
export async function generateAdvocateArgument(
  query: string,
  clusterName: string,
  clusterSummary: string,
  topMemberResponses: string[],
  logger: Logger,
  runId?: string,
  clusterId?: number
): Promise<string> {
  const maxAttempts = DEFAULT_RETRY_CONFIG.maxAttempts;
  const prompt = buildAdvocatePrompt({ query, clusterName, clusterSummary, topMemberResponses });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const callContext = {
      stage: 'advocate' as const,
      model: AGENT_MODEL,
      attempt,
    };

    logLLMCallStart(logger, callContext);
    const startTime = Date.now();
    const span = getTracer().startSpan('isee.llm.call', { kind: SpanKind.CLIENT });
    setLLMAttributes(span, { provider: 'anthropic', model: AGENT_MODEL, stage: 'advocate' });

    try {
      const response = await getBreaker().execute(() => getClient().messages.create(
        {
          model: AGENT_MODEL,
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        },
        { signal: createTimeoutSignal(TIMEOUTS.LLM_CALL_MS) }
      ));

      const durationMs = Date.now() - startTime;
      const textBlock = response.content[0];
      const text = textBlock.type === 'text' ? textBlock.text : '';

      if (!text) {
        throw new Error('Advocate returned empty response');
      }

      const inputTokens = response.usage?.input_tokens;
      const outputTokens = response.usage?.output_tokens;
      const costUsd = (inputTokens && outputTokens) ? calculateCost(AGENT_MODEL, inputTokens, outputTokens) : undefined;
      setLLMResultAttributes(span, { inputTokens, outputTokens, costUsd, latencyMs: durationMs, success: true });
      logLLMCallSuccess(logger, callContext, durationMs, text.length);

      if (runId) {
        logLlmCall({ runId, stage: 'advocate', provider: 'anthropic', model: AGENT_MODEL, inputTokens, outputTokens, latencyMs: durationMs, success: true, costUsd, clusterId, timestamp: new Date().toISOString() });
      }

      return text;
    } catch (error) {
      if (error instanceof CircuitOpenError) throw error;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const willRetry = attempt < maxAttempts && isRetryableError(error);

      setLLMResultAttributes(span, { latencyMs: Date.now() - startTime, success: false, error: errorMessage });
      logLLMCallError(logger, callContext, errorMessage, willRetry);

      if (!willRetry) {
        if (runId) {
          logLlmCall({ runId, stage: 'advocate', provider: 'anthropic', model: AGENT_MODEL, latencyMs: Date.now() - startTime, success: false, errorType: error instanceof Error ? error.constructor.name : 'Error', errorMessage, clusterId, timestamp: new Date().toISOString() });
        }
        throw new Error(`Advocate failed after ${maxAttempts} attempts: ${errorMessage}`);
      }

      await new Promise((resolve) => setTimeout(resolve, calculateDelay(attempt, DEFAULT_RETRY_CONFIG)));
    } finally {
      span.end();
    }
  }

  throw new Error('Unexpected: retry loop completed without result');
}

/**
 * Generate skeptic challenges for all advocate arguments (structured output).
 */
export async function generateSkepticChallenges(
  query: string,
  advocateArguments: Array<{ clusterId: number; clusterName: string; argument: string }>,
  logger: Logger,
  runId?: string
): Promise<SkepticChallenge[]> {
  const maxAttempts = DEFAULT_RETRY_CONFIG.maxAttempts;
  const prompt = buildSkepticPrompt({ query, advocateArguments });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const callContext = {
      stage: 'skeptic' as const,
      model: AGENT_MODEL,
      attempt,
    };

    logLLMCallStart(logger, callContext);
    const startTime = Date.now();
    const span = getTracer().startSpan('isee.llm.call', { kind: SpanKind.CLIENT });
    setLLMAttributes(span, { provider: 'anthropic', model: AGENT_MODEL, stage: 'skeptic' });

    try {
      const response = await getBreaker().execute(() => getClient().messages.parse(
        {
          model: AGENT_MODEL,
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
          output_config: { format: zodOutputFormat(SkepticChallengesResponseSchema) },
        },
        { signal: createTimeoutSignal(TIMEOUTS.LLM_CALL_MS) }
      ));

      const durationMs = Date.now() - startTime;

      if (!response.parsed_output) {
        throw new Error('Skeptic Agent returned no structured output');
      }

      const challenges = response.parsed_output.challenges;

      const inputTokens = response.usage?.input_tokens;
      const outputTokens = response.usage?.output_tokens;
      const costUsd = (inputTokens && outputTokens) ? calculateCost(AGENT_MODEL, inputTokens, outputTokens) : undefined;
      setLLMResultAttributes(span, { inputTokens, outputTokens, costUsd, latencyMs: durationMs, success: true });
      logLLMCallSuccess(logger, callContext, durationMs, JSON.stringify(challenges).length);

      if (runId) {
        logLlmCall({ runId, stage: 'skeptic', provider: 'anthropic', model: AGENT_MODEL, inputTokens, outputTokens, latencyMs: durationMs, success: true, costUsd, timestamp: new Date().toISOString() });
      }

      return challenges;
    } catch (error) {
      if (error instanceof CircuitOpenError) throw error;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const willRetry = attempt < maxAttempts && isRetryableError(error);

      setLLMResultAttributes(span, { latencyMs: Date.now() - startTime, success: false, error: errorMessage });
      logLLMCallError(logger, callContext, errorMessage, willRetry);

      if (!willRetry) {
        if (runId) {
          logLlmCall({ runId, stage: 'skeptic', provider: 'anthropic', model: AGENT_MODEL, latencyMs: Date.now() - startTime, success: false, errorType: error instanceof Error ? error.constructor.name : 'Error', errorMessage, timestamp: new Date().toISOString() });
        }
        throw new Error(`Skeptic Agent failed after ${maxAttempts} attempts: ${errorMessage}`);
      }

      await new Promise((resolve) => setTimeout(resolve, calculateDelay(attempt, DEFAULT_RETRY_CONFIG)));
    } finally {
      span.end();
    }
  }

  throw new Error('Unexpected: retry loop completed without result');
}

/**
 * Generate a rebuttal to a skeptic challenge (prose output).
 */
export async function generateRebuttal(
  query: string,
  clusterName: string,
  advocateArgument: string,
  skepticChallenge: string,
  logger: Logger,
  runId?: string,
  clusterId?: number
): Promise<string> {
  const maxAttempts = DEFAULT_RETRY_CONFIG.maxAttempts;
  const prompt = buildRebuttalPrompt({ query, clusterName, advocateArgument, skepticChallenge });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const callContext = {
      stage: 'rebuttal' as const,
      model: AGENT_MODEL,
      attempt,
    };

    logLLMCallStart(logger, callContext);
    const startTime = Date.now();
    const span = getTracer().startSpan('isee.llm.call', { kind: SpanKind.CLIENT });
    setLLMAttributes(span, { provider: 'anthropic', model: AGENT_MODEL, stage: 'rebuttal' });

    try {
      const response = await getBreaker().execute(() => getClient().messages.create(
        {
          model: AGENT_MODEL,
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        },
        { signal: createTimeoutSignal(TIMEOUTS.LLM_CALL_MS) }
      ));

      const durationMs = Date.now() - startTime;
      const textBlock = response.content[0];
      const text = textBlock.type === 'text' ? textBlock.text : '';

      if (!text) {
        throw new Error('Rebuttal returned empty response');
      }

      const inputTokens = response.usage?.input_tokens;
      const outputTokens = response.usage?.output_tokens;
      const costUsd = (inputTokens && outputTokens) ? calculateCost(AGENT_MODEL, inputTokens, outputTokens) : undefined;
      setLLMResultAttributes(span, { inputTokens, outputTokens, costUsd, latencyMs: durationMs, success: true });
      logLLMCallSuccess(logger, callContext, durationMs, text.length);

      if (runId) {
        logLlmCall({ runId, stage: 'rebuttal', provider: 'anthropic', model: AGENT_MODEL, inputTokens, outputTokens, latencyMs: durationMs, success: true, costUsd, clusterId, timestamp: new Date().toISOString() });
      }

      return text;
    } catch (error) {
      if (error instanceof CircuitOpenError) throw error;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const willRetry = attempt < maxAttempts && isRetryableError(error);

      setLLMResultAttributes(span, { latencyMs: Date.now() - startTime, success: false, error: errorMessage });
      logLLMCallError(logger, callContext, errorMessage, willRetry);

      if (!willRetry) {
        if (runId) {
          logLlmCall({ runId, stage: 'rebuttal', provider: 'anthropic', model: AGENT_MODEL, latencyMs: Date.now() - startTime, success: false, errorType: error instanceof Error ? error.constructor.name : 'Error', errorMessage, clusterId, timestamp: new Date().toISOString() });
        }
        throw new Error(`Rebuttal failed after ${maxAttempts} attempts: ${errorMessage}`);
      }

      await new Promise((resolve) => setTimeout(resolve, calculateDelay(attempt, DEFAULT_RETRY_CONFIG)));
    } finally {
      span.end();
    }
  }

  throw new Error('Unexpected: retry loop completed without result');
}

/**
 * Assess query quality against the 4 criteria (structured output).
 */
export async function assessQueryQuality(
  query: string,
  logger: Logger,
  runId?: string
): Promise<{ sufficient: boolean; missingCriteria: string[]; reasoning: string }> {
  const maxAttempts = DEFAULT_RETRY_CONFIG.maxAttempts;
  const prompt = buildAssessmentPrompt({ query });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const callContext = { stage: 'refinement' as const, model: AGENT_MODEL, attempt };
    logLLMCallStart(logger, callContext);
    const startTime = Date.now();
    const span = getTracer().startSpan('isee.llm.call', { kind: SpanKind.CLIENT });
    setLLMAttributes(span, { provider: 'anthropic', model: AGENT_MODEL, stage: 'refinement' });

    try {
      const response = await getBreaker().execute(() => getClient().messages.parse(
        {
          model: AGENT_MODEL,
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
          output_config: { format: zodOutputFormat(QueryAssessmentSchema) },
        },
        { signal: createTimeoutSignal(TIMEOUTS.LLM_CALL_MS) }
      ));

      const durationMs = Date.now() - startTime;
      if (!response.parsed_output) throw new Error('Assessment returned no structured output');

      const inputTokens = response.usage?.input_tokens;
      const outputTokens = response.usage?.output_tokens;
      const costUsd = (inputTokens && outputTokens) ? calculateCost(AGENT_MODEL, inputTokens, outputTokens) : undefined;
      setLLMResultAttributes(span, { inputTokens, outputTokens, costUsd, latencyMs: durationMs, success: true });
      logLLMCallSuccess(logger, callContext, durationMs, JSON.stringify(response.parsed_output).length);
      if (runId) {
        logLlmCall({ runId, stage: 'refinement', provider: 'anthropic', model: AGENT_MODEL, inputTokens, outputTokens, latencyMs: durationMs, success: true, costUsd, timestamp: new Date().toISOString() });
      }
      return response.parsed_output;
    } catch (error) {
      if (error instanceof CircuitOpenError) throw error;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const willRetry = attempt < maxAttempts && isRetryableError(error);
      setLLMResultAttributes(span, { latencyMs: Date.now() - startTime, success: false, error: errorMessage });
      logLLMCallError(logger, callContext, errorMessage, willRetry);
      if (!willRetry) {
        if (runId) {
          logLlmCall({ runId, stage: 'refinement', provider: 'anthropic', model: AGENT_MODEL, latencyMs: Date.now() - startTime, success: false, errorType: error instanceof Error ? error.constructor.name : 'Error', errorMessage, timestamp: new Date().toISOString() });
        }
        throw new Error(`Query assessment failed after ${maxAttempts} attempts: ${errorMessage}`);
      }
      await new Promise(resolve => setTimeout(resolve, calculateDelay(attempt, DEFAULT_RETRY_CONFIG)));
    } finally {
      span.end();
    }
  }
  throw new Error('Unexpected: retry loop completed without result');
}

/**
 * Generate follow-up questions for missing criteria (structured output).
 */
export async function generateRefinementQuestions(
  query: string,
  missingCriteria: string[],
  logger: Logger,
  runId?: string
): Promise<Array<{ targetsCriterion: string; question: string }>> {
  const maxAttempts = DEFAULT_RETRY_CONFIG.maxAttempts;
  const prompt = buildQuestionGeneratorPrompt({ query, missingCriteria });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const callContext = { stage: 'refinement' as const, model: AGENT_MODEL, attempt };
    logLLMCallStart(logger, callContext);
    const startTime = Date.now();
    const span = getTracer().startSpan('isee.llm.call', { kind: SpanKind.CLIENT });
    setLLMAttributes(span, { provider: 'anthropic', model: AGENT_MODEL, stage: 'refinement' });

    try {
      const response = await getBreaker().execute(() => getClient().messages.parse(
        {
          model: AGENT_MODEL,
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
          output_config: { format: zodOutputFormat(RefinementQuestionsSchema) },
        },
        { signal: createTimeoutSignal(TIMEOUTS.LLM_CALL_MS) }
      ));

      const durationMs = Date.now() - startTime;
      if (!response.parsed_output) throw new Error('Question generator returned no structured output');

      const inputTokens = response.usage?.input_tokens;
      const outputTokens = response.usage?.output_tokens;
      const costUsd = (inputTokens && outputTokens) ? calculateCost(AGENT_MODEL, inputTokens, outputTokens) : undefined;
      setLLMResultAttributes(span, { inputTokens, outputTokens, costUsd, latencyMs: durationMs, success: true });
      logLLMCallSuccess(logger, callContext, durationMs, JSON.stringify(response.parsed_output).length);
      if (runId) {
        logLlmCall({ runId, stage: 'refinement', provider: 'anthropic', model: AGENT_MODEL, inputTokens, outputTokens, latencyMs: durationMs, success: true, costUsd, timestamp: new Date().toISOString() });
      }
      return response.parsed_output.questions;
    } catch (error) {
      if (error instanceof CircuitOpenError) throw error;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const willRetry = attempt < maxAttempts && isRetryableError(error);
      setLLMResultAttributes(span, { latencyMs: Date.now() - startTime, success: false, error: errorMessage });
      logLLMCallError(logger, callContext, errorMessage, willRetry);
      if (!willRetry) {
        if (runId) {
          logLlmCall({ runId, stage: 'refinement', provider: 'anthropic', model: AGENT_MODEL, latencyMs: Date.now() - startTime, success: false, errorType: error instanceof Error ? error.constructor.name : 'Error', errorMessage, timestamp: new Date().toISOString() });
        }
        throw new Error(`Question generation failed after ${maxAttempts} attempts: ${errorMessage}`);
      }
      await new Promise(resolve => setTimeout(resolve, calculateDelay(attempt, DEFAULT_RETRY_CONFIG)));
    } finally {
      span.end();
    }
  }
  throw new Error('Unexpected: retry loop completed without result');
}

/**
 * Rewrite query using original + user answers (prose output).
 */
export async function rewriteQuery(
  originalQuery: string,
  answers: Array<{ question: string; answer: string }>,
  logger: Logger,
  runId?: string
): Promise<string> {
  const maxAttempts = DEFAULT_RETRY_CONFIG.maxAttempts;
  const prompt = buildRewriterPrompt({ originalQuery, answers });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const callContext = { stage: 'refinement' as const, model: AGENT_MODEL, attempt };
    logLLMCallStart(logger, callContext);
    const startTime = Date.now();
    const span = getTracer().startSpan('isee.llm.call', { kind: SpanKind.CLIENT });
    setLLMAttributes(span, { provider: 'anthropic', model: AGENT_MODEL, stage: 'refinement' });

    try {
      const response = await getBreaker().execute(() => getClient().messages.create(
        {
          model: AGENT_MODEL,
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
        },
        { signal: createTimeoutSignal(TIMEOUTS.LLM_CALL_MS) }
      ));

      const durationMs = Date.now() - startTime;
      const textBlock = response.content[0];
      const text = textBlock.type === 'text' ? textBlock.text : '';
      if (!text) throw new Error('Rewriter returned empty response');

      const inputTokens = response.usage?.input_tokens;
      const outputTokens = response.usage?.output_tokens;
      const costUsd = (inputTokens && outputTokens) ? calculateCost(AGENT_MODEL, inputTokens, outputTokens) : undefined;
      setLLMResultAttributes(span, { inputTokens, outputTokens, costUsd, latencyMs: durationMs, success: true });
      logLLMCallSuccess(logger, callContext, durationMs, text.length);
      if (runId) {
        logLlmCall({ runId, stage: 'refinement', provider: 'anthropic', model: AGENT_MODEL, inputTokens, outputTokens, latencyMs: durationMs, success: true, costUsd, timestamp: new Date().toISOString() });
      }
      return text.trim();
    } catch (error) {
      if (error instanceof CircuitOpenError) throw error;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const willRetry = attempt < maxAttempts && isRetryableError(error);
      setLLMResultAttributes(span, { latencyMs: Date.now() - startTime, success: false, error: errorMessage });
      logLLMCallError(logger, callContext, errorMessage, willRetry);
      if (!willRetry) {
        if (runId) {
          logLlmCall({ runId, stage: 'refinement', provider: 'anthropic', model: AGENT_MODEL, latencyMs: Date.now() - startTime, success: false, errorType: error instanceof Error ? error.constructor.name : 'Error', errorMessage, timestamp: new Date().toISOString() });
        }
        throw new Error(`Query rewrite failed after ${maxAttempts} attempts: ${errorMessage}`);
      }
      await new Promise(resolve => setTimeout(resolve, calculateDelay(attempt, DEFAULT_RETRY_CONFIG)));
    } finally {
      span.end();
    }
  }
  throw new Error('Unexpected: retry loop completed without result');
}

/**
 * Generate the final briefing by selecting 3 ideas from the debate (structured output).
 */
export async function generateBriefingWithClaude(
  query: string,
  debateEntries: DebateEntry[],
  logger: Logger,
  runId?: string
): Promise<ExtractedIdea[]> {
  const maxAttempts = DEFAULT_RETRY_CONFIG.maxAttempts;
  const prompt = buildSynthesisPrompt({ query, debateEntries });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const callContext = {
      stage: 'synthesizer' as const,
      model: AGENT_MODEL,
      attempt,
    };

    logLLMCallStart(logger, callContext);
    const startTime = Date.now();
    const span = getTracer().startSpan('isee.llm.call', { kind: SpanKind.CLIENT });
    setLLMAttributes(span, { provider: 'anthropic', model: AGENT_MODEL, stage: 'synthesizer' });

    try {
      const response = await getBreaker().execute(() => getClient().messages.parse(
        {
          model: AGENT_MODEL,
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
          output_config: { format: zodOutputFormat(BriefingResponseSchema) },
        },
        { signal: createTimeoutSignal(TIMEOUTS.LLM_CALL_MS) }
      ));

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

      const inputTokens = response.usage?.input_tokens;
      const outputTokens = response.usage?.output_tokens;
      const costUsd = (inputTokens && outputTokens) ? calculateCost(AGENT_MODEL, inputTokens, outputTokens) : undefined;
      setLLMResultAttributes(span, { inputTokens, outputTokens, costUsd, latencyMs: durationMs, success: true });
      logLLMCallSuccess(logger, callContext, durationMs, JSON.stringify(ideas).length);

      if (runId) {
        logLlmCall({ runId, stage: 'synthesizer', provider: 'anthropic', model: AGENT_MODEL, inputTokens, outputTokens, latencyMs: durationMs, success: true, costUsd, timestamp: new Date().toISOString() });
      }

      return ideas;
    } catch (error) {
      if (error instanceof CircuitOpenError) throw error;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const willRetry = attempt < maxAttempts && isRetryableError(error);

      setLLMResultAttributes(span, { latencyMs: Date.now() - startTime, success: false, error: errorMessage });
      logLLMCallError(logger, callContext, errorMessage, willRetry);

      if (!willRetry) {
        if (runId) {
          logLlmCall({ runId, stage: 'synthesizer', provider: 'anthropic', model: AGENT_MODEL, latencyMs: Date.now() - startTime, success: false, errorType: error instanceof Error ? error.constructor.name : 'Error', errorMessage, timestamp: new Date().toISOString() });
        }
        throw new Error(`Synthesis Agent failed after ${maxAttempts} attempts: ${errorMessage}`);
      }

      await new Promise((resolve) => setTimeout(resolve, calculateDelay(attempt, DEFAULT_RETRY_CONFIG)));
    } finally {
      span.end();
    }
  }

  throw new Error('Unexpected: retry loop completed without result');
}

/**
 * Translate the briefing into plain language with action items (structured output).
 */
export async function translateBriefingWithClaude(
  query: string,
  ideas: ExtractedIdea[],
  logger: Logger,
  runId?: string
): Promise<{ queryPlainLanguage: string; ideas: SimplifiedIdea[] }> {
  const maxAttempts = DEFAULT_RETRY_CONFIG.maxAttempts;
  const prompt = buildTranslationPrompt({ query, ideas });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const callContext = {
      stage: 'translation' as const,
      model: AGENT_MODEL,
      attempt,
    };

    logLLMCallStart(logger, callContext);
    const startTime = Date.now();
    const span = getTracer().startSpan('isee.llm.call', { kind: SpanKind.CLIENT });
    setLLMAttributes(span, { provider: 'anthropic', model: AGENT_MODEL, stage: 'translation' });

    try {
      const response = await getBreaker().execute(() => getClient().messages.parse(
        {
          model: AGENT_MODEL,
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
          output_config: { format: zodOutputFormat(TranslatedBriefingResponseSchema) },
        },
        { signal: createTimeoutSignal(TIMEOUTS.LLM_CALL_MS) }
      ));

      const durationMs = Date.now() - startTime;

      if (!response.parsed_output) {
        throw new Error('Translation Agent returned no structured output');
      }

      const result = response.parsed_output;

      // Validate we got 3 translated ideas
      if (result.ideas.length !== 3) {
        logger.warn(
          { ideaCount: result.ideas.length, expected: 3 },
          'Unexpected idea count from Translation Agent'
        );
      }

      const inputTokens = response.usage?.input_tokens;
      const outputTokens = response.usage?.output_tokens;
      const costUsd = (inputTokens && outputTokens) ? calculateCost(AGENT_MODEL, inputTokens, outputTokens) : undefined;
      setLLMResultAttributes(span, { inputTokens, outputTokens, costUsd, latencyMs: durationMs, success: true });
      logLLMCallSuccess(logger, callContext, durationMs, JSON.stringify(result).length);

      if (runId) {
        logLlmCall({ runId, stage: 'translation', provider: 'anthropic', model: AGENT_MODEL, inputTokens, outputTokens, latencyMs: durationMs, success: true, costUsd, timestamp: new Date().toISOString() });
      }

      return result;
    } catch (error) {
      if (error instanceof CircuitOpenError) throw error;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const willRetry = attempt < maxAttempts && isRetryableError(error);

      setLLMResultAttributes(span, { latencyMs: Date.now() - startTime, success: false, error: errorMessage });
      logLLMCallError(logger, callContext, errorMessage, willRetry);

      if (!willRetry) {
        if (runId) {
          logLlmCall({ runId, stage: 'translation', provider: 'anthropic', model: AGENT_MODEL, latencyMs: Date.now() - startTime, success: false, errorType: error instanceof Error ? error.constructor.name : 'Error', errorMessage, timestamp: new Date().toISOString() });
        }
        throw new Error(`Translation Agent failed after ${maxAttempts} attempts: ${errorMessage}`);
      }

      await new Promise((resolve) => setTimeout(resolve, calculateDelay(attempt, DEFAULT_RETRY_CONFIG)));
    } finally {
      span.end();
    }
  }

  throw new Error('Unexpected: retry loop completed without result');
}

