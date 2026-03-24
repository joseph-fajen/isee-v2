/**
 * OpenTelemetry Tracing Setup
 *
 * Initializes distributed tracing for ISEE v2.
 * - Console exporter in dev (no ISEE_TRACING_ENDPOINT set)
 * - OTLP exporter in production (ISEE_TRACING_ENDPOINT set)
 *
 * MUST be imported before any other modules in server.ts.
 */

import { BasicTracerProvider, SimpleSpanProcessor, BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { trace, context } from '@opentelemetry/api';

let initialized = false;
let provider: BasicTracerProvider | null = null;

/**
 * Initialize OpenTelemetry tracing.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function initTracing(): void {
  if (initialized) return;

  const enabled = process.env.ISEE_TRACING_ENABLED !== 'false';
  if (!enabled) {
    initialized = true;
    return;
  }

  const serviceName = process.env.ISEE_TRACING_SERVICE_NAME || 'isee-v2';
  const endpoint = process.env.ISEE_TRACING_ENDPOINT;

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: '2.0.0',
    'deployment.environment': process.env.NODE_ENV || 'development',
  });

  if (endpoint) {
    // Production: OTLP exporter (Jaeger, Grafana Tempo, etc.)
    const exporter = new OTLPTraceExporter({ url: endpoint });
    provider = new BasicTracerProvider({
      resource,
      spanProcessors: [new BatchSpanProcessor(exporter)],
    });
    console.log(`[tracing] OpenTelemetry initialized — service: ${serviceName}, endpoint: ${endpoint}`);
  } else {
    // Development: console exporter
    provider = new BasicTracerProvider({
      resource,
      spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
    });
    console.log(`[tracing] OpenTelemetry initialized — service: ${serviceName}, exporter: console`);
  }

  // Register the provider and context manager globally
  trace.setGlobalTracerProvider(provider);
  const contextManager = new AsyncLocalStorageContextManager();
  contextManager.enable();
  context.setGlobalContextManager(contextManager);

  initialized = true;
}

/**
 * Get the tracer for ISEE pipeline instrumentation.
 */
export function getTracer(name = 'isee.pipeline') {
  return trace.getTracer(name);
}

/**
 * Shut down the tracer provider (flushes pending spans).
 */
export async function shutdownTracing(): Promise<void> {
  if (provider) {
    await provider.shutdown();
  }
}

// Re-export OTel context/trace APIs for use in instrumentation
export { trace, context };
