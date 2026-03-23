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
  stage: 'refinement' | 'prep' | 'synthesis' | 'clustering' | 'advocate' | 'skeptic' | 'rebuttal' | 'synthesizer';
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
