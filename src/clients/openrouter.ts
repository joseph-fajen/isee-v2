/**
 * OpenRouter Client
 *
 * Uses OpenAI SDK with OpenRouter baseURL for multi-model access.
 * Includes retry logic and structured logging.
 */

import OpenAI from 'openai';
import type { Logger } from '../utils/logger';
import { logLLMCallStart, logLLMCallSuccess, logLLMCallError } from '../utils/logger';
import { getTracer } from '../observability/tracing';
import { setLLMAttributes, setLLMResultAttributes, SpanKind } from '../observability/spans';
import { calculateCost } from '../observability/cost';
import { DEFAULT_RETRY_CONFIG, isRetryableError, calculateDelay } from '../resilience/retry';

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
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

/**
 * Call an OpenRouter model with retry logic.
 * Retries once on failure before throwing.
 */
export async function callOpenRouter(options: OpenRouterCallOptions): Promise<OpenRouterResult> {
  const { model, prompt, maxTokens = 1500, logger, context } = options;
  const maxAttempts = DEFAULT_RETRY_CONFIG.maxAttempts;

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

    const span = getTracer().startSpan('isee.llm.call', { kind: SpanKind.CLIENT });
    setLLMAttributes(span, {
      provider: 'openrouter',
      model,
      framework: context.framework,
      domain: context.domain,
      stage: 'synthesis',
    });

    try {
      const completion = await getClient().chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });

      const durationMs = Date.now() - startTime;
      const content = completion.choices[0]?.message?.content || '';
      const inputTokens = completion.usage?.prompt_tokens;
      const outputTokens = completion.usage?.completion_tokens;
      const tokens = completion.usage?.total_tokens;
      const costUsd = (inputTokens && outputTokens)
        ? calculateCost(model, inputTokens, outputTokens)
        : undefined;

      setLLMResultAttributes(span, { inputTokens, outputTokens, costUsd, latencyMs: durationMs, success: true });
      logLLMCallSuccess(logger, callContext, durationMs, content.length);

      return {
        content,
        model,
        durationMs,
        tokens,
        inputTokens,
        outputTokens,
        costUsd,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const willRetry = attempt < maxAttempts && isRetryableError(error);

      setLLMResultAttributes(span, { latencyMs: Date.now() - startTime, success: false, error: errorMessage });
      logLLMCallError(logger, callContext, errorMessage, willRetry);

      if (!willRetry || !isRetryableError(error)) {
        throw new Error(`OpenRouter call failed after ${attempt} attempt(s): ${errorMessage}`);
      }

      const delayMs = calculateDelay(attempt, DEFAULT_RETRY_CONFIG);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } finally {
      span.end();
    }
  }

  // TypeScript requires this, but we'll never reach it
  throw new Error('Unexpected: retry loop completed without result');
}
