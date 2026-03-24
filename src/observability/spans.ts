/**
 * Span Helper Utilities
 *
 * Convenience wrappers for creating and managing OpenTelemetry spans
 * throughout the ISEE pipeline.
 */

import { SpanStatusCode, SpanKind } from '@opentelemetry/api';
import type { Span, Tracer, Context } from '@opentelemetry/api';
import { context, trace } from '@opentelemetry/api';
import { getTracer } from './tracing';

export { SpanStatusCode, SpanKind };

/**
 * Attributes for an LLM API call span.
 */
export interface LLMSpanAttributes {
  provider: 'anthropic' | 'openrouter';
  model: string;
  framework?: string;
  domain?: string;
  stage: string;
}

/**
 * Run a function within a new span, automatically handling errors and timing.
 * The span is ended when the function completes (success or error).
 */
export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: {
    tracer?: Tracer;
    parentContext?: Context;
    attributes?: Record<string, string | number | boolean>;
    kind?: SpanKind;
  }
): Promise<T> {
  const tracer = options?.tracer ?? getTracer();
  const parentCtx = options?.parentContext ?? context.active();

  return tracer.startActiveSpan(
    name,
    {
      kind: options?.kind ?? SpanKind.INTERNAL,
      attributes: options?.attributes,
    },
    parentCtx,
    async (span: Span) => {
      try {
        const result = await fn(span);
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        span.setStatus({ code: SpanStatusCode.ERROR, message });
        span.recordException(error instanceof Error ? error : new Error(message));
        throw error;
      } finally {
        span.end();
      }
    }
  );
}

/**
 * Set LLM-specific attributes on a span.
 */
export function setLLMAttributes(span: Span, attrs: LLMSpanAttributes): void {
  span.setAttribute('llm.provider', attrs.provider);
  span.setAttribute('llm.model', attrs.model);
  span.setAttribute('llm.stage', attrs.stage);
  if (attrs.framework) span.setAttribute('llm.framework', attrs.framework);
  if (attrs.domain) span.setAttribute('llm.domain', attrs.domain);
}

/**
 * Set token usage and cost attributes on a span after an LLM call completes.
 */
export function setLLMResultAttributes(
  span: Span,
  result: {
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    latencyMs?: number;
    success: boolean;
    error?: string;
  }
): void {
  if (result.inputTokens !== undefined) span.setAttribute('llm.tokens.input', result.inputTokens);
  if (result.outputTokens !== undefined) span.setAttribute('llm.tokens.output', result.outputTokens);
  if (result.costUsd !== undefined) span.setAttribute('llm.cost.usd', result.costUsd);
  if (result.latencyMs !== undefined) span.setAttribute('llm.latency_ms', result.latencyMs);
  span.setAttribute('llm.success', result.success);
  if (result.error) span.setAttribute('llm.error', result.error);
}

/**
 * Get the current trace ID and span ID for log correlation.
 * Returns empty strings if no active span.
 */
export function getCurrentTraceContext(): { traceId: string; spanId: string } {
  const span = trace.getActiveSpan();
  if (!span) return { traceId: '', spanId: '' };

  const ctx = span.spanContext();
  return {
    traceId: ctx.traceId,
    spanId: ctx.spanId,
  };
}
