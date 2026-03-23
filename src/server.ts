/**
 * ISEE v2 HTTP Server
 *
 * Minimal Bun server that:
 * - Serves the single-page UI at /
 * - Handles POST /api/analyze to start a pipeline run
 * - Returns the briefing when complete
 */

import { runPipeline } from './pipeline';
import type { AnalyzeRequest, ApiResponse, Briefing, ProgressEvent } from './types';
import { renderBriefingMarkdown } from './pipeline/synthesizer';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || 'localhost';

/**
 * Simple router for the ISEE API.
 */
async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // Serve static files from public/
  if (method === 'GET' && (path === '/' || path === '/index.html')) {
    const html = await Bun.file('public/index.html').text();
    return new Response(html, {
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Health check
  if (method === 'GET' && path === '/health') {
    return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
  }

  // SSE: Stream analysis progress
  if (method === 'GET' && path === '/api/analyze/stream') {
    const query = url.searchParams.get('query');

    if (!query) {
      return new Response('Missing query parameter', { status: 400 });
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
            { query, verbose: false },
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

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  // API: Start analysis
  if (method === 'POST' && path === '/api/analyze') {
    try {
      const body = (await req.json()) as AnalyzeRequest;

      if (!body.query || typeof body.query !== 'string') {
        return Response.json(
          { success: false, error: 'Missing or invalid query' } as ApiResponse<never>,
          { status: 400 }
        );
      }

      console.log(`[server] Starting analysis for query: ${body.query.substring(0, 50)}...`);

      // Run the full pipeline
      const result = await runPipeline({ query: body.query, verbose: true });

      // Save to file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `output/isee-briefing-${timestamp}.md`;
      await Bun.write(filename, result.markdown);
      console.log(`[server] Saved briefing to: ${filename}`);

      return Response.json({
        success: true,
        data: {
          briefing: result.briefing,
          markdown: result.markdown,
        },
      } as ApiResponse<{ briefing: Briefing; markdown: string }>);
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
});

console.log(`Server running at http://${HOST}:${PORT}`);
console.log('Press Ctrl+C to stop');
