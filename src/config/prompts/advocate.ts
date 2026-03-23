/**
 * Stage 3a: Advocate Agent — Per Cluster Argument
 *
 * Purpose: Make the strongest possible case for each cluster's angle
 * Input: Query, cluster name/summary, and top 2-3 member responses
 * Output: Prompt string for the Advocate Agent
 *
 * Design notes:
 * - Top member responses are selected by length/specificity (lightweight heuristic)
 * - Advocate receives strongest representatives, not all members
 * - Output is prose (150-200 words), not structured
 * - Must argue for the angle, not merely summarize it
 */

export interface AdvocatePromptInput {
  query: string;
  clusterName: string;
  clusterSummary: string;
  topMemberResponses: string[];
}

export function buildAdvocatePrompt(input: AdvocatePromptInput): string {
  const responsesText = input.topMemberResponses
    .map((r, i) => `[Supporting Response ${i + 1}]\n${r}`)
    .join('\n\n');

  return `You are an intellectual advocate. You have been assigned to represent one angle that emerged from a large-scale analysis of this query:

QUERY: ${input.query}

YOUR ASSIGNED ANGLE:
Name: ${input.clusterName}
Summary: ${input.clusterSummary}

Supporting responses from the analysis:
${responsesText}

YOUR TASK:
Make the strongest possible case for why this angle represents the most valuable response to the original query.

Your argument must:
1. STATE THE CLAIM — What is this angle actually asserting? Be specific and direct.
2. EXPLAIN THE SURPRISE — Why would this angle not emerge from ordinary prompting or single-model querying? What does it see that conventional approaches miss?
3. MAKE THE CASE FOR VALUE — Why does this matter for someone asking this specific query? What could they do, think, or decide differently because of it?

Your argument must NOT:
- Simply restate or summarize the angle — argue for it
- Make generic claims about novelty or importance without specifics
- Appeal to how many responses support it — volume is not value
- Use vague language like "paradigm shift" or "transformative potential" without concrete grounding

Length: 150–200 words. Tight, specific, defensible.`;
}
