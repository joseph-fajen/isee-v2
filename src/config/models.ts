/**
 * Synthesis Model Definitions
 *
 * 5 heterogeneous models chosen for genuine cognitive diversity.
 * These are accessed via OpenRouter using their model IDs.
 *
 * Selection rationale (from ARCHITECTURE.md):
 * - Quality over quantity: well-chosen models vs marginal diversity
 * - Each model brings meaningfully different reasoning patterns
 * - Balanced across providers and architectures
 *
 * NOTE: DeepSeek removed due to chronic 120s+ latency on complex prompts
 * NOTE: Qwen 3.6 Plus temporarily disabled - consistent timeout issues (100-120s per call)
 */

import type { SynthesisModel } from '../types';

export const MODELS: SynthesisModel[] = [
  {
    id: 'claude-sonnet',
    name: 'Claude Sonnet 4',
    openRouterId: 'anthropic/claude-sonnet-4',
    description: 'Strong reasoning and synthesis capabilities',
    costTier: 'premium',
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    openRouterId: 'openai/gpt-4o',
    description: 'Broad knowledge, reliable performance',
    costTier: 'premium',
  },
  {
    id: 'gemini-pro',
    name: 'Gemini 2.5 Pro',
    openRouterId: 'google/gemini-2.5-pro',
    description: 'Strong cross-domain connections',
    costTier: 'premium',
    maxTokens: 8000,
  },
  {
    id: 'llama-70b',
    name: 'Llama 3.3 70B',
    openRouterId: 'meta-llama/llama-3.3-70b-instruct',
    description: 'Open-source reasoning patterns differ meaningfully',
    costTier: 'standard',
  },
  // TEMPORARILY DISABLED: Qwen 3.6 Plus - consistent timeout issues (100-120s per call)
  // Causing circuit breaker trips and cascade failures
  // {
  //   id: 'qwen-3.6-plus',
  //   name: 'Qwen 3.6 Plus',
  //   openRouterId: 'qwen/qwen3.6-plus',
  //   description: 'MoE architecture with reasoning tokens, Chinese model perspective',
  //   costTier: 'budget',
  // },
  {
    id: 'grok-mini',
    name: 'Grok 3 Mini',
    openRouterId: 'x-ai/grok-3-mini',
    description: 'Contrarian tendency valuable for debate seeding',
    costTier: 'standard',
    maxTokens: 8000,
  },
];

/**
 * Get a model by ID.
 */
export function getModel(id: string): SynthesisModel | undefined {
  return MODELS.find((m) => m.id === id);
}

/**
 * Get the OpenRouter model ID for a given model.
 */
export function getOpenRouterId(id: string): string | undefined {
  return MODELS.find((m) => m.id === id)?.openRouterId;
}

/**
 * Calculate estimated cost for a given number of calls.
 * These are rough estimates - actual costs vary by response length.
 */
export function estimateCost(callCount: number): { low: number; high: number } {
  // Rough estimate: $0.01-0.05 per call average across models
  return {
    low: callCount * 0.01,
    high: callCount * 0.05,
  };
}
