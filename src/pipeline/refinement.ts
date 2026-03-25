/**
 * Query Refinement — Stage -1
 *
 * Assesses query quality and, if underspecified, coordinates the
 * refinement interview flow. This module provides the server-callable
 * functions; the actual back-and-forth is managed by the server endpoints.
 */

import type { QueryAssessment, RefinementQuestion } from '../types';
import {
  assessQueryQuality,
  generateRefinementQuestions,
  rewriteQuery,
} from '../clients/anthropic';
import { logger as baseLogger, type Logger } from '../utils/logger';

/**
 * Assess whether a query needs refinement.
 */
export async function assessQuery(
  query: string,
  runLogger?: Logger,
  runId?: string
): Promise<QueryAssessment> {
  const log = runLogger || baseLogger;
  log.info({ query: query.substring(0, 100) }, 'Assessing query quality');

  const result = await assessQueryQuality(query, log, runId);

  log.info(
    {
      sufficient: result.sufficient,
      missingCriteria: result.missingCriteria,
    },
    'Query assessment complete'
  );

  return {
    sufficient: result.sufficient,
    missingCriteria: result.missingCriteria as QueryAssessment['missingCriteria'],
    reasoning: result.reasoning,
  };
}

/**
 * Generate follow-up questions for underspecified queries.
 */
export async function getFollowUpQuestions(
  query: string,
  missingCriteria: string[],
  runLogger?: Logger,
  runId?: string
): Promise<RefinementQuestion[]> {
  const log = runLogger || baseLogger;
  log.info({ missingCount: missingCriteria.length }, 'Generating follow-up questions');

  const questions = await generateRefinementQuestions(query, missingCriteria, log, runId);

  log.info({ questionCount: questions.length }, 'Follow-up questions generated');

  return questions as RefinementQuestion[];
}

/**
 * Rewrite the query incorporating user's answers.
 */
export async function rewriteUserQuery(
  originalQuery: string,
  answers: Array<{ question: string; answer: string }>,
  runLogger?: Logger,
  runId?: string
): Promise<string> {
  const log = runLogger || baseLogger;
  log.info({ answerCount: answers.length }, 'Rewriting query with user context');

  const refined = await rewriteQuery(originalQuery, answers, log, runId);

  log.info({ refinedLength: refined.length }, 'Query rewrite complete');

  return refined;
}
