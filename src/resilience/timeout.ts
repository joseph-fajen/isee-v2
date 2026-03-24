/**
 * Timeout Configuration
 *
 * Defines per-operation timeouts and provides an AbortController-based
 * timeout wrapper for LLM calls.
 */

/** Timeout constants in milliseconds */
export const TIMEOUTS = {
  /** Individual LLM call — most complete in 5-15s */
  LLM_CALL_MS: 60_000,
  /** Synthesis stage — ~60 parallel calls, can take 3-4 minutes */
  SYNTHESIS_STAGE_MS: 300_000,
  /** Full pipeline — 5 minutes max */
  FULL_PIPELINE_MS: 300_000,
  /** SSE connection — allow for full pipeline + buffer */
  SSE_CONNECTION_MS: 360_000,
} as const;

/**
 * Create an AbortSignal that fires after the given timeout.
 * The caller is responsible for using the signal in their fetch/API call.
 *
 * @param timeoutMs - Timeout in milliseconds
 * @returns AbortSignal that aborts after timeoutMs
 */
export function createTimeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new TimeoutError(`Operation timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  // Allow the timer to be garbage-collected if the signal is already aborted
  // (Bun/Node support clearTimeout via the AbortSignal.addEventListener pattern)
  controller.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });

  return controller.signal;
}

/**
 * Wrap an async operation with a timeout.
 * Throws TimeoutError if the operation does not complete within timeoutMs.
 *
 * For individual LLM calls, prefer createTimeoutSignal() and pass the signal
 * directly to the SDK. Use withTimeout() for stage-level or pipeline-level
 * safety nets where you don't control the downstream signal propagation.
 *
 * @param fn - Async function to execute
 * @param timeoutMs - Timeout in milliseconds
 */
export async function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Error thrown when an operation exceeds its timeout.
 * Classified as retryable by the retry module (contains 'timeout').
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}
