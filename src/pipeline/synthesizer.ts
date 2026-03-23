/**
 * Stage 4: Synthesis Agent - Briefing Generation
 *
 * Reads the full debate transcript and selects 3 ideas.
 * Produces the final briefing document with confidence narratives.
 *
 * Selection criteria:
 * 1. Most surprising - least likely to emerge from single direct query
 * 2. Most actionable - points toward something the user can actually do
 * 3. Most assumption-challenging - challenges beliefs the user probably holds
 *
 * NOTE: The prompt for this stage is deferred to implementation phase
 * where real debate transcripts can be used for testing and tuning.
 */

import type { Domain, DebateEntry, ExtractedIdea, Briefing, RunStats } from '../types';
import { generateBriefingWithClaude } from '../clients/anthropic';
import { logger as baseLogger, type Logger } from '../utils/logger';

interface SynthesizerConfig {
  query: string;
  domains: Domain[];
  debateEntries: DebateEntry[];
  stats: Partial<RunStats>;
  runLogger?: Logger;
  onIdeasReady?: (ideas: ExtractedIdea[]) => void;
}

/**
 * Generate the final briefing from the debate transcript.
 *
 * @param config - Query, debate entries, and run statistics
 * @returns Complete briefing document
 */
export async function generateBriefing(config: SynthesizerConfig): Promise<Briefing> {
  const { query, domains, debateEntries, stats, runLogger, onIdeasReady } = config;
  const log = runLogger || baseLogger;

  log.info({ debateEntryCount: debateEntries.length }, 'Synthesis agent starting');

  // Call the LLM to select and explain 3 ideas
  const ideas = await generateBriefingWithClaude(query, debateEntries, log);

  // Emit ideas for SSE streaming
  onIdeasReady?.(ideas);

  log.info(
    {
      ideaCount: ideas.length,
      ideaTitles: ideas.map((i) => i.title),
    },
    'Synthesis agent complete'
  );

  const briefing: Briefing = {
    query,
    timestamp: new Date().toISOString(),
    ideas,
    debateTranscript: debateEntries,
    domains,
    stats: {
      synthesisCallCount: stats.synthesisCallCount || 0,
      successfulCalls: stats.successfulCalls || 0,
      clusterCount: debateEntries.length,
      totalDurationMs: stats.totalDurationMs || 0,
      stageDurations: stats.stageDurations || {
        prep: 0,
        synthesis: 0,
        clustering: 0,
        tournament: 0,
        synthesizer: 0,
      },
    },
  };

  return briefing;
}

/**
 * Render the briefing as Markdown.
 */
export function renderBriefingMarkdown(briefing: Briefing): string {
  const lines: string[] = [];

  lines.push(`# ISEE Briefing`);
  lines.push('');
  lines.push(`**Query**: ${briefing.query}`);

  // Show refinement info if query was refined
  if (briefing.refinement?.wasRefined) {
    lines.push('');
    lines.push(`> *Original query*: "${briefing.refinement.originalQuery}"`);
    lines.push('>');
    lines.push('> *ISEE refined this query based on your additional context.*');
  }

  lines.push(`**Generated**: ${new Date(briefing.timestamp).toLocaleString()}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Render each idea
  briefing.ideas.forEach((idea, index) => {
    lines.push(`## Idea ${index + 1}: ${idea.title}`);
    lines.push('');
    lines.push(idea.description);
    lines.push('');
    lines.push(`**Why this emerged**: ${idea.whyEmerged}`);
    lines.push('');
    lines.push(`**Why it matters**: ${idea.whyItMatters}`);
    lines.push('');
    lines.push('---');
    lines.push('');
  });

  // Expandable debate transcript
  lines.push('<details>');
  lines.push('<summary>Show full debate transcript</summary>');
  lines.push('');

  briefing.debateTranscript.forEach((entry) => {
    lines.push(`### ${entry.clusterName}`);
    lines.push('');
    lines.push('**Advocate Argument:**');
    lines.push(entry.advocateArgument);
    lines.push('');
    lines.push('**Skeptic Challenge:**');
    lines.push(entry.skepticChallenge);
    lines.push('');
    lines.push('**Rebuttal:**');
    lines.push(entry.rebuttal);
    lines.push('');
    lines.push('---');
    lines.push('');
  });

  lines.push('</details>');
  lines.push('');

  // Stats footer
  lines.push('---');
  lines.push('');
  lines.push('*Analysis Statistics:*');
  lines.push(`- Synthesis calls: ${briefing.stats.synthesisCallCount}`);
  lines.push(`- Clusters analyzed: ${briefing.stats.clusterCount}`);
  lines.push(`- Total duration: ${(briefing.stats.totalDurationMs / 1000).toFixed(1)}s`);

  return lines.join('\n');
}
