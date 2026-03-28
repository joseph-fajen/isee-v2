/**
 * Stage 3c: Rebuttal — Per Cluster Advocate
 *
 * Purpose: Respond directly to the Skeptic's challenge
 * Input: Original and refined query, cluster name, original advocate argument, and skeptic challenge
 * Output: Prompt string for the Rebuttal
 *
 * Design notes:
 * - Partial concession is explicitly permitted and encouraged
 * - An idea that concedes framing weakness but holds substantive claim is more credible
 * - Output is prose (100-150 words), not structured
 * - Original query is authoritative; refined query provides additive context only
 */

export interface RebuttalPromptInput {
  /** The user's original query, verbatim */
  originalQuery: string;
  /** The refined query with additional context (only if refinement occurred) */
  refinedQuery?: string;
  clusterName: string;
  advocateArgument: string;
  skepticChallenge: string;
}

export function buildRebuttalPrompt(input: RebuttalPromptInput): string {
  const querySection = input.refinedQuery
    ? `USER'S QUERY (verbatim — this is the authoritative statement of intent):
${input.originalQuery}

ADDITIONAL CONTEXT (from follow-up questions — additive only, does not override the original):
${input.refinedQuery}`
    : `USER'S QUERY (verbatim):
${input.originalQuery}`;

  return `You are an intellectual advocate defending a position under challenge.

${querySection}

YOUR ANGLE:
Name: ${input.clusterName}
Your original argument: ${input.advocateArgument}

THE SKEPTIC'S CHALLENGE:
${input.skepticChallenge}

YOUR TASK:
Respond to the skeptic's challenge directly. You have one response.

A strong rebuttal does one of three things:
1. REFUTES the challenge — shows specifically why the skeptic's concern does not apply, or rests on a false assumption
2. CONCEDES AND HOLDS — acknowledges the challenge has merit on one point, but demonstrates the core claim survives it
3. SHARPENS the original argument — uses the challenge to articulate the claim more precisely, showing the skeptic identified a weakness in the *framing*, not the *substance*

Your rebuttal must NOT:
- Simply restate your original argument without engaging the challenge
- Claim the challenge misunderstood you without introducing entirely new claims not present in your original argument
- Be defensive in tone — engage the challenge as an intellectual peer

Length: 100–150 words.`;
}
