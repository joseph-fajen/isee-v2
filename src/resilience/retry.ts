/**
 * Retry Logic with Exponential Backoff and Jitter
 *
 * Provides retry behavior for transient LLM API failures.
 * Non-retryable errors (auth, policy violations) are not retried.
 */

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

// Error patterns that indicate a retryable transient failure
const RETRYABLE_PATTERNS = [
  'rate_limit_exceeded',
  'rate limit',
  'too many requests',
  'timeout',
  'service_unavailable',
  'service unavailable',
  'internal_error',
  'internal server error',
  '429',
  '503',
  '500',
  'econnreset',
  'socket hang up',
  'network error',
];

// Error patterns that indicate a permanent failure (no retry)
const NON_RETRYABLE_PATTERNS = [
  'invalid_api_key',
  'invalid api key',
  'authentication',
  'unauthorized',
  'content_policy_violation',
  'content policy',
  'safety',
  'invalid_request',
  'invalid request',
  'bad request',
  '401',
  '403',
  '400',
];

/**
 * Classify whether an error is retryable.
 * Non-retryable patterns take precedence over retryable.
 */
export function isRetryableError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();

  // Non-retryable check takes precedence
  if (NON_RETRYABLE_PATTERNS.some((p) => message.includes(p))) {
    return false;
  }

  return RETRYABLE_PATTERNS.some((p) => message.includes(p));
}

/**
 * Calculate delay for a given attempt with exponential backoff + jitter.
 * Jitter is 0-500ms to prevent thundering herd.
 *
 * @param attempt - Current attempt number (1-based)
 * @param config - Retry configuration
 */
export function calculateDelay(attempt: number, config: RetryConfig): number {
  const base = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1);
  const capped = Math.min(base, config.maxDelayMs);
  const jitter = Math.random() * 500;
  return Math.round(capped + jitter);
}

/**
 * Execute a function with retry on transient failures.
 *
 * Retries up to config.maxAttempts times with exponential backoff.
 * Non-retryable errors are thrown immediately without retry.
 *
 * @param fn - Async function to execute
 * @param config - Retry configuration (defaults to DEFAULT_RETRY_CONFIG)
 * @param onRetry - Optional callback invoked before each retry with attempt number, error, and delay
 * @returns Result of fn on success
 * @throws Last error if all attempts exhausted or error is non-retryable
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void
): Promise<T> {
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLast = attempt === config.maxAttempts;
      const retryable = isRetryableError(error);

      if (isLast || !retryable) {
        throw error;
      }

      const delayMs = calculateDelay(attempt, config);
      onRetry?.(attempt, error, delayMs);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // Unreachable, but TypeScript requires a return/throw after the loop
  throw new Error('withRetry: exhausted all attempts');
}
