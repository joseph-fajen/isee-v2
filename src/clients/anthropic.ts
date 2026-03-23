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
import type { Domain, Cluster, SkepticChallenge, ExtractedIdea, DebateEntry } from '../types';
import { logLLMCallStart, logLLMCallSuccess, logLLMCallError } from '../utils/logger';
import {
  buildPrepAgentPrompt,
  buildClusteringPrompt,
  buildAdvocatePrompt,
  buildSkepticPrompt,
  buildRebuttalPrompt,
  buildSynthesisPrompt,
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

// Model to use for pipeline agents
// Must be a model that supports structured outputs (claude-sonnet-4-5, claude-sonnet-4-6, etc.)
const AGENT_MODEL = 'claude-sonnet-4-5';

/**
 * Generate knowledge domains for a query using structured output.
 */
export async function generateDomainsWithClaude(query: string, logger: Logger): Promise<Domain[]> {
  const maxAttempts = 2;
  const prompt = buildPrepAgentPrompt({ query });

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
      await new Promise((resolve) => setTimeout(resolve, 1000));
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
  logger: Logger
): Promise<Cluster[]> {
  const maxAttempts = 2;
  const prompt = buildClusteringPrompt({ query, responses: anonymizedResponses });

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
  const prompt = buildAdvocatePrompt({ query, clusterName, clusterSummary, topMemberResponses });

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
 * Generate skeptic challenges for all advocate arguments (structured output).
 */
export async function generateSkepticChallenges(
  query: string,
  advocateArguments: Array<{ clusterId: number; clusterName: string; argument: string }>,
  logger: Logger
): Promise<SkepticChallenge[]> {
  const maxAttempts = 2;
  const prompt = buildSkepticPrompt({ query, advocateArguments });

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
  const prompt = buildRebuttalPrompt({ query, clusterName, advocateArgument, skepticChallenge });

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
 * Generate the final briefing by selecting 3 ideas from the debate (structured output).
 */
export async function generateBriefingWithClaude(
  query: string,
  debateEntries: DebateEntry[],
  logger: Logger
): Promise<ExtractedIdea[]> {
  const maxAttempts = 2;
  const prompt = buildSynthesisPrompt({ query, debateEntries });

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

