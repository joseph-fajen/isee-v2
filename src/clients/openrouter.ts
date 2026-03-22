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
  model: string; // OpenRouter model ID (e.g., 'anthropic/claude-sonnet-4')
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
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // TypeScript requires this, but we'll never reach it
  throw new Error('Unexpected: retry loop completed without result');
}
