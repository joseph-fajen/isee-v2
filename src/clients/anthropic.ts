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
// Must be a model that supports structured outputs (claude-sonnet-4-5, claude-sonnet-4-6, etc.)
const AGENT_MODEL = 'claude-sonnet-4-5';

/**
 * Generate knowledge domains for a query using structured output.
 */
export async function generateDomainsWithClaude(query: string, logger: Logger): Promise<Domain[]> {
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
