import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { handleCORS, handlePreflight } from './cors';

function makeRequest(origin?: string, method = 'GET'): Request {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (origin) headers.set('Origin', origin);
  return new Request('http://localhost:3000/api/analyze', { method, headers });
}

function makeResponse(status = 200): Response {
  return new Response('{}', { status, headers: { 'Content-Type': 'application/json' } });
}

// ---------------------------------------------------------------------------
// handleCORS
// ---------------------------------------------------------------------------

describe('handleCORS — default origins (localhost:3000)', () => {
  beforeEach(() => {
    delete process.env.ISEE_CORS_ORIGINS;
  });

  afterEach(() => {
    delete process.env.ISEE_CORS_ORIGINS;
  });

  test('adds CORS headers for allowed origin', () => {
    const req = makeRequest('http://localhost:3000');
    const res = makeResponse();
    const result = handleCORS(req, res);
    expect(result.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
    expect(result.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(result.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
    expect(result.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    expect(result.headers.get('Vary')).toBe('Origin');
  });

  test('does not add CORS headers for unknown origin', () => {
    const req = makeRequest('https://evil.example.com');
    const res = makeResponse();
    const result = handleCORS(req, res);
    expect(result.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  test('does not add CORS headers when Origin header is absent', () => {
    const req = makeRequest(undefined);
    const res = makeResponse();
    const result = handleCORS(req, res);
    expect(result.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  test('preserves existing response headers', () => {
    const req = makeRequest('http://localhost:3000');
    const res = makeResponse();
    const result = handleCORS(req, res);
    expect(result.headers.get('Content-Type')).toBe('application/json');
    expect(result.status).toBe(200);
  });
});

describe('handleCORS — custom origins via env var', () => {
  afterEach(() => {
    delete process.env.ISEE_CORS_ORIGINS;
  });

  test('allows origins from ISEE_CORS_ORIGINS', () => {
    process.env.ISEE_CORS_ORIGINS = 'https://app.example.com,https://staging.example.com';
    const req = makeRequest('https://app.example.com');
    const result = handleCORS(req, makeResponse());
    expect(result.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
  });

  test('rejects origins not in ISEE_CORS_ORIGINS', () => {
    process.env.ISEE_CORS_ORIGINS = 'https://app.example.com';
    const req = makeRequest('https://other.example.com');
    const result = handleCORS(req, makeResponse());
    expect(result.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  test('allows wildcard *', () => {
    process.env.ISEE_CORS_ORIGINS = '*';
    const req = makeRequest('https://anything.example.com');
    const result = handleCORS(req, makeResponse());
    expect(result.headers.get('Access-Control-Allow-Origin')).toBe('https://anything.example.com');
  });
});

// ---------------------------------------------------------------------------
// handlePreflight
// ---------------------------------------------------------------------------

describe('handlePreflight', () => {
  beforeEach(() => {
    delete process.env.ISEE_CORS_ORIGINS;
  });

  afterEach(() => {
    delete process.env.ISEE_CORS_ORIGINS;
  });

  test('returns 204 for allowed origin', () => {
    const req = makeRequest('http://localhost:3000', 'OPTIONS');
    const res = handlePreflight(req);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('OPTIONS');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
  });

  test('returns 204 without CORS headers for unknown origin', () => {
    const req = makeRequest('https://evil.example.com', 'OPTIONS');
    const res = handlePreflight(req);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  test('response body is empty', async () => {
    const req = makeRequest('http://localhost:3000', 'OPTIONS');
    const res = handlePreflight(req);
    const text = await res.text();
    expect(text).toBe('');
  });
});
