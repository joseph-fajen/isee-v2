/**
 * Stage 3b: Skeptic Agent — Single Agent, All Clusters
 *
 * Purpose: Find the precise weak point in each Advocate argument
 * Input: Query and all advocate arguments together
 * Output: Prompt string for the Skeptic Agent
 *
 * Design notes:
 * - CRITICAL: Skeptic sees ALL advocate arguments before challenging any
 * - This allows identifying when two clusters make substantially the same claim
 * - Output is structured (SkepticChallengesResponseSchema)
 * - Max 100 words per advocate challenge
 */

export interface SkepticPromptInput {
  query: string;
  advocateArguments: Array<{ clusterId: number; clusterName: string; argument: string }>;
}

export function buildSkepticPrompt(input: SkepticPromptInput): string {
  const advocatesText = input.advocateArguments
    .map(
      (a) => `[Cluster ${a.clusterId}: "${a.clusterName}"]
${a.argument}`
    )
    .join('\n\n---\n\n');

  return `You are a rigorous intellectual skeptic. You have observed a debate in which several advocates each argued for a different angle emerging from a large-scale analysis of this query:

QUERY: ${input.query}

THE ADVOCATES' ARGUMENTS:
${advocatesText}

YOUR TASK:
Challenge each advocate's argument. Your goal is not to dismiss — it is to find the precise point where each argument is weakest, and press on it.

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
