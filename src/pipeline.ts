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

import type { PipelineConfig, ProgressEvent, Briefing, TranslatedBriefing, RunStats } from './types';
import { generateDomains } from './pipeline/prep';
import { generateSynthesisMatrix } from './pipeline/synthesis';
import { clusterResponses } from './pipeline/clustering';
import { runTournament } from './pipeline/tournament';
import { generateBriefing, renderBriefingMarkdown } from './pipeline/synthesizer';
import { translateBriefing } from './pipeline/translation';
import { createRunLogger } from './utils/logger';

export interface PipelineResult {
  briefing: Briefing;
  translatedBriefing: TranslatedBriefing;
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
  onProgress?: (progress: ProgressEvent) => void
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
    translation: 0,
  };

  const log = (msg: string) => {
    if (verbose) console.log(msg);
  };

  // Helper to emit progress with optional detail
  const emit = (
    stage: ProgressEvent['stage'],
    status: ProgressEvent['status'],
    message: string,
    options?: {
      progress?: { current: number; total: number };
      subStage?: ProgressEvent['subStage'];
      detail?: ProgressEvent['detail'];
    }
  ) => {
    const event: ProgressEvent = {
      stage,
      status,
      message,
      timestamp: new Date().toISOString(),
      ...options,
    };
    onProgress?.(event);
    log(`[${stage}] ${status}: ${message}`);
  };

  // =========================================================================
  // Stage 0: Prep Agent - Domain Generation
  // =========================================================================
  emit('prep', 'started', 'Generating knowledge domains...');
  const prepStart = Date.now();

  const domains = await generateDomains(query, runLogger, (generatedDomains) => {
    emit('prep', 'progress', `Generated ${generatedDomains.length} domains`, {
      detail: {
        type: 'domains',
        domains: generatedDomains.map(d => ({ name: d.name, description: d.description, focus: d.focus })),
      },
    });
  });

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
      emit('synthesis', 'progress', `${current}/${total} calls completed`, { progress: { current, total } });
    },
    (detail) => {
      emit('synthesis', 'progress', `${detail.modelId} + ${detail.frameworkId}`, {
        detail: {
          type: 'response',
          ...detail,
        },
      });
    }
  );

  stageDurations.synthesis = Date.now() - synthesisStart;
  emit('synthesis', 'completed', `Generated ${responses.length} responses`);

  // =========================================================================
  // Stage 2: Clustering Agent - Emergent Clustering
  // =========================================================================
  emit('clustering', 'started', 'Identifying intellectual angles...');
  const clusteringStart = Date.now();

  const clusters = await clusterResponses(responses, query, runLogger, (identifiedClusters) => {
    emit('clustering', 'progress', `Identified ${identifiedClusters.length} clusters`, {
      detail: {
        type: 'clusters',
        clusters: identifiedClusters.map(c => ({ id: c.id, name: c.name, memberCount: c.memberIndices.length })),
      },
    });
  });

  stageDurations.clustering = Date.now() - clusteringStart;
  emit('clustering', 'completed', `Identified ${clusters.length} distinct angles`);

  // =========================================================================
  // Stage 3: Tournament Layer - Debate
  // =========================================================================
  emit('tournament', 'started', 'Running tournament debate...');
  const tournamentStart = Date.now();

  let advocatesCompleted = 0;
  let rebuttalsCompleted = 0;
  const totalClusters = clusters.length;

  const { debateEntries } = await runTournament({
    query,
    clusters,
    responses,
    runLogger,
    onAdvocateComplete: (clusterId, clusterName, success) => {
      advocatesCompleted++;
      emit('tournament', 'progress', `Advocate ${advocatesCompleted}/${totalClusters}: ${clusterName}`, {
        subStage: 'advocates',
        progress: { current: advocatesCompleted, total: totalClusters },
        detail: { type: 'advocate', clusterId, clusterName, success },
      });
    },
    onSkepticComplete: (challengeCount) => {
      emit('tournament', 'progress', `Skeptic challenged ${challengeCount} advocates`, {
        subStage: 'skeptic',
      });
    },
    onRebuttalComplete: (clusterId, clusterName, success) => {
      rebuttalsCompleted++;
      emit('tournament', 'progress', `Rebuttal ${rebuttalsCompleted}/${totalClusters}: ${clusterName}`, {
        subStage: 'rebuttals',
        progress: { current: rebuttalsCompleted, total: totalClusters },
        detail: { type: 'rebuttal', clusterId, clusterName, success },
      });
    },
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
    runLogger,
    onIdeasReady: (ideas) => {
      emit('synthesizer', 'progress', `Selected ${ideas.length} ideas`, {
        detail: {
          type: 'ideas',
          ideas: ideas.map((idea, i) => ({
            title: idea.title,
            criterion: ['Most Surprising', 'Most Actionable', 'Most Assumption-Challenging'][i] || 'Selected',
          })),
        },
      });
    },
  });

  // Attach refinement metadata if present
  if (config.refinement) {
    briefing.refinement = config.refinement;
  }

  briefing.stats.stageDurations.synthesizer = Date.now() - synthesizerStart;

  emit('synthesizer', 'completed', `Briefing generated with ${briefing.ideas.length} ideas`);

  // =========================================================================
  // Stage 5: Translation Agent - Plain-Language Briefing
  // =========================================================================
  emit('translation', 'started', 'Translating briefing to plain language...');
  const translationStart = Date.now();

  const translatedBriefing = await translateBriefing({
    briefing,
    runLogger,
    onTranslationReady: (ideas) => {
      emit('translation', 'progress', `Translated ${ideas.length} ideas`, {
        detail: {
          type: 'translated',
          ideas: ideas.map((idea) => ({
            title: idea.title,
            actionItemCount: idea.actionItems.length,
          })),
        },
      });
    },
  });

  stageDurations.translation = Date.now() - translationStart;
  emit('translation', 'completed', `Translation complete`);

  // Update final stats
  briefing.stats.totalDurationMs = Date.now() - startTime;

  runLogger.info(
    {
      runId,
      totalDurationMs: Date.now() - startTime,
      ideasGenerated: briefing.ideas.length,
    },
    'Pipeline complete'
  );

  // Render markdown
  const markdown = renderBriefingMarkdown(translatedBriefing);

  return { briefing, translatedBriefing, markdown };
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
