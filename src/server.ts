/**
 * ISEE v2 HTTP Server
 *
 * Minimal Bun server that:
 * - Serves the single-page UI at /
 * - Handles POST /api/analyze to start a pipeline run
 * - Returns the briefing when complete
 */

// Initialize tracing BEFORE other imports so instrumentation is in place
import { initTracing } from './observability/tracing';
initTracing();

// Initialize database (runs migrations)
import { initDatabase } from './db';
initDatabase();

import { runPipeline } from './pipeline';
import type { AnalyzeRequest, ApiResponse, Briefing, TranslatedBriefing, ProgressEvent, RefinementMetadata } from './types';
import { assessQuery, getFollowUpQuestions, rewriteUserQuery } from './pipeline/refinement';
import { checkAuth, requireAdmin } from './auth/middleware';
import { createApiKey } from './db/api-keys';
import { applyRateLimit, withRateLimitHeaders } from './security/rate-limit-middleware';
import { validateQuery } from './security/validation';
import { handleCORS, handlePreflight } from './security/cors';
import { generatePrometheusMetrics } from './observability/metrics';
import {
  getSummary,
  getRecentRuns,
  getLatencyTimeSeriesHandler,
  getModelStats,
  getCostBreakdown,
  getHealthStatus,
} from './dashboard';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || 'localhost';

/**
 * Filter OVERVIEW.md to include only user-facing sections.
 * Strips developer-focused sections: Quick Start, For Developers, Further Reading.
 */
function filterOverviewForUsers(markdown: string): string {
  const lines = markdown.split('\n');
  const result: string[] = [];
  let skip = false;

  const excludedSections = ['quick start', 'for developers', 'further reading'];

  for (const line of lines) {
    // Check if this is a heading (## level)
    const headingMatch = line.match(/^## (.+)/);
    if (headingMatch) {
      const title = headingMatch[1].trim().toLowerCase();
      skip = excludedSections.includes(title);
    }

    if (!skip) {
      result.push(line);
    }
  }

  return result.join('\n').trim();
}

/**
 * Simple router for the ISEE API.
 */
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // Handle CORS preflight for all routes
  if (method === 'OPTIONS') {
    return handlePreflight(req);
  }

  const response = await routeRequest(req, url, path, method);
  return handleCORS(req, response);
}

/**
 * Core request router — dispatches to the appropriate handler.
 */
async function routeRequest(req: Request, url: URL, path: string, method: string): Promise<Response> {
  // Serve static files from public/
  if (method === 'GET' && (path === '/' || path === '/index.html')) {
    const html = await Bun.file('public/index.html').text();
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Serve favicon
  if (method === 'GET' && path.endsWith('.svg') && path.startsWith('/favicon')) {
    const file = Bun.file(`public${path}`);
    if (await file.exists()) {
      return new Response(file, {
        headers: { 'Content-Type': 'image/svg+xml' },
      });
    }
  }

  // Serve operations dashboard
  if (method === 'GET' && (path === '/dashboard' || path === '/dashboard.html')) {
    const html = await Bun.file('public/dashboard.html').text();
    return new Response(html, { headers: { 'Content-Type': 'text/html' } });
  }

  // Health check
  if (method === 'GET' && path === '/health') {
    return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
  }

  // Serve filtered OVERVIEW.md for About modal
  if (method === 'GET' && path === '/about') {
    try {
      const content = await Bun.file('OVERVIEW.md').text();
      const filtered = filterOverviewForUsers(content);
      return new Response(filtered, {
        headers: { 'Content-Type': 'text/plain' },
      });
    } catch {
      return new Response('About content not available', { status: 500 });
    }
  }

  // SSE: Stream analysis progress
  if (method === 'GET' && path === '/api/analyze/stream') {
    const authResult = checkAuth(req);
    if (!authResult.ok) return authResult.response;

    const rateLimitResult = applyRateLimit(req, authResult);
    if (rateLimitResult.limited) return rateLimitResult.response;

    const rawQuery = url.searchParams.get('query');

    if (!rawQuery) {
      return new Response('Missing query parameter', { status: 400 });
    }

    const queryValidation = validateQuery(rawQuery);
    if (!queryValidation.valid) {
      return Response.json(
        {
          error: 'validation_error',
          field: 'query',
          message: queryValidation.error,
          code: queryValidation.code,
        },
        { status: 400 }
      );
    }

    const query = queryValidation.sanitized!;

    const refinementParam = url.searchParams.get('refinement');
    let refinementMeta: RefinementMetadata | undefined;
    if (refinementParam) {
      try {
        const parsed = JSON.parse(decodeURIComponent(refinementParam));
        if (
          typeof parsed.originalQuery === 'string' &&
          typeof parsed.wasRefined === 'boolean'
        ) {
          refinementMeta = parsed as RefinementMetadata;
        }
      } catch { /* ignore parse errors */ }
    }

    console.log(`[server] Starting SSE stream for query: ${query.substring(0, 50)}...`);

    const encoder = new TextEncoder();
    let streamClosed = false;

    const stream = new ReadableStream({
      type: 'direct',
      async pull(controller: ReadableStreamDirectController) {
        const sendEvent = (event: string, data: unknown) => {
          if (streamClosed) return;
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.write(encoder.encode(payload));
          controller.flush();
        };

        const sendProgress = (progressEvent: ProgressEvent) => {
          sendEvent('progress', progressEvent);
        };

        try {
          const result = await runPipeline(
            { query, verbose: false, refinement: refinementMeta },
            (progress) => {
              // The progress callback now receives rich ProgressEvent
              sendProgress(progress as ProgressEvent);
            }
          );

          // Save briefing to file
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `output/isee-briefing-${timestamp}.md`;
          await Bun.write(filename, result.markdown);
          console.log(`[server] Saved briefing to: ${filename}`);

          // Send completion event
          sendEvent('complete', {
            briefing: result.briefing,
            translatedBriefing: result.translatedBriefing,
            markdown: result.markdown,
          });

        } catch (error) {
          console.error('[server] SSE pipeline error:', error);
          sendEvent('error', {
            message: error instanceof Error ? error.message : 'Pipeline failed',
          });
        } finally {
          streamClosed = true;
          controller.close();
        }
      },
    });

    const sseHeaders: Record<string, string> = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-RateLimit-Limit': String(rateLimitResult.status.limit),
      'X-RateLimit-Remaining': String(rateLimitResult.status.remaining),
      'X-RateLimit-Reset': String(Math.floor(new Date(rateLimitResult.status.resetAt).getTime() / 1000)),
    };

    return new Response(stream, { headers: sseHeaders });
  }

  // API: Start analysis
  if (method === 'POST' && path === '/api/analyze') {
    const authResult = checkAuth(req);
    if (!authResult.ok) return authResult.response;

    const rateLimitResult = applyRateLimit(req, authResult);
    if (rateLimitResult.limited) return rateLimitResult.response;

    try {
      const body = (await req.json()) as AnalyzeRequest;

      if (!body.query || typeof body.query !== 'string') {
        return Response.json(
          { success: false, error: 'Missing or invalid query' } as ApiResponse<never>,
          { status: 400 }
        );
      }

      const queryValidation = validateQuery(body.query);
      if (!queryValidation.valid) {
        return Response.json(
          {
            error: 'validation_error',
            field: 'query',
            message: queryValidation.error,
            code: queryValidation.code,
          },
          { status: 400 }
        );
      }

      const validatedQuery = queryValidation.sanitized!;
      console.log(`[server] Starting analysis for query: ${validatedQuery.substring(0, 50)}...`);

      // Run the full pipeline
      const result = await runPipeline({ query: validatedQuery, verbose: true });

      // Save to file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `output/isee-briefing-${timestamp}.md`;
      await Bun.write(filename, result.markdown);
      console.log(`[server] Saved briefing to: ${filename}`);

      return withRateLimitHeaders(
        Response.json({
          success: true,
          data: {
            briefing: result.briefing,
            translatedBriefing: result.translatedBriefing,
            markdown: result.markdown,
          },
        } as ApiResponse<{ briefing: Briefing; translatedBriefing: TranslatedBriefing; markdown: string }>),
        rateLimitResult.status
      );
    } catch (error) {
      console.error('[server] Analysis error:', error);
      return Response.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        } as ApiResponse<never>,
        { status: 500 }
      );
    }
  }

  // API: Assess query quality
  if (method === 'POST' && path === '/api/refine/assess') {
    const authResult = checkAuth(req);
    if (!authResult.ok) return authResult.response;
    try {
      const body = await req.json() as { query: string };
      if (!body.query || typeof body.query !== 'string') {
        return Response.json({ success: false, error: 'Missing or invalid query' }, { status: 400 });
      }

      const assessment = await assessQuery(body.query);

      if (assessment.sufficient) {
        return Response.json({ success: true, data: { sufficient: true } });
      }

      // Query needs refinement — generate follow-up questions
      const questions = await getFollowUpQuestions(body.query, assessment.missingCriteria);

      return Response.json({
        success: true,
        data: {
          sufficient: false,
          missingCriteria: assessment.missingCriteria,
          reasoning: assessment.reasoning,
          questions,
        },
      });
    } catch (error) {
      console.error('[server] Assessment error:', error);
      return Response.json(
        { success: false, error: error instanceof Error ? error.message : 'Assessment failed' },
        { status: 500 }
      );
    }
  }

  // API: Rewrite query with user's answers
  if (method === 'POST' && path === '/api/refine/rewrite') {
    const authResult = checkAuth(req);
    if (!authResult.ok) return authResult.response;
    try {
      const body = await req.json() as {
        originalQuery: string;
        answers: Array<{ question: string; answer: string }>;
      };

      if (!body.originalQuery || !body.answers?.length) {
        return Response.json({ success: false, error: 'Missing query or answers' }, { status: 400 });
      }

      const refinedQuery = await rewriteUserQuery(body.originalQuery, body.answers);

      return Response.json({
        success: true,
        data: { refinedQuery },
      });
    } catch (error) {
      console.error('[server] Rewrite error:', error);
      return Response.json(
        { success: false, error: error instanceof Error ? error.message : 'Rewrite failed' },
        { status: 500 }
      );
    }
  }

  // Admin: Create a new API key
  if (method === 'POST' && path === '/api/admin/keys') {
    const authResult = checkAuth(req);
    if (!authResult.ok) return authResult.response;

    const adminError = requireAdmin(authResult.apiKey);
    if (adminError) return adminError;

    try {
      const body = await req.json() as {
        name?: string;
        isAdmin?: boolean;
        expiresAt?: string;
        rateLimitOverride?: number;
      };

      const { key, record } = createApiKey({
        name: typeof body.name === 'string' ? body.name : undefined,
        isAdmin: body.isAdmin === true,
        expiresAt: typeof body.expiresAt === 'string' ? body.expiresAt : undefined,
        rateLimitOverride: typeof body.rateLimitOverride === 'number' ? body.rateLimitOverride : undefined,
      });

      return Response.json({
        success: true,
        data: { key, record },
      }, { status: 201 });
    } catch (error) {
      console.error('[server] Admin key creation error:', error);
      return Response.json(
        { success: false, error: error instanceof Error ? error.message : 'Failed to create key' },
        { status: 500 }
      );
    }
  }

  // Metrics: Prometheus format
  if (method === 'GET' && path === '/api/metrics') {
    const authResult = checkAuth(req);
    if (!authResult.ok) return authResult.response;

    try {
      const metrics = generatePrometheusMetrics();
      return new Response(metrics, {
        headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' },
      });
    } catch (error) {
      console.error('[server] Metrics error:', error);
      return new Response('Error generating metrics', { status: 500 });
    }
  }

  // Dashboard: Summary metrics
  if (method === 'GET' && path === '/api/dashboard/summary') {
    const authResult = checkAuth(req);
    if (!authResult.ok) return authResult.response;

    try {
      const data = await getSummary();
      return Response.json({ success: true, data });
    } catch (error) {
      return Response.json({ success: false, error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
    }
  }

  // Dashboard: Recent runs
  if (method === 'GET' && path === '/api/dashboard/runs') {
    const authResult = checkAuth(req);
    if (!authResult.ok) return authResult.response;

    try {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100);
      const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);
      const data = await getRecentRuns(limit, offset);
      return Response.json({ success: true, data });
    } catch (error) {
      return Response.json({ success: false, error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
    }
  }

  // Dashboard: Latency time series
  if (method === 'GET' && path === '/api/dashboard/latency') {
    const authResult = checkAuth(req);
    if (!authResult.ok) return authResult.response;

    try {
      const raw = url.searchParams.get('period') || '24h';
      const period = (raw === '7d' ? '7d' : '24h') as '24h' | '7d';
      const data = await getLatencyTimeSeriesHandler(period);
      return Response.json({ success: true, data });
    } catch (error) {
      return Response.json({ success: false, error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
    }
  }

  // Dashboard: Model statistics
  if (method === 'GET' && path === '/api/dashboard/models') {
    const authResult = checkAuth(req);
    if (!authResult.ok) return authResult.response;

    try {
      const data = await getModelStats();
      return Response.json({ success: true, data });
    } catch (error) {
      return Response.json({ success: false, error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
    }
  }

  // Dashboard: Cost breakdown
  if (method === 'GET' && path === '/api/dashboard/costs') {
    const authResult = checkAuth(req);
    if (!authResult.ok) return authResult.response;

    try {
      const raw = url.searchParams.get('period') || '7d';
      const period = (['24h', '7d', '30d'].includes(raw) ? raw : '7d') as '24h' | '7d' | '30d';
      const data = await getCostBreakdown(period);
      return Response.json({ success: true, data });
    } catch (error) {
      return Response.json({ success: false, error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
    }
  }

  // Dashboard: Health status
  if (method === 'GET' && path === '/api/dashboard/health') {
    const authResult = checkAuth(req);
    if (!authResult.ok) return authResult.response;

    try {
      const data = await getHealthStatus();
      return Response.json({ success: true, data });
    } catch (error) {
      return Response.json({ success: false, error: error instanceof Error ? error.message : 'Failed' }, { status: 500 });
    }
  }

  // 404 for everything else
  return new Response('Not Found', { status: 404 });
}

// Start the server
console.log('='.repeat(60));
console.log('ISEE v2 Server');
console.log('='.repeat(60));
console.log(`Starting on http://${HOST}:${PORT}`);
console.log('');

Bun.serve({
  port: PORT,
  hostname: HOST,
  fetch: handleRequest,
  // SSE connections need longer timeout for 2-3 minute pipeline runs
  idleTimeout: 255, // Max allowed (4+ minutes)
});

console.log(`Server running at http://${HOST}:${PORT}`);
console.log('Press Ctrl+C to stop');
