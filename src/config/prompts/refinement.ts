/**
 * Prompts for Query Refinement — Stage -1
 *
 * Three prompts:
 * 1. Quality Assessor — evaluates query against 4 criteria
 * 2. Question Generator — creates targeted follow-up questions
 * 3. Query Rewriter — produces enhanced query from original + answers
 */

// ============================================================================
// Quality Assessment Prompt
// ============================================================================

export interface AssessmentPromptInput {
  query: string;
}

export function buildAssessmentPrompt(input: AssessmentPromptInput): string {
  return `You are a query quality assessor for ISEE, a thinking amplifier that synthesizes diverse AI perspectives to extract breakthrough ideas.

Your job is to evaluate whether a user's query has enough substance for ISEE to produce valuable results.

A query is "sufficient" when it addresses at least 3 of these 4 criteria:

1. **Decision/Problem** — States the actual decision or problem, not just a topic. "How can I improve my business?" is a topic. "Should we pivot our B2B SaaS from self-serve to enterprise sales given our declining growth?" is a decision.

2. **Constraints** — Includes relevant constraints (time, resources, context) that shape viable solutions.

3. **Perspective** — Specifies who is asking and why it matters to them (role, stakes, situation).

4. **Openness** — Is open enough to benefit from multiple angles. Not so narrow that only one answer exists.

If the query is missing 2 or more of these criteria, it is "underspecified" and should be refined.

Evaluate this query:

"${input.query}"

Determine:
- Which criteria are met vs missing
- Whether the query is sufficient (missing 0-1 criteria) or underspecified (missing 2+ criteria)
- A brief reasoning for your assessment`;
}

// ============================================================================
// Question Generator Prompt
// ============================================================================

export interface QuestionGeneratorPromptInput {
  query: string;
  missingCriteria: string[];
}

export function buildQuestionGeneratorPrompt(input: QuestionGeneratorPromptInput): string {
  const criteriaDescriptions: Record<string, string> = {
    decision: 'the actual decision or problem (not just a topic)',
    constraints: 'relevant constraints like time, resources, or context',
    perspective: 'who is asking and why it matters to them',
    openness: 'enough openness to benefit from multiple angles',
  };

  const missingDescriptions = input.missingCriteria
    .map(c => `- **${c}**: ${criteriaDescriptions[c] || c}`)
    .join('\n');

  return `You are helping a user refine their query for ISEE, a thinking amplifier that synthesizes 60+ AI perspectives to extract breakthrough ideas.

The user entered this query:
"${input.query}"

This query is missing the following quality criteria:
${missingDescriptions}

Generate 2-3 targeted follow-up questions that will fill in the missing information. Each question should:
- Be concise and conversational (not academic or formal)
- Target exactly one missing criterion
- Be easy to answer in 1-2 sentences
- Not repeat information already present in the query

Return exactly one question per missing criterion (2-3 questions total).`;
}

// ============================================================================
// Query Rewriter Prompt
// ============================================================================

export interface RewriterPromptInput {
  originalQuery: string;
  answers: Array<{ question: string; answer: string }>;
}

export function buildRewriterPrompt(input: RewriterPromptInput): string {
  const qaPairs = input.answers
    .map(a => `Q: ${a.question}\nA: ${a.answer}`)
    .join('\n\n');

  return `You are a query rewriter for ISEE, a thinking amplifier that synthesizes 60+ AI perspectives to extract breakthrough ideas.

The user entered this original query:
"${input.originalQuery}"

They then answered these follow-up questions to add context:

${qaPairs}

Rewrite the original query into a single, well-structured research question that:
- Incorporates all the context from the user's answers
- Preserves the user's original intent and voice
- Is specific enough to produce targeted results
- Is open enough to benefit from multiple angles
- Reads naturally as a single question/prompt (not a list of requirements)
- Is 2-4 sentences long

Return ONLY the rewritten query, nothing else.`;
}
