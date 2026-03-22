/**
 * ISEE v2 Pipeline Orchestrator
 *
 * Runs all pipeline stages in sequence:
 * Stage 0: Prep Agent (domain generation)
 * Stage 1: Synthesis Layer (matrix generation)
 * Stage 2: Clustering Agent (emergent clustering)
 * Stage 3: Tournament Layer (advocates, skeptic, rebuttals)
 * Stage 4: Synthesis Agent (briefing generation)
 */

import type { PipelineConfig, PipelineProgress, Briefing, RunStats } from './types';
import { generateDomains } from './pipeline/prep';
import { generateSynthesisMatrix } from './pipeline/synthesis';
import { clusterResponses } from './pipeline/clustering';
import { runTournament } from './pipeline/tournament';
import { generateBriefing, renderBriefingMarkdown } from './pipeline/synthesizer';
import { createRunLogger } from './utils/logger';

export interface PipelineResult {
  briefing: Briefing;
  markdown: string;
}

/**
 * Run the complete ISEE pipeline.
 *
 * @param config - Pipeline configuration
 * @param onProgress - Optional callback for progress updates
 * @returns The final briefing and rendered markdown
 */
export async function runPipeline(
  config: PipelineConfig,
  onProgress?: (progress: PipelineProgress) => void
): Promise<PipelineResult> {
  const { query, concurrencyLimit = 10, verbose = false } = config;
  const startTime = Date.now();

  const runId = crypto.randomUUID();
  const runLogger = createRunLogger(runId);

  runLogger.info({ query: query.substring(0, 100) }, 'Pipeline starting');

  const stageDurations = {
    prep: 0,
    synthesis: 0,
    clustering: 0,
    tournament: 0,
    synthesizer: 0,
  };

  const log = (msg: string) => {
    if (verbose) console.log(msg);
  };

  // Helper to emit progress
  const emit = (
    stage: PipelineProgress['stage'],
    status: PipelineProgress['status'],
    message: string,
    progress?: { current: number; total: number }
  ) => {
    onProgress?.({ stage, status, message, progress });
    log(`[${stage}] ${status}: ${message}`);
  };

  // =========================================================================
  // Stage 0: Prep Agent - Domain Generation
  // =========================================================================
  emit('prep', 'started', 'Generating knowledge domains...');
  const prepStart = Date.now();

  const domains = await generateDomains(query, runLogger);

  stageDurations.prep = Date.now() - prepStart;
  emit('prep', 'completed', `Generated ${domains.length} domains`);

  // =========================================================================
  // Stage 1: Synthesis Layer - Matrix Generation
  // =========================================================================
  emit('synthesis', 'started', 'Generating response matrix...');
  const synthesisStart = Date.now();

  const responses = await generateSynthesisMatrix(
    { query, domains, concurrencyLimit, runLogger },
    (current, total) => {
      emit('synthesis', 'progress', `${current}/${total} calls completed`, { current, total });
    }
  );

  stageDurations.synthesis = Date.now() - synthesisStart;
  emit('synthesis', 'completed', `Generated ${responses.length} responses`);

  // =========================================================================
  // Stage 2: Clustering Agent - Emergent Clustering
  // =========================================================================
  emit('clustering', 'started', 'Identifying intellectual angles...');
  const clusteringStart = Date.now();

  const clusters = await clusterResponses(responses, query);

  stageDurations.clustering = Date.now() - clusteringStart;
  emit('clustering', 'completed', `Identified ${clusters.length} distinct angles`);

  // =========================================================================
  // Stage 3: Tournament Layer - Debate
  // =========================================================================
  emit('tournament', 'started', 'Running tournament debate...');
  const tournamentStart = Date.now();

  const { debateEntries } = await runTournament({
    query,
    clusters,
    responses,
  });

  stageDurations.tournament = Date.now() - tournamentStart;
  emit('tournament', 'completed', `Debate complete with ${debateEntries.length} entries`);

  // =========================================================================
  // Stage 4: Synthesis Agent - Briefing Generation
  // =========================================================================
  emit('synthesizer', 'started', 'Generating final briefing...');
  const synthesizerStart = Date.now();

  const partialStats: Partial<RunStats> = {
    synthesisCallCount: responses.length,
    successfulCalls: responses.length, // TODO: Track actual failures
    stageDurations,
  };

  const briefing = await generateBriefing({
    query,
    domains,
    debateEntries,
    stats: partialStats,
  });

  // Update final stats
  briefing.stats.totalDurationMs = Date.now() - startTime;
  briefing.stats.stageDurations.synthesizer = Date.now() - synthesizerStart;

  emit('synthesizer', 'completed', `Briefing generated with ${briefing.ideas.length} ideas`);

  runLogger.info(
    {
      runId,
      totalDurationMs: Date.now() - startTime,
      ideasGenerated: briefing.ideas.length,
    },
    'Pipeline complete'
  );

  // Render markdown
  const markdown = renderBriefingMarkdown(briefing);

  return { briefing, markdown };
}

/**
 * CLI entry point for running the pipeline directly.
 */
async function main() {
  const query = process.argv[2] || 'How might we improve decision-making in complex organizations?';

  console.log('='.repeat(60));
  console.log('ISEE v2 Pipeline');
  console.log('='.repeat(60));
  console.log(`Query: ${query}`);
  console.log('='.repeat(60));
  console.log('');

  const result = await runPipeline(
    { query, verbose: true },
    (progress) => {
      // Progress is logged by the verbose flag
    }
  );

  console.log('');
  console.log('='.repeat(60));
  console.log('BRIEFING OUTPUT');
  console.log('='.repeat(60));
  console.log('');
  console.log(result.markdown);

  // Save to file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `output/isee-briefing-${timestamp}.md`;
  await Bun.write(filename, result.markdown);
  console.log(`\nSaved to: ${filename}`);
}

// Run if executed directly
if (import.meta.main) {
  main().catch(console.error);
}
