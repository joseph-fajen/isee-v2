/**
 * Stage 4: Synthesis Agent — Briefing Generation
 *
 * Purpose: Select 3 most valuable ideas from the debate and write the briefing
 * Input: Original and refined query, plus complete debate entries
 * Output: Prompt string for the Synthesis Agent
 *
 * Design notes:
 * - Reads full debate transcript across all clusters
 * - Selects 3 ideas using: most surprising, most actionable, most assumption-challenging
 * - Each idea must come from a different cluster
 * - Tone: research briefing — presenting, not prescribing
 * - If an idea conceded points during rebuttal, acknowledge honestly
 * - Original query is authoritative; refined query provides additive context only
 */

import type { DebateEntry } from '../../types';

export interface SynthesisPromptInput {
  /** The user's original query, verbatim */
  originalQuery: string;
  /** The refined query with additional context (only if refinement occurred) */
  refinedQuery?: string;
  debateEntries: DebateEntry[];
}

export function buildSynthesisPrompt(input: SynthesisPromptInput): string {
  const debateText = input.debateEntries
    .map(
      (entry) => `<cluster id="${entry.clusterId}" name="${entry.clusterName}">
<advocate_argument>
${entry.advocateArgument}
</advocate_argument>
<skeptic_challenge>
${entry.skepticChallenge}
</skeptic_challenge>
<rebuttal>
${entry.rebuttal}
</rebuttal>
</cluster>`
    )
    .join('\n\n');

  const querySection = input.refinedQuery
    ? `USER'S QUERY (verbatim — this is the authoritative statement of intent):
${input.originalQuery}

ADDITIONAL CONTEXT (from follow-up questions — additive only, does not override the original):
${input.refinedQuery}`
    : `USER'S QUERY (verbatim):
${input.originalQuery}`;

  return `You are a research synthesis agent. You have observed a structured debate among multiple intellectual angles responding to a user's query. Your task is to select the 3 most valuable ideas and explain why each deserves the user's attention.

${querySection}

DEBATE TRANSCRIPT:
The following clusters each represent a distinct intellectual angle. For each, an Advocate argued for the angle's value, a Skeptic challenged that argument, and the Advocate provided a Rebuttal.

${debateText}

YOUR TASK:
Select exactly 3 ideas from the debate using these criteria. Choose ONE idea that best exemplifies each criterion:

IMPORTANT: When selecting ideas, evaluate them against the user's original query — including any deliberate framings, planted hypotheses, or non-obvious structures they embedded. An idea that directly engages something the user explicitly wondered about ("Is there a third possibility I'm missing?") may be more surprising and valuable than one that answers a normalized question. The additional context helps you understand the user's constraints, but the original query defines what they actually asked. If there is any tension between the two, the original is authoritative.

1. MOST SURPRISING
   - Which idea is least likely to emerge from a single direct query to one AI model?
   - What does ISEE's combinatorial approach surface that conventional prompting would miss?

2. MOST ACTIONABLE
   - Which idea points toward something concrete the user can actually do, think, or decide differently?
   - Avoid ideas that are merely interesting but offer no clear path forward.

3. MOST ASSUMPTION-CHALLENGING
   - Which idea most directly challenges a belief or assumption the user probably holds?
   - Look for ideas that reframe the problem or invert conventional wisdom.

FOR EACH SELECTED IDEA, provide:
- title: A concise title (5-10 words) that captures the core insight
- description: 2-3 sentences explaining the idea itself
- whyEmerged: 2-3 sentences explaining which angle produced this idea and how it survived the debate (reference the advocate/skeptic/rebuttal exchange)
- whyItMatters: 2-3 sentences explaining why this idea deserves the user's attention - be specific, not generic. This is the confidence narrative.

IMPORTANT CONSTRAINTS:
- Select exactly 3 ideas, one for each criterion above
- Each idea must come from a different cluster (no repeating clusters)
- Your tone should be that of a research briefing: present findings and explain reasoning, but do NOT prescribe what the user should do
- The user retains full authority over how to apply these insights
- Avoid vague praise ("transformative", "paradigm-shifting") - be concrete and specific
- If an idea conceded points during the rebuttal, acknowledge this honestly

Respond with your selected ideas.`;
}
