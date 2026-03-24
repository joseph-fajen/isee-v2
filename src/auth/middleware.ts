/**
 * ISEE v2 — Auth Middleware
 *
 * Validates Bearer tokens against the api_keys table.
 * Controlled by the ISEE_ENABLE_AUTH env var (default: disabled for dev).
 */

import { validateApiKey } from '../db/api-keys';
import type { ApiKey } from '../types';

/** Whether authentication is enabled. Set ISEE_ENABLE_AUTH=true to enable. */
export function isAuthEnabled(): boolean {
  return process.env.ISEE_ENABLE_AUTH === 'true';
}

/**
 * Result of an auth check.
 */
export type AuthResult =
  | { ok: true; apiKey: ApiKey }
  | { ok: false; response: Response };

/**
 * Extracts the Bearer token from the Authorization header.
 * Returns `null` if the header is absent or malformed.
 */
function extractBearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization');
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Checks the request for a valid API key.
 *
 * When auth is disabled (ISEE_ENABLE_AUTH != 'true'), always returns ok with
 * a synthetic "dev" key so downstream code doesn't need to handle the
 * disabled case specially.
 *
 * @returns `{ ok: true, apiKey }` on success, or `{ ok: false, response }` on failure.
 */
export function checkAuth(req: Request): AuthResult {
  if (!isAuthEnabled()) {
    return {
      ok: true,
      apiKey: {
        id: 'dev',
        keyHash: '',
        name: 'Dev (auth disabled)',
        createdAt: new Date().toISOString(),
        isAdmin: true,
        isActive: true,
      },
    };
  }

  const token = extractBearerToken(req);

  if (!token) {
    return {
      ok: false,
      response: Response.json(
        { success: false, error: 'Missing Authorization header' },
        { status: 401 }
      ),
    };
  }

  const apiKey = validateApiKey(token);

  if (!apiKey) {
    return {
      ok: false,
      response: Response.json(
        { success: false, error: 'Invalid or expired API key' },
        { status: 401 }
      ),
    };
  }

  return { ok: true, apiKey };
}

/**
 * Checks that the resolved API key has admin privileges.
 * Returns a 403 response if not.
 */
export function requireAdmin(apiKey: ApiKey): Response | null {
  if (!apiKey.isAdmin) {
    return Response.json(
      { success: false, error: 'Admin privileges required' },
      { status: 403 }
    );
  }
  return null;
}
