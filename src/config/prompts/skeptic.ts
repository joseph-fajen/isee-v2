/**
 * Stage 3b: Skeptic Agent — Single Agent, All Clusters
 *
 * Purpose: Find the precise weak point in each Advocate argument
 * Input: Original and refined query, plus all advocate arguments together
 * Output: Prompt string for the Skeptic Agent
 *
 * Design notes:
 * - CRITICAL: Skeptic sees ALL advocate arguments before challenging any
 * - This allows identifying when two clusters make substantially the same claim
 * - Output is structured (SkepticChallengesResponseSchema)
 * - Max 100 words per advocate challenge
 * - Original query is authoritative; refined query provides additive context only
 */

export interface SkepticPromptInput {
  /** The user's original query, verbatim */
  originalQuery: string;
  /** The refined query with additional context (only if refinement occurred) */
  refinedQuery?: string;
  advocateArguments: Array<{ clusterId: number; clusterName: string; argument: string }>;
}

export function buildSkepticPrompt(input: SkepticPromptInput): string {
  const advocatesText = input.advocateArguments
    .map(
      (a) => `[Cluster ${a.clusterId}: "${a.clusterName}"]
${a.argument}`
    )
    .join('\n\n---\n\n');

  const querySection = input.refinedQuery
    ? `USER'S QUERY (verbatim — this is the authoritative statement of intent):
${input.originalQuery}

ADDITIONAL CONTEXT (from follow-up questions — additive only, does not override the original):
${input.refinedQuery}`
    : `USER'S QUERY (verbatim):
${input.originalQuery}`;

  return `You are a rigorous intellectual skeptic. You have observed a debate in which several advocates each argued for a different angle emerging from a large-scale analysis of this query:

${querySection}

THE ADVOCATES' ARGUMENTS:
${advocatesText}

YOUR TASK:
Challenge each advocate's argument. Your goal is not to dismiss — it is to find the precise point where each argument is weakest, and press on it.

IMPORTANT: When evaluating whether an advocate's angle provides genuine value, measure against the user's original query — not a simplified version. If the user embedded a specific hypothesis, unusual framing, or third option in their question, an advocate who engages that directly may deserve credit for it. Your challenge should test whether the angle actually addresses what the user asked, in the way they asked it. The additional context provides constraints but does not override the original framing.

For each advocate, deliver ONE focused challenge that targets the most vulnerable part of their specific argument.

Your challenge should probe one or more of these pressure points:
- IS IT ACTUALLY NOVEL? Could this angle have emerged from a single well-crafted prompt to one model? If so, what has ISEE's combinatorial approach actually added?
- IS THE VALUE REAL OR RHETORICAL? Does the argument demonstrate concrete value for someone asking this query, or does it assert importance without showing it?
- IS IT INTERNALLY CONSISTENT? Does the claim hold together, or does it contradict itself when examined closely?
- IS IT ACTUALLY DISTINCT? If two angles are making substantially the same claim in different language, name this directly.

Your challenge must NOT:
- Ask clarifying questions — make a specific challenge
- Apply generic skepticism ("but is this really new?") without specifics
- Challenge the topic — challenge the *argument the advocate made*
- Be longer than 100 words per advocate

Respond with your challenges.`;
}
