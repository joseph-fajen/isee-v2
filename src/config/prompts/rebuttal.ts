/**
 * Stage 3c: Rebuttal — Per Cluster Advocate
 *
 * Purpose: Respond directly to the Skeptic's challenge
 * Input: Query, cluster name, original advocate argument, and skeptic challenge
 * Output: Prompt string for the Rebuttal
 *
 * Design notes:
 * - Partial concession is explicitly permitted and encouraged
 * - An idea that concedes framing weakness but holds substantive claim is more credible
 * - Output is prose (100-150 words), not structured
 */

export interface RebuttalPromptInput {
  query: string;
  clusterName: string;
  advocateArgument: string;
  skepticChallenge: string;
}

export function buildRebuttalPrompt(input: RebuttalPromptInput): string {
  return `You are an intellectual advocate defending a position under challenge.

ORIGINAL QUERY: ${input.query}

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
