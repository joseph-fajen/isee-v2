/**
 * Stage 1: Synthesis Layer - Matrix Generation
 *
 * Generates the raw response matrix by querying multiple LLMs
 * through multiple cognitive frameworks across the generated domains.
 *
 * Target: ~60 responses (6 models × 11 frameworks × ~1 domain sample)
 * All calls run in parallel with concurrency limiting.
 */

import type { Domain, RawResponse, CognitiveFramework, SynthesisModel } from '../types';
import { FRAMEWORKS } from '../config/frameworks';
import { MODELS } from '../config/models';

interface SynthesisConfig {
  query: string;
  domains: Domain[];
  concurrencyLimit?: number;
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
  const { query, domains, concurrencyLimit = 10 } = config;

  // Build combination list
  const combinations = buildCombinations(domains);
  const total = combinations.length;

  console.log(`[synthesis] Starting ${total} combinations (limit: ${concurrencyLimit} concurrent)`);

  // TODO: Phase 2 implementation
  // - Create OpenRouter client
  // - Implement parallel execution with p-limit or similar
  // - Apply cognitive framework prompts
  // - Collect responses with metadata
  // - Handle individual call failures gracefully

  // Stub: Return mock responses for pipeline testing
  const responses: RawResponse[] = combinations.map((combo, index) => ({
    index,
    content: `[STUB] Response from ${combo.model.name} using ${combo.framework.name} through ${combo.domain.name} lens.\n\nThis is placeholder content that will be replaced with actual LLM responses in Phase 2.`,
    model: combo.model.id,
    framework: combo.framework.id,
    domain: combo.domain.name,
    responseTimeMs: Math.floor(Math.random() * 2000) + 500,
  }));

  // Simulate progress
  for (let i = 0; i < responses.length; i++) {
    onProgress?.(i + 1, total);
    await new Promise((resolve) => setTimeout(resolve, 10)); // Tiny delay for demo
  }

  console.log(`[synthesis] Completed ${responses.length} responses`);
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
