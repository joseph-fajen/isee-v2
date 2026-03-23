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
} from '../clients/anthropic';
import { logger as baseLogger, type Logger } from '../utils/logger';

interface TournamentConfig {
  query: string;
  clusters: Cluster[];
  responses: RawResponse[];
  runLogger?: Logger;
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
 * @param config - Query, clusters, and raw responses
 * @returns Complete debate transcript for all clusters
 */
export async function runTournament(config: TournamentConfig): Promise<TournamentResult> {
  const { query, clusters, responses, runLogger } = config;
  const log = runLogger || baseLogger;

  log.info({ clusterCount: clusters.length }, 'Tournament starting');

  // Phase 3a: Run all advocates in parallel
  const advocateResults = await runAdvocates(query, clusters, responses, log, config.onAdvocateComplete);
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
  const challenges = await runSkeptic(query, advocateArgs, log);

  config.onSkepticComplete?.(challenges.length);

  log.info({ challengeCount: challenges.length }, 'Skeptic complete');

  // Phase 3c: Run all rebuttals in parallel
  const rebuttals = await runRebuttals(query, advocateArgs, challenges, log, config.onRebuttalComplete);

  log.info(
    {
      total: advocateArgs.length,
      successful: rebuttals.filter((r) => r.success).length,
    },
    'Rebuttals complete'
  );

  // Combine into debate entries
  const debateEntries = combineDebate(advocateArgs, challenges, rebuttals);

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
  query: string,
  clusters: Cluster[],
  responses: RawResponse[],
  log: Logger,
  onAdvocateComplete?: (clusterId: number, clusterName: string, success: boolean) => void
): Promise<AdvocateResult[]> {
  const promises = clusters.map(async (cluster): Promise<AdvocateResult> => {
    try {
      const topMembers = getTopMembers(cluster, responses, 3);
      const topMemberContents = topMembers.map((m) => m.content);

      const argumentText = await generateAdvocateArgument(
        query,
        cluster.name,
        cluster.summary,
        topMemberContents,
        log
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
  query: string,
  advocateArgs: AdvocateArgument[],
  log: Logger
): Promise<SkepticChallenge[]> {
  const advocateInputs = advocateArgs.map((a) => ({
    clusterId: a.clusterId,
    clusterName: a.clusterName,
    argument: a.argument,
  }));

  const challenges = await generateSkepticChallenges(query, advocateInputs, log);

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
  query: string,
  advocateArgs: AdvocateArgument[],
  challenges: SkepticChallenge[],
  log: Logger,
  onRebuttalComplete?: (clusterId: number, clusterName: string, success: boolean) => void
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
        query,
        arg.clusterName,
        arg.argument,
        challenge.challenge,
        log
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
 */
function combineDebate(
  advocateArgs: AdvocateArgument[],
  challenges: SkepticChallenge[],
  rebuttalResults: RebuttalResult[]
): DebateEntry[] {
  return advocateArgs.map((arg) => {
    const challenge = challenges.find((c) => c.clusterId === arg.clusterId);
    const rebuttalResult = rebuttalResults.find((r) => r.clusterId === arg.clusterId);

    return {
      clusterId: arg.clusterId,
      clusterName: arg.clusterName,
      advocateArgument: arg.argument,
      skepticChallenge: challenge?.challenge || '[No challenge generated]',
      rebuttal: rebuttalResult?.success
        ? rebuttalResult.rebuttal!.rebuttal
        : `[Rebuttal failed: ${rebuttalResult?.error || 'Unknown error'}]`,
    };
  });
}
