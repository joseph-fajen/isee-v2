/**
 * Stage 0: Prep Agent - Dynamic Domain Generation
 *
 * Generates 3-5 knowledge domains specific to the user's query.
 * This is a genuine LLM call that happens first, per query, every time.
 * NO fixed domain list exists anywhere in this codebase.
 *
 * See PROMPTS.md for the full prompt specification.
 */

import type { Domain } from '../types';
import { generateDomainsWithClaude } from '../clients/anthropic';
import { logger as baseLogger, type Logger } from '../utils/logger';

/**
 * Generate knowledge domains relevant to the given query.
 *
 * @param query - The user's research question
 * @param runLogger - Optional logger with run context (creates default if not provided)
 * @returns Array of 3-5 dynamically generated domains
 */
export async function generateDomains(
  query: string,
  runLogger?: Logger,
  onDomainsReady?: (domains: Domain[]) => void,
  runId?: string
): Promise<Domain[]> {
  const log = runLogger || baseLogger;

  log.info({ queryPreview: query.substring(0, 100) }, 'Prep agent starting domain generation');

  const domains = await generateDomainsWithClaude(query, log, runId);

  // Emit domains for SSE streaming
  onDomainsReady?.(domains);

  log.info(
    {
      domainCount: domains.length,
      domains: domains.map((d) => d.name),
    },
    'Prep agent generated domains'
  );

  return domains;
}
