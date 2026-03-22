/**
 * Stage 0: Prep Agent - Dynamic Domain Generation
 *
 * Generates 3-5 knowledge domains specific to the user's query.
 * This is a genuine LLM call that happens first, per query, every time.
 * NO fixed domain list exists anywhere in this codebase.
 *
 * See PROMPTS.md for the full prompt specification.
 */

import type { Domain } from '../types';

/**
 * Generate knowledge domains relevant to the given query.
 *
 * @param query - The user's research question
 * @returns Array of 3-5 dynamically generated domains
 */
export async function generateDomains(query: string): Promise<Domain[]> {
  // TODO: Phase 2 implementation
  // - Use Anthropic Claude SDK
  // - Apply the Prep Agent prompt from PROMPTS.md
  // - Parse JSON response
  // - Validate 3-5 domains returned

  console.log('[prep] Generating domains for query:', query.substring(0, 50) + '...');

  // Stub: Return mock domains for pipeline testing
  const mockDomains: Domain[] = [
    {
      name: 'Behavioral Economics',
      description: 'Study of psychological factors influencing economic decisions',
      focus: 'How cognitive biases and heuristics shape decision-making',
    },
    {
      name: 'Systems Theory',
      description: 'Analysis of complex interconnected systems and feedback loops',
      focus: 'Emergent properties and unintended consequences',
    },
    {
      name: 'Historical Precedents',
      description: 'Examination of similar challenges and their outcomes in history',
      focus: 'Patterns of success and failure across contexts',
    },
  ];

  console.log(`[prep] Generated ${mockDomains.length} domains`);
  return mockDomains;
}
