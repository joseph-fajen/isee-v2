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
  onProgress?: (current: number, total: number) => void
): Promise<RawResponse[]> {
  const { query, domains, concurrencyLimit = 15, runLogger } = config;
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
          logger: log,
          context: {
            framework: combo.framework.id,
            domain: combo.domain.name,
            callIndex: index,
          },
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
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        failures.push({
          model: combo.model.id,
          framework: combo.framework.id,
          domain: combo.domain.name,
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
export function estimateCallCount(domainCount: number): number {
  return MODELS.length * FRAMEWORKS.length; // ~66 with 6 models × 11 frameworks
}
