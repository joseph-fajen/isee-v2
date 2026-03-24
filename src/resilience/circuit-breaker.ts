/**
 * Circuit Breaker Pattern
 *
 * Per-provider circuit breakers that prevent cascade failures when external
 * services degrade. Three states:
 *   - closed:    Normal operation, requests pass through
 *   - open:      Service degraded, fail fast without calling
 *   - half-open: Testing if service recovered
 *
 * Thresholds per spec:
 *   OpenRouter: 5 failures in 60s window → 30s recovery, 2 half-open probes
 *   Anthropic:  3 failures in 60s window → 60s recovery, 1 half-open probe
 */

import { logger as baseLogger } from '../utils/logger';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  /** Failures within the window that trip the breaker */
  failureThreshold: number;
  /** Rolling window to count failures (ms) */
  windowMs: number;
  /** How long the breaker stays open before going half-open (ms) */
  recoveryMs: number;
  /** Max concurrent requests allowed in half-open state */
  halfOpenProbes: number;
}

export class CircuitOpenError extends Error {
  constructor(provider: string) {
    super(`Circuit breaker open for provider: ${provider}`);
    this.name = 'CircuitOpenError';
  }
}

/**
 * Single circuit breaker for one provider.
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureTimestamps: number[] = [];
  private openedAt: number | null = null;
  private halfOpenProbesActive = 0;

  constructor(
    private readonly provider: string,
    private readonly config: CircuitBreakerConfig
  ) {}

  getState(): CircuitState {
    return this.state;
  }

  /**
   * Execute a function through the circuit breaker.
   * Throws CircuitOpenError immediately if the circuit is open.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.maybeTransitionToHalfOpen();

    if (this.state === 'open') {
      throw new CircuitOpenError(this.provider);
    }

    if (this.state === 'half-open') {
      if (this.halfOpenProbesActive >= this.config.halfOpenProbes) {
        // Saturated — fail fast until a probe completes
        throw new CircuitOpenError(this.provider);
      }
      this.halfOpenProbesActive++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    } finally {
      if (this.state === 'half-open') {
        this.halfOpenProbesActive = Math.max(0, this.halfOpenProbesActive - 1);
      }
    }
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.transitionTo('closed');
      this.failureTimestamps = [];
    }
    // In closed state, success doesn't change anything
  }

  private onFailure(error: unknown): void {
    // Don't count circuit-open errors as failures
    if (error instanceof CircuitOpenError) return;

    const now = Date.now();
    this.failureTimestamps.push(now);
    this.pruneOldFailures(now);

    if (this.state === 'half-open') {
      // Probe failed — go back to open
      this.transitionTo('open');
      this.openedAt = now;
      return;
    }

    if (this.state === 'closed' && this.failureTimestamps.length >= this.config.failureThreshold) {
      this.transitionTo('open');
      this.openedAt = now;
    }
  }

  private maybeTransitionToHalfOpen(): void {
    if (this.state === 'open' && this.openedAt !== null) {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.config.recoveryMs) {
        this.transitionTo('half-open');
        this.halfOpenProbesActive = 0;
      }
    }
  }

  private pruneOldFailures(now: number): void {
    const cutoff = now - this.config.windowMs;
    this.failureTimestamps = this.failureTimestamps.filter((t) => t > cutoff);
  }

  private transitionTo(next: CircuitState): void {
    const prev = this.state;
    if (prev === next) return;
    this.state = next;
    baseLogger.info(
      { provider: this.provider, from: prev, to: next },
      'Circuit breaker state transition'
    );
  }
}

// ---------------------------------------------------------------------------
// Per-provider singleton breakers
// ---------------------------------------------------------------------------

const OPENROUTER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  windowMs: 60_000,
  recoveryMs: 30_000,
  halfOpenProbes: 2,
};

const ANTHROPIC_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 3,
  windowMs: 60_000,
  recoveryMs: 60_000,
  halfOpenProbes: 1,
};

// Map from provider name → breaker (lazy init, one per provider key)
const breakers = new Map<string, CircuitBreaker>();

/**
 * Get (or create) the circuit breaker for a provider.
 * Provider keys: 'openrouter' | 'anthropic'
 */
export function getCircuitBreaker(provider: 'openrouter' | 'anthropic'): CircuitBreaker {
  if (!breakers.has(provider)) {
    const config = provider === 'openrouter' ? OPENROUTER_CONFIG : ANTHROPIC_CONFIG;
    breakers.set(provider, new CircuitBreaker(provider, config));
  }
  return breakers.get(provider)!;
}

/**
 * Reset all circuit breakers. Useful for testing.
 */
export function resetAllBreakers(): void {
  breakers.clear();
}
