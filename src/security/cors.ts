/**
 * ISEE v2 — CORS Configuration
 *
 * Adds Cross-Origin Resource Sharing headers to responses.
 * Configure allowed origins via ISEE_CORS_ORIGINS (comma-separated).
 * Defaults to localhost:3000 when the env var is not set.
 */

/** CORS configuration derived from environment. */
const corsConfig = {
  get origins(): string[] {
    const raw = process.env.ISEE_CORS_ORIGINS;
    if (!raw) return ['http://localhost:3000'];
    return raw.split(',').map((o) => o.trim()).filter(Boolean);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400, // 24 hours
};

/**
 * Determines the appropriate Access-Control-Allow-Origin value for a request.
 * Returns the request's Origin if it is in the allowed list, otherwise returns null.
 */
function resolveAllowedOrigin(req: Request): string | null {
  const origin = req.headers.get('Origin');
  if (!origin) return null;
  const allowed = corsConfig.origins;
  if (allowed.includes('*') || allowed.includes(origin)) {
    return origin;
  }
  return null;
}

/**
 * Adds CORS headers to an existing Response.
 * Returns a new Response with the headers applied.
 */
export function handleCORS(req: Request, res: Response): Response {
  const allowedOrigin = resolveAllowedOrigin(req);
  if (!allowedOrigin) return res;

  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin', allowedOrigin);
  headers.set('Access-Control-Allow-Methods', corsConfig.methods.join(', '));
  headers.set('Access-Control-Allow-Headers', corsConfig.allowedHeaders.join(', '));
  headers.set('Access-Control-Allow-Credentials', String(corsConfig.credentials));
  headers.set('Vary', 'Origin');

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

/**
 * Handles an OPTIONS preflight request.
 * Returns a 204 No Content response with CORS headers.
 */
export function handlePreflight(req: Request): Response {
  const allowedOrigin = resolveAllowedOrigin(req);

  const headers = new Headers();
  if (allowedOrigin) {
    headers.set('Access-Control-Allow-Origin', allowedOrigin);
    headers.set('Access-Control-Allow-Methods', corsConfig.methods.join(', '));
    headers.set('Access-Control-Allow-Headers', corsConfig.allowedHeaders.join(', '));
    headers.set('Access-Control-Allow-Credentials', String(corsConfig.credentials));
    headers.set('Access-Control-Max-Age', String(corsConfig.maxAge));
    headers.set('Vary', 'Origin');
  }

  return new Response(null, { status: 204, headers });
}
