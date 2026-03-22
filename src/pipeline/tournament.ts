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

interface TournamentConfig {
  query: string;
  clusters: Cluster[];
  responses: RawResponse[];
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
  const { query, clusters, responses } = config;

  console.log(`[tournament] Starting debate with ${clusters.length} clusters`);

  // Phase 3a: Run all advocates in parallel
  const advocateArgs = await runAdvocates(query, clusters, responses);
  console.log(`[tournament] ${advocateArgs.length} advocates completed`);

  // Phase 3b: Run skeptic (single call, sees all advocates)
  const challenges = await runSkeptic(query, advocateArgs);
  console.log(`[tournament] Skeptic challenged all advocates`);

  // Phase 3c: Run all rebuttals in parallel
  const rebuttals = await runRebuttals(query, advocateArgs, challenges);
  console.log(`[tournament] ${rebuttals.length} rebuttals completed`);

  // Combine into debate entries
  const debateEntries = combineDebate(advocateArgs, challenges, rebuttals);

  return { debateEntries };
}

/**
 * Run advocate agents for all clusters in parallel.
 */
async function runAdvocates(
  query: string,
  clusters: Cluster[],
  responses: RawResponse[]
): Promise<AdvocateArgument[]> {
  // TODO: Phase 3 implementation
  // - Use Anthropic Claude SDK
  // - Run all advocates in parallel (Promise.all)
  // - Apply Advocate prompt from PROMPTS.md
  // - Include top 2-3 member responses per cluster

  // Stub: Return mock advocate arguments
  return clusters.map((cluster) => ({
    clusterId: cluster.id,
    clusterName: cluster.name,
    argument: `[STUB] Advocate argument for "${cluster.name}".\n\nThis angle represents the most valuable response because it challenges conventional assumptions and provides actionable insight that ordinary prompting would miss. The convergence of multiple reasoning paths on this conclusion suggests genuine intellectual merit.`,
  }));
}

/**
 * Run the skeptic agent (single call, challenges all advocates).
 */
async function runSkeptic(
  query: string,
  advocateArgs: AdvocateArgument[]
): Promise<SkepticChallenge[]> {
  // TODO: Phase 3 implementation
  // - Use Anthropic Claude SDK
  // - Apply Skeptic prompt from PROMPTS.md
  // - Parse JSON response with challenges array

  // Stub: Return mock challenges
  return advocateArgs.map((arg) => ({
    clusterId: arg.clusterId,
    clusterName: arg.clusterName,
    challenge: `[STUB] Challenge to "${arg.clusterName}".\n\nIs this actually novel, or could it emerge from a single well-crafted prompt? The claimed value appears rhetorical rather than concrete.`,
  }));
}

/**
 * Run rebuttal agents for all clusters in parallel.
 */
async function runRebuttals(
  query: string,
  advocateArgs: AdvocateArgument[],
  challenges: SkepticChallenge[]
): Promise<Rebuttal[]> {
  // TODO: Phase 3 implementation
  // - Use Anthropic Claude SDK
  // - Run all rebuttals in parallel (Promise.all)
  // - Apply Rebuttal prompt from PROMPTS.md

  // Stub: Return mock rebuttals
  return advocateArgs.map((arg) => {
    const challenge = challenges.find((c) => c.clusterId === arg.clusterId);
    return {
      clusterId: arg.clusterId,
      clusterName: arg.clusterName,
      rebuttal: `[STUB] Rebuttal for "${arg.clusterName}".\n\nThe skeptic's challenge rests on a false assumption. This angle could not emerge from single-model querying because it represents the convergence of multiple distinct reasoning paths - a phenomenon only visible through combinatorial synthesis.`,
    };
  });
}

/**
 * Combine all tournament phases into debate entries.
 */
function combineDebate(
  advocateArgs: AdvocateArgument[],
  challenges: SkepticChallenge[],
  rebuttals: Rebuttal[]
): DebateEntry[] {
  return advocateArgs.map((arg) => {
    const challenge = challenges.find((c) => c.clusterId === arg.clusterId);
    const rebuttal = rebuttals.find((r) => r.clusterId === arg.clusterId);

    return {
      clusterId: arg.clusterId,
      clusterName: arg.clusterName,
      advocateArgument: arg.argument,
      skepticChallenge: challenge?.challenge || '[No challenge]',
      rebuttal: rebuttal?.rebuttal || '[No rebuttal]',
    };
  });
}
