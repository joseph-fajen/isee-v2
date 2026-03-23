/**
 * Stage 5: Translation Agent - Plain-Language Briefing
 *
 * Converts the Stage 4 briefing into accessible language with concrete action items.
 * The original briefing is preserved for users who want the full analysis.
 *
 * Input: Briefing (3 ideas) + refined query
 * Output: TranslatedBriefing with plain-language ideas and action items
 *
 * NOTE: The Translation Agent receives ideas and query only,
 * NOT the debate transcript — that's preserved in output but not re-translated.
 */

import type { Briefing, TranslatedBriefing, SimplifiedIdea } from '../types';
import { translateBriefingWithClaude } from '../clients/anthropic';
import { logger as baseLogger, type Logger } from '../utils/logger';

interface TranslationConfig {
  briefing: Briefing;
  runLogger?: Logger;
  onTranslationReady?: (ideas: SimplifiedIdea[]) => void;
}

/**
 * Translate the briefing into plain language with action items.
 *
 * @param config - Briefing to translate and logger
 * @returns TranslatedBriefing with simplified ideas and original preserved
 */
export async function translateBriefing(config: TranslationConfig): Promise<TranslatedBriefing> {
  const { briefing, runLogger, onTranslationReady } = config;
  const log = runLogger || baseLogger;

  log.info({ ideaCount: briefing.ideas.length }, 'Translation agent starting');

  const result = await translateBriefingWithClaude(
    briefing.query,
    briefing.ideas,
    log
  );

  // Emit translated ideas for SSE streaming
  onTranslationReady?.(result.ideas);

  log.info(
    {
      ideaCount: result.ideas.length,
      ideaTitles: result.ideas.map((i) => i.title),
    },
    'Translation agent complete'
  );

  return {
    queryPlainLanguage: result.queryPlainLanguage,
    ideas: result.ideas,
    originalBriefing: briefing,
  };
}
