/**
 * Stage 2: Clustering Agent — Emergent Clustering
 *
 * Purpose: Discover the genuine intellectual shape of the response space
 * Input: Original and refined query, plus anonymized responses (content only, no metadata)
 * Output: Prompt string for the Clustering Agent
 *
 * Design notes:
 * - CRITICAL: Agent receives response content only — no model, framework, or domain metadata
 * - This ensures clusters represent genuine intellectual angles, not source dimensions
 * - Clusters should be named as arguments/claims, not topics
 * - Target: 5-7 clusters
 * - Original query is authoritative; refined query provides additive context only
 */

export interface ClusteringPromptInput {
  /** The user's original query, verbatim */
  originalQuery: string;
  /** The refined query with additional context (only if refinement occurred) */
  refinedQuery?: string;
  responses: Array<{ index: number; content: string }>;
}

export function buildClusteringPrompt(input: ClusteringPromptInput): string {
  const responsesText = input.responses
    .map((r) => `[Response ${r.index}]\n${r.content}`)
    .join('\n\n---\n\n');

  const querySection = input.refinedQuery
    ? `USER'S QUERY (verbatim — this is the authoritative statement of intent):
${input.originalQuery}

ADDITIONAL CONTEXT (from follow-up questions — additive only, does not override the original):
${input.refinedQuery}`
    : `USER'S QUERY (verbatim):
${input.originalQuery}`;

  return `You are an intellectual analyst. You will receive a numbered list of responses to this query:

${querySection}

Your task is to identify the distinct intellectual angles present across all responses.

IMPORTANT: The user's original query is the ground truth for what they are asking. It may contain deliberate provocations, unusual framings, or explicit hypotheses (e.g., "Is there a third possibility I'm missing?"). When clustering responses, preserve sensitivity to these features — an angle that directly engages a planted hypothesis or inverts the query's framing may be more valuable than one that answers a normalized version of the question. If the additional context seems to flatten or reinterpret the original, defer to the original.

WHAT YOU ARE LOOKING FOR:
Each "angle" is a distinct position or argument — not a topic or theme. An angle answers the question: "What is this response actually claiming or proposing?"

Examples of topic labels (WRONG):
- "Technology Solutions"
- "Governance Approaches"
- "Human-Centered Design"

Examples of argument-style angle names (CORRECT):
- "Automate the human decision layer out of existence"
- "The problem is in the incentive structure, not the process"
- "Small-scale experimentation outperforms top-down design every time"

INSTRUCTIONS:
1. Read all responses carefully
2. Identify 5–7 genuinely distinct intellectual angles
3. Name each angle as a specific claim or stance (8–12 words)
4. Assign each response index to its closest angle
5. Write a 2-sentence summary of each angle

IMPORTANT CONSTRAINTS:
- Do not name angles after their source domain or methodology
- Do not create an angle for responses that are vague, generic, or fail to take a position — assign these to the closest angle that does
- If two angles feel similar, merge them — prefer fewer, sharper angles over more, blurry ones
- Every response index must be assigned to exactly one angle

RESPONSES:

${responsesText}

Respond with your clusters.`;
}
