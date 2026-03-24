/**
 * LLM Cost Tracking
 *
 * Pricing table and cost calculation for all LLM calls in ISEE v2.
 * Prices are per 1M tokens (input/output) in USD.
 *
 * Reference: PRODUCTION-LAYER-SPEC.md Section 4.3
 */

interface ModelPricing {
  input: number;  // USD per 1M input tokens
  output: number; // USD per 1M output tokens
}

/**
 * Pricing table keyed by OpenRouter model ID or Anthropic model ID.
 * Prices in USD per 1M tokens.
 */
const PRICING: Record<string, ModelPricing> = {
  // OpenRouter models
  'anthropic/claude-sonnet-4':           { input: 3.00,  output: 15.00 },
  'openai/gpt-4o':                        { input: 2.50,  output: 10.00 },
  'google/gemini-2.5-pro':               { input: 1.25,  output: 5.00  },
  'meta-llama/llama-3.3-70b-instruct':   { input: 0.50,  output: 0.75  },
  'meta-llama/llama-3.3-70b':            { input: 0.50,  output: 0.75  },
  'deepseek/deepseek-chat':              { input: 0.27,  output: 1.10  },
  'deepseek/deepseek-r1':                { input: 0.55,  output: 2.19  },
  'x-ai/grok-3-mini':                    { input: 0.30,  output: 0.50  },

  // Anthropic direct (pipeline agents)
  'claude-sonnet-4-5':                   { input: 3.00,  output: 15.00 },
  'claude-sonnet-4-20250514':            { input: 3.00,  output: 15.00 },
  'claude-opus-4-5':                     { input: 15.00, output: 75.00 },
  'claude-haiku-4-5':                    { input: 0.80,  output: 4.00  },
};

/**
 * Calculate the cost in USD for an LLM call.
 *
 * @param model - The model ID (OpenRouter or Anthropic)
 * @param inputTokens - Number of input (prompt) tokens
 * @param outputTokens - Number of output (completion) tokens
 * @returns Cost in USD, or 0 if the model is not in the pricing table
 */
export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = lookupPricing(model);
  if (!pricing) return 0;
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

/**
 * Look up pricing for a model, with prefix matching for variants.
 * E.g., 'anthropic/claude-sonnet-4:beta' matches 'anthropic/claude-sonnet-4'.
 */
function lookupPricing(model: string): ModelPricing | undefined {
  // Exact match first
  if (PRICING[model]) return PRICING[model];

  // Prefix match (handles model variants like ':beta' suffixes)
  for (const [key, pricing] of Object.entries(PRICING)) {
    if (model.startsWith(key)) return pricing;
  }

  return undefined;
}

/**
 * Check if a model has a known price.
 */
export function hasKnownPrice(model: string): boolean {
  return lookupPricing(model) !== undefined;
}
