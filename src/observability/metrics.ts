/**
 * ISEE v2 Prometheus Metrics Exporter
 *
 * Generates Prometheus text format metrics from live DB data.
 * Implements all metrics from PRODUCTION-LAYER-SPEC.md Section 1.2.
 *
 * Format: https://prometheus.io/docs/instrumenting/exposition_formats/
 */

import {
  getPipelineRunCounts,
  getLlmRequestCounts,
  getLlmTokenCounts,
  getLlmCostTotals,
  getQualityMetrics,
} from '../db/metrics';

// ---------------------------------------------------------------------------
// Prometheus text format helpers
// ---------------------------------------------------------------------------

function labelStr(labels: Record<string, string>): string {
  const pairs = Object.entries(labels).map(([k, v]) => `${k}="${v}"`);
  return pairs.length > 0 ? `{${pairs.join(',')}}` : '';
}

function metricLine(name: string, labels: Record<string, string>, value: number): string {
  return `${name}${labelStr(labels)} ${value}`;
}

function header(name: string, help: string, type: string): string {
  return `# HELP ${name} ${help}\n# TYPE ${name} ${type}`;
}

// ---------------------------------------------------------------------------
// Metric collectors
// ---------------------------------------------------------------------------

function collectPipelineMetrics(): string {
  const lines: string[] = [];

  // isee_pipeline_runs_total
  lines.push(header('isee_pipeline_runs_total', 'Total pipeline executions', 'counter'));
  try {
    const counts = getPipelineRunCounts();
    for (const { status, count } of counts) {
      lines.push(metricLine('isee_pipeline_runs_total', { status }, count));
    }
    if (counts.length === 0) {
      lines.push('isee_pipeline_runs_total{status="completed"} 0');
    }
  } catch {
    lines.push('isee_pipeline_runs_total{status="completed"} 0');
  }

  return lines.join('\n');
}

function collectLlmMetrics(): string {
  const lines: string[] = [];

  // isee_llm_requests_total
  lines.push(header('isee_llm_requests_total', 'Total LLM API calls', 'counter'));
  try {
    const counts = getLlmRequestCounts();
    for (const { provider, model, status, count } of counts) {
      lines.push(metricLine('isee_llm_requests_total', { provider, model, status }, count));
    }
    if (counts.length === 0) {
      lines.push('isee_llm_requests_total{provider="anthropic",model="",status="success"} 0');
    }
  } catch {
    lines.push('isee_llm_requests_total{provider="",model="",status="success"} 0');
  }

  // isee_llm_tokens_total
  lines.push('');
  lines.push(header('isee_llm_tokens_total', 'Total tokens consumed', 'counter'));
  try {
    const tokens = getLlmTokenCounts();
    for (const { provider, model, direction, total } of tokens) {
      lines.push(metricLine('isee_llm_tokens_total', { provider, model, direction }, total));
    }
    if (tokens.length === 0) {
      lines.push('isee_llm_tokens_total{provider="",model="",direction="input"} 0');
    }
  } catch {
    lines.push('isee_llm_tokens_total{provider="",model="",direction="input"} 0');
  }

  // isee_llm_cost_usd_total
  lines.push('');
  lines.push(header('isee_llm_cost_usd_total', 'Cumulative cost in USD', 'counter'));
  try {
    const costs = getLlmCostTotals();
    for (const { provider, model, totalCost } of costs) {
      lines.push(metricLine('isee_llm_cost_usd_total', { provider, model }, totalCost));
    }
    if (costs.length === 0) {
      lines.push('isee_llm_cost_usd_total{provider="",model=""} 0');
    }
  } catch {
    lines.push('isee_llm_cost_usd_total{provider="",model=""} 0');
  }

  return lines.join('\n');
}

function collectQualityMetrics(): string {
  const lines: string[] = [];

  lines.push(header('isee_synthesis_responses_avg', 'Average synthesis responses per completed run', 'gauge'));
  lines.push(header('isee_clusters_avg', 'Average clusters identified per completed run', 'gauge'));

  try {
    const quality = getQualityMetrics();
    lines.push(`isee_synthesis_responses_avg ${quality.avgSynthesisResponses}`);
    lines.push(`isee_clusters_avg ${quality.avgClusters}`);
  } catch {
    lines.push('isee_synthesis_responses_avg 0');
    lines.push('isee_clusters_avg 0');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate the full Prometheus metrics text for the /api/metrics endpoint.
 * Returns a string in Prometheus exposition format.
 */
export function generatePrometheusMetrics(): string {
  const sections = [
    collectPipelineMetrics(),
    collectLlmMetrics(),
    collectQualityMetrics(),
  ];

  // Prometheus format ends with a newline
  return sections.join('\n\n') + '\n';
}
