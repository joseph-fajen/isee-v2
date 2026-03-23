/**
 * Stage 0: Prep Agent — Domain Generation
 *
 * Purpose: Generate 3–5 knowledge domains specific to the user's query
 * Input: The user's query string
 * Output: Prompt string for the Prep Agent
 *
 * Design notes:
 * - Domains must be genuinely relevant, distinct, and specific
 * - "Behavioral Economics" is good; "Science" is too broad
 * - Output is parsed via Zod structured output (DomainsResponseSchema in anthropic.ts)
 */

export interface PrepPromptInput {
  query: string;
}

export function buildPrepAgentPrompt(input: PrepPromptInput): string {
  return `You are an expert research strategist. A user has submitted the following query for deep multi-perspective analysis:

QUERY: ${input.query}

Your task is to identify 3–5 knowledge domains that would provide the most illuminating perspectives on this query.

A good domain is:
- Genuinely relevant to the query's core challenge
- Distinct from the other domains — each should add a different lens
- Specific enough to focus the analysis (not just "Science" but "Behavioral Economics")

Respond with your domains.`;
}
