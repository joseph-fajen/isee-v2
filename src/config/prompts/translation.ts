/**
 * Stage 5: Translation Agent — Plain-Language Briefing
 *
 * Purpose: Convert Stage 4 briefing into accessible language with action items
 * Input: Full briefing (3 ideas) and refined query
 * Output: Prompt string for the Translation Agent
 *
 * Design notes:
 * - Receives briefing ideas and refined query only (NOT debate transcript)
 * - Must preserve accuracy of insights while simplifying language
 * - Must generate genuinely actionable steps, not vague suggestions
 * - Must reference user's actual constraints from the refined query
 * - Must NOT add new ideas or analysis — purely translation
 */

import type { ExtractedIdea } from '../../types';

export interface TranslationPromptInput {
  query: string;
  ideas: ExtractedIdea[];
}

export function buildTranslationPrompt(input: TranslationPromptInput): string {
  const ideasText = input.ideas
    .map(
      (idea, i) => `<idea index="${i + 1}">
<title>${idea.title}</title>
<description>${idea.description}</description>
<why_emerged>${idea.whyEmerged}</why_emerged>
<why_it_matters>${idea.whyItMatters}</why_it_matters>
</idea>`
    )
    .join('\n\n');

  return `You are a translation agent. Your job is to take intellectually rigorous analysis and make it accessible to anyone, without losing accuracy.

USER'S QUESTION:
${input.query}

IDEAS FROM ANALYSIS:
${ideasText}

YOUR TASK:
Translate each idea into plain language that a smart friend would use over coffee. For each idea, provide:

1. title — A plain-language title (no jargon, no academic phrasing). 5-10 words.
2. explanation — 2-3 sentences explaining the idea as if to someone smart but not in this field. No jargon. Focus on what it means for the user, not how it was derived.
3. whyForYou — 1-2 sentences connecting this idea to the user's specific situation and constraints (reference their question directly). Use "you" and "your".
4. actionItems — 2-3 concrete things the user could try this week. Not "consider implementing" but "put a tray by your door." Each action should be specific, immediate, and low-friction.

TRANSLATION PRINCIPLES:
- Write at an 8th-grade reading level. Replace jargon with everyday words.
- Use "you" and "your" throughout. This is a conversation, not a paper.
- Prioritize what to do over why it works intellectually.
- Simplify language without losing the actual idea. The translation must be accurate, just accessible.
- Action items must be genuinely actionable this week — not vague suggestions.
- Reference the user's specific situation from their question.
- Do NOT add new ideas or analysis. You are translating, not creating.

Also provide a plain-language version of the user's question (queryPlainLanguage) — restate it conversationally in 1-2 sentences, as if the user were explaining their problem to a friend.

Respond with the translated briefing.`;
}
