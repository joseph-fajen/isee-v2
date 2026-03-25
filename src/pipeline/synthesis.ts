/**
 * Stage 1: Synthesis Layer - Matrix Generation
 *
 * Generates the raw response matrix by querying multiple LLMs
 * through multiple cognitive frameworks across the generated domains.
 *
 * Target: ~60 responses (6 models × 11 frameworks × ~1 domain sample)
 * All calls run in parallel with concurrency limiting.
 */

import pLimit from 'p-limit';
import type { Domain, RawResponse, CognitiveFramework, SynthesisModel } from '../types';
import { FRAMEWORKS, formatFrameworkPrompt } from '../config/frameworks';
import { MODELS } from '../config/models';
import { callOpenRouter } from '../clients/openrouter';
import {
  logger as baseLogger,
  logStageStart,
  logStageComplete,
  type Logger,
} from '../utils/logger';

interface SynthesisConfig {
  runId?: string;
  query: string;
  domains: Domain[];
  concurrencyLimit?: number;
  runLogger?: Logger;
}

/**
 * Generate the synthesis matrix.
 *
 * @param config - Query, domains, and execution settings
 * @param onProgress - Callback for progress updates
 * @returns Array of raw responses from all combinations
 */
export async function generateSynthesisMatrix(
  config: SynthesisConfig,
  onProgress?: (current: number, total: number) => void,
  onResponseComplete?: (detail: {
    modelId: string;
    frameworkId: string;
    domainName: string;
    responseTimeMs?: number;
    success: boolean;
    error?: string;
  }) => void
): Promise<RawResponse[]> {
  const { query, domains, concurrencyLimit = 15, runLogger, runId } = config;
  const log = runLogger || baseLogger;

  // Build combination list
  const combinations = buildCombinations(domains);
  const total = combinations.length;

  logStageStart(log, 'synthesis', {
    totalCalls: total,
    concurrencyLimit,
    models: MODELS.map((m) => m.id),
    frameworks: FRAMEWORKS.length,
    domains: domains.map((d) => d.name),
  });

  const limit = pLimit(concurrencyLimit);
  const startTime = Date.now();

  // Track results
  let completed = 0;
  let failed = 0;
  const responses: RawResponse[] = [];
  const failures: Array<{ model: string; framework: string; domain: string; error: string }> = [];

  // Create all limited promises
  const promises = combinations.map((combo, index) =>
    limit(async () => {
      const prompt = formatFrameworkPrompt(combo.framework, query, combo.domain.name);

      try {
        const result = await callOpenRouter({
          model: combo.model.openRouterId,
          prompt,
          maxTokens: combo.model.maxTokens,
          logger: log,
          context: {
            framework: combo.framework.id,
            domain: combo.domain.name,
            callIndex: index,
          },
          runId,
        });

        const response: RawResponse = {
          index,
          content: result.content,
          model: combo.model.id,
          framework: combo.framework.id,
          domain: combo.domain.name,
          tokens: result.tokens,
          responseTimeMs: result.durationMs,
        };

        responses.push(response);

        // Emit detail for SSE
        onResponseComplete?.({
          modelId: combo.model.id,
          frameworkId: combo.framework.id,
          domainName: combo.domain.name,
          responseTimeMs: result.durationMs,
          success: true,
        });
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        failures.push({
          model: combo.model.id,
          framework: combo.framework.id,
          domain: combo.domain.name,
          error: errorMessage,
        });

        // Emit failure for SSE
        onResponseComplete?.({
          modelId: combo.model.id,
          frameworkId: combo.framework.id,
          domainName: combo.domain.name,
          success: false,
          error: errorMessage,
        });
        // Don't throw - continue with remaining calls
      } finally {
        completed++;
        onProgress?.(completed, total);
      }
    })
  );

  // Wait for all to complete
  await Promise.all(promises);

  const durationMs = Date.now() - startTime;

  logStageComplete(log, 'synthesis', {
    durationMs,
    total,
    successful: responses.length,
    failed,
    failures: failures.length > 0 ? failures : undefined,
    avgCallDurationMs:
      responses.length > 0
        ? Math.round(responses.reduce((sum, r) => sum + (r.responseTimeMs || 0), 0) / responses.length)
        : 0,
  });

  // -------------------------------------------------------------------------
  // Graceful degradation checks
  // -------------------------------------------------------------------------
  const failureRate = total > 0 ? failed / total : 0;

  if (failureRate > 0.5) {
    // >50% failed — abort with explanation
    throw new Error(
      `Synthesis stage aborted: ${failed}/${total} calls failed (${Math.round(failureRate * 100)}%). ` +
      `This exceeds the 50% failure threshold. Check API keys and provider status.`
    );
  }

  if (failureRate >= 0.2) {
    // 20-50% failed — warn and continue with reduced matrix
    log.warn(
      { failed, total, failureRate: Math.round(failureRate * 100) },
      'Synthesis running in degraded mode: continuing with reduced response matrix'
    );
  }

  // Check if a single model failed all its calls — exclude and continue
  const modelCallCounts = new Map<string, { total: number; failed: number }>();
  for (const combo of combinations) {
    const entry = modelCallCounts.get(combo.model.id) ?? { total: 0, failed: 0 };
    entry.total++;
    modelCallCounts.set(combo.model.id, entry);
  }
  for (const failure of failures) {
    const entry = modelCallCounts.get(failure.model);
    if (entry) entry.failed++;
  }

  const fullyFailedModels: string[] = [];
  for (const [modelId, counts] of modelCallCounts) {
    if (counts.total > 0 && counts.failed === counts.total) {
      fullyFailedModels.push(modelId);
      log.warn({ modelId, callCount: counts.total }, 'Excluding model: all calls failed');
    }
  }

  return responses;
}

interface Combination {
  model: SynthesisModel;
  framework: CognitiveFramework;
  domain: Domain;
}

/**
 * Build the list of all combinations to execute.
 * Uses sampling to target ~60 calls rather than full Cartesian product.
 */
function buildCombinations(domains: Domain[]): Combination[] {
  const combinations: Combination[] = [];

  // For each model, use all frameworks with sampled domains
  for (const model of MODELS) {
    for (const framework of FRAMEWORKS) {
      // Sample 1 domain per model/framework pair to keep total reasonable
      // With 6 models × 11 frameworks × 1 domain = 66 combinations
      const domain = domains[combinations.length % domains.length];
      combinations.push({ model, framework, domain });
    }
  }

  return combinations;
}

/**
 * Calculate expected number of API calls for a given configuration.
 */
export function estimateCallCount(_domainCount: number): number {
  return MODELS.length * FRAMEWORKS.length; // ~66 with 6 models × 11 frameworks
}
