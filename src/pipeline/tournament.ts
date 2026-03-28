/**
 * Stage 3: Tournament Layer
 *
 * Surfaces the strongest ideas through structured debate:
 * 1. Advocate Agents (parallel) - One per cluster argues for its angle
 * 2. Skeptic Agent (single) - Challenges all advocates
 * 3. Rebuttal (parallel) - Each advocate responds to their challenge
 *
 * See PROMPTS.md for all prompt specifications.
 */

import type {
  Cluster,
  RawResponse,
  AdvocateArgument,
  SkepticChallenge,
  Rebuttal,
  DebateEntry,
} from '../types';
import { getTopMembers } from './clustering';
import {
  generateAdvocateArgument,
  generateSkepticChallenges,
  generateRebuttal,
  type QueryContext,
} from '../clients/anthropic';
import { logger as baseLogger, type Logger } from '../utils/logger';

interface TournamentConfig {
  /** The user's query (original and optionally refined) */
  queryContext: QueryContext;
  clusters: Cluster[];
  responses: RawResponse[];
  runLogger?: Logger;
  runId?: string;
  // SSE callbacks
  onAdvocateComplete?: (clusterId: number, clusterName: string, success: boolean) => void;
  onSkepticComplete?: (challengeCount: number) => void;
  onRebuttalComplete?: (clusterId: number, clusterName: string, success: boolean) => void;
}

interface TournamentResult {
  debateEntries: DebateEntry[];
}

/**
 * Run the full tournament: advocates → skeptic → rebuttals.
 *
 * @param config - QueryContext, clusters, and raw responses
 * @returns Complete debate transcript for all clusters
 */
export async function runTournament(config: TournamentConfig): Promise<TournamentResult> {
  const { queryContext, clusters, responses, runLogger, runId } = config;
  const log = runLogger || baseLogger;

  log.info({ clusterCount: clusters.length }, 'Tournament starting');

  // Phase 3a: Run all advocates in parallel
  const advocateResults = await runAdvocates(queryContext, clusters, responses, log, config.onAdvocateComplete, runId);
  const successfulAdvocates = advocateResults.filter((r) => r.success);

  log.info(
    {
      total: clusters.length,
      successful: successfulAdvocates.length,
      failed: clusters.length - successfulAdvocates.length,
    },
    'Advocates complete'
  );

  if (successfulAdvocates.length === 0) {
    throw new Error('All advocate calls failed - cannot continue tournament');
  }

  // Phase 3b: Run skeptic (single call, sees only successful advocates)
  const advocateArgs = successfulAdvocates.map((r) => r.argument!);
  let challenges: SkepticChallenge[];
  let skepticFailed = false;

  try {
    challenges = await runSkeptic(queryContext, advocateArgs, log, runId);
    config.onSkepticComplete?.(challenges.length);
    log.info({ challengeCount: challenges.length }, 'Skeptic complete');
  } catch (error) {
    // Skeptic failed — degrade to advocates-only with reduced confidence
    skepticFailed = true;
    challenges = [];
    log.warn(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      'Skeptic agent failed — continuing with advocates only (reduced confidence)'
    );
    config.onSkepticComplete?.(0);
  }

  // Phase 3c: Run all rebuttals in parallel (skip if skeptic failed — no challenges)
  let rebuttals: RebuttalResult[] = [];
  if (!skepticFailed) {
    rebuttals = await runRebuttals(queryContext, advocateArgs, challenges, log, config.onRebuttalComplete, runId);

    const successfulRebuttals = rebuttals.filter((r) => r.success).length;
    log.info({ total: advocateArgs.length, successful: successfulRebuttals }, 'Rebuttals complete');

    if (successfulRebuttals === 0 && advocateArgs.length > 0) {
      log.warn('All rebuttals failed — presenting debate without rebuttals');
    }
  }

  // Combine into debate entries
  const debateEntries = combineDebate(advocateArgs, challenges, rebuttals, skepticFailed);

  log.info({ entryCount: debateEntries.length }, 'Tournament complete');

  return { debateEntries };
}

interface AdvocateResult {
  clusterId: number;
  success: boolean;
  argument?: AdvocateArgument;
  error?: string;
}

/**
 * Run advocate agents for all clusters in parallel.
 */
async function runAdvocates(
  queryContext: QueryContext,
  clusters: Cluster[],
  responses: RawResponse[],
  log: Logger,
  onAdvocateComplete?: (clusterId: number, clusterName: string, success: boolean) => void,
  runId?: string
): Promise<AdvocateResult[]> {
  const promises = clusters.map(async (cluster): Promise<AdvocateResult> => {
    try {
      const topMembers = getTopMembers(cluster, responses, 3);
      const topMemberContents = topMembers.map((m) => m.content);

      const argumentText = await generateAdvocateArgument(
        queryContext,
        cluster.name,
        cluster.summary,
        topMemberContents,
        log,
        runId,
        cluster.id
      );

      onAdvocateComplete?.(cluster.id, cluster.name, true);

      return {
        clusterId: cluster.id,
        success: true,
        argument: {
          clusterId: cluster.id,
          clusterName: cluster.name,
          argument: argumentText,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error(
        { clusterId: cluster.id, clusterName: cluster.name, error: errorMessage },
        'Advocate failed'
      );

      onAdvocateComplete?.(cluster.id, cluster.name, false);

      return {
        clusterId: cluster.id,
        success: false,
        error: errorMessage,
      };
    }
  });

  return Promise.all(promises);
}

/**
 * Run the skeptic agent (single call, challenges all advocates).
 */
async function runSkeptic(
  queryContext: QueryContext,
  advocateArgs: AdvocateArgument[],
  log: Logger,
  runId?: string
): Promise<SkepticChallenge[]> {
  const advocateInputs = advocateArgs.map((a) => ({
    clusterId: a.clusterId,
    clusterName: a.clusterName,
    argument: a.argument,
  }));

  const challenges = await generateSkepticChallenges(queryContext, advocateInputs, log, runId);

  return challenges;
}

interface RebuttalResult {
  clusterId: number;
  success: boolean;
  rebuttal?: Rebuttal;
  error?: string;
}

/**
 * Run rebuttal agents for all clusters in parallel.
 */
async function runRebuttals(
  queryContext: QueryContext,
  advocateArgs: AdvocateArgument[],
  challenges: SkepticChallenge[],
  log: Logger,
  onRebuttalComplete?: (clusterId: number, clusterName: string, success: boolean) => void,
  runId?: string
): Promise<RebuttalResult[]> {
  const promises = advocateArgs.map(async (arg): Promise<RebuttalResult> => {
    const challenge = challenges.find((c) => c.clusterId === arg.clusterId);

    if (!challenge) {
      // No challenge for this cluster (shouldn't happen, but handle gracefully)
      return {
        clusterId: arg.clusterId,
        success: false,
        error: 'No skeptic challenge found for this cluster',
      };
    }

    try {
      const rebuttalText = await generateRebuttal(
        queryContext,
        arg.clusterName,
        arg.argument,
        challenge.challenge,
        log,
        runId,
        arg.clusterId
      );

      onRebuttalComplete?.(arg.clusterId, arg.clusterName, true);

      return {
        clusterId: arg.clusterId,
        success: true,
        rebuttal: {
          clusterId: arg.clusterId,
          clusterName: arg.clusterName,
          rebuttal: rebuttalText,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.error(
        { clusterId: arg.clusterId, clusterName: arg.clusterName, error: errorMessage },
        'Rebuttal failed'
      );

      onRebuttalComplete?.(arg.clusterId, arg.clusterName, false);

      return {
        clusterId: arg.clusterId,
        success: false,
        error: errorMessage,
      };
    }
  });

  return Promise.all(promises);
}

/**
 * Combine all tournament phases into debate entries.
 * When skepticFailed is true, challenge and rebuttal fields reflect degraded mode.
 */
function combineDebate(
  advocateArgs: AdvocateArgument[],
  challenges: SkepticChallenge[],
  rebuttalResults: RebuttalResult[],
  skepticFailed: boolean
): DebateEntry[] {
  return advocateArgs.map((arg) => {
    const challenge = challenges.find((c) => c.clusterId === arg.clusterId);
    const rebuttalResult = rebuttalResults.find((r) => r.clusterId === arg.clusterId);

    return {
      clusterId: arg.clusterId,
      clusterName: arg.clusterName,
      advocateArgument: arg.argument,
      skepticChallenge: skepticFailed
        ? '[Skeptic unavailable — reduced confidence mode]'
        : (challenge?.challenge || '[No challenge generated]'),
      rebuttal: skepticFailed
        ? '[No rebuttal — skeptic unavailable]'
        : (rebuttalResult?.success
          ? rebuttalResult.rebuttal!.rebuttal
          : `[Rebuttal failed: ${rebuttalResult?.error || 'Unknown error'}]`),
    };
  });
}
