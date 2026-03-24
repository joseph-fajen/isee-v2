/**
 * ISEE v2 — Rate Limit Middleware
 *
 * Wraps the token bucket logic with HTTP concerns:
 * - Selects the correct bucket key and config based on the auth result
 * - Applies the global bucket in addition to the per-identity bucket
 * - Returns 429 with a JSON body on limit exceeded
 * - Injects X-RateLimit-* headers on all allowed responses
 *
 * Controlled by ISEE_RATE_LIMIT_ENABLED (default: false for dev).
 */

import type { AuthResult } from '../auth/middleware';
import type { RateLimitStatus } from '../types';
import {
  consumeToken,
  checkRateLimit,
  API_KEY_RATE_LIMIT,
  IP_RATE_LIMIT,
  GLOBAL_RATE_LIMIT,
} from './rate-limit';

/** Whether rate limiting is enabled. Set ISEE_RATE_LIMIT_ENABLED=true to enable. */
export function isRateLimitEnabled(): boolean {
  return process.env.ISEE_RATE_LIMIT_ENABLED === 'true';
}

/**
 * Extracts the client IP address from a request.
 * Checks X-Forwarded-For first (for reverse-proxy deployments), then falls
 * back to a placeholder that groups all unknown callers into one bucket.
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers.get('X-Forwarded-For');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return 'unknown';
}

/**
 * Adds X-RateLimit-* headers to the provided Headers object.
 */
function applyRateLimitHeaders(headers: Headers, status: RateLimitStatus): void {
  headers.set('X-RateLimit-Limit', String(status.limit));
  headers.set('X-RateLimit-Remaining', String(status.remaining));
  headers.set('X-RateLimit-Reset', String(Math.floor(new Date(status.resetAt).getTime() / 1000)));
}

/**
 * Result type returned by the rate limit middleware.
 */
export type RateLimitResult =
  | { limited: false; status: RateLimitStatus }
  | { limited: true; response: Response };

/**
 * Checks and consumes rate limit tokens for a request.
 *
 * When rate limiting is disabled (ISEE_RATE_LIMIT_ENABLED != 'true'), always
 * returns `{ limited: false }` with a synthetic full-bucket status.
 *
 * @param req        The incoming HTTP request (used for IP extraction).
 * @param authResult The resolved auth result from checkAuth().
 */
export function applyRateLimit(req: Request, authResult: AuthResult): RateLimitResult {
  if (!isRateLimitEnabled()) {
    return {
      limited: false,
      status: {
        allowed: true,
        limit: API_KEY_RATE_LIMIT.limit,
        remaining: API_KEY_RATE_LIMIT.limit,
        resetAt: new Date().toISOString(),
      },
    };
  }

  // --- Determine identity bucket key and config ---
  let identityKey: string;
  let identityConfig = IP_RATE_LIMIT;

  if (authResult.ok) {
    const apiKey = authResult.apiKey;
    identityKey = `apikey:${apiKey.id}`;
    identityConfig = {
      ...API_KEY_RATE_LIMIT,
      // Apply per-key override if present
      ...(apiKey.rateLimitOverride != null && {
        limit: apiKey.rateLimitOverride,
        burst: Math.max(Math.ceil(apiKey.rateLimitOverride * 0.3), 1),
      }),
    };
  } else {
    const ip = getClientIp(req);
    identityKey = `ip:${ip}`;
  }

  // --- Check global bucket first (read-only — consume only if identity passes) ---
  const globalCheck = checkRateLimit('global', GLOBAL_RATE_LIMIT);
  if (!globalCheck.allowed) {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    applyRateLimitHeaders(headers, globalCheck);
    if (globalCheck.retryAfterSeconds != null) {
      headers.set('Retry-After', String(globalCheck.retryAfterSeconds));
    }
    return {
      limited: true,
      response: new Response(
        JSON.stringify({
          error: 'rate_limit_exceeded',
          retry_after_seconds: globalCheck.retryAfterSeconds,
          limit: globalCheck.limit,
          remaining: 0,
          reset_at: globalCheck.resetAt,
        }),
        { status: 429, headers }
      ),
    };
  }

  // --- Consume identity token ---
  const identityStatus = consumeToken(identityKey, identityConfig);
  if (!identityStatus.allowed) {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    applyRateLimitHeaders(headers, identityStatus);
    if (identityStatus.retryAfterSeconds != null) {
      headers.set('Retry-After', String(identityStatus.retryAfterSeconds));
    }
    return {
      limited: true,
      response: new Response(
        JSON.stringify({
          error: 'rate_limit_exceeded',
          retry_after_seconds: identityStatus.retryAfterSeconds,
          limit: identityStatus.limit,
          remaining: 0,
          reset_at: identityStatus.resetAt,
        }),
        { status: 429, headers }
      ),
    };
  }

  // --- Consume global token (identity passed) ---
  consumeToken('global', GLOBAL_RATE_LIMIT);

  return { limited: false, status: identityStatus };
}

/**
 * Adds X-RateLimit-* headers to an existing Response and returns a new Response.
 * Use this to annotate successful responses after rate limiting passes.
 */
export function withRateLimitHeaders(response: Response, status: RateLimitStatus): Response {
  const headers = new Headers(response.headers);
  applyRateLimitHeaders(headers, status);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
