/**
 * Stage 0: Prep Agent — Domain Generation
 *
 * Purpose: Generate 3–5 knowledge domains specific to the user's query
 * Input: The user's original query, plus refined query if refinement occurred
 * Output: Prompt string for the Prep Agent
 *
 * Design notes:
 * - Domains must be genuinely relevant, distinct, and specific
 * - "Behavioral Economics" is good; "Science" is too broad
 * - Output is parsed via Zod structured output (DomainsResponseSchema in anthropic.ts)
 * - Original query is authoritative; refined query provides additive context only
 */

export interface PrepPromptInput {
  /** The user's original query, verbatim */
  originalQuery: string;
  /** The refined query with additional context (only if refinement occurred) */
  refinedQuery?: string;
}

export function buildPrepAgentPrompt(input: PrepPromptInput): string {
  const querySection = input.refinedQuery
    ? `USER'S QUERY (verbatim — this is the authoritative statement of intent):
${input.originalQuery}

ADDITIONAL CONTEXT (from follow-up questions — additive only, does not override the original):
${input.refinedQuery}`
    : `USER'S QUERY (verbatim):
${input.originalQuery}`;

  return `You are an expert research strategist. A user has submitted the following query for deep multi-perspective analysis:

${querySection}

Your task is to identify 3–5 knowledge domains that would provide the most illuminating perspectives on this query.

IMPORTANT: The user's original query is the ground truth. It may contain deliberate framings, embedded hypotheses, or structural choices (e.g., "Is the real answer neither A nor B, but C?"). These are intentional. Do not normalize or flatten them when selecting domains. If the additional context seems to narrow or reinterpret the original query, defer to the original — the user's exact words define what they are asking.

A good domain is:
- Genuinely relevant to the query's core challenge
- Distinct from the other domains — each should add a different lens
- Specific enough to focus the analysis (not just "Science" but "Behavioral Economics")

Respond with your domains.`;
}
