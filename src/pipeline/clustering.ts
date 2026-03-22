/**
 * Stage 2: Emergent Clustering Agent
 *
 * Discovers the genuine intellectual shape of the response space.
 * CRITICAL: Receives response content ONLY - no source metadata.
 * This ensures clusters represent genuine intellectual angles rather
 * than reflecting the source dimensions (model, framework, domain).
 *
 * See PROMPTS.md for the full prompt specification.
 */

import type { RawResponse, AnonymizedResponse, Cluster } from '../types';

/**
 * Cluster responses by emergent intellectual angle.
 *
 * @param responses - Raw responses (metadata will be stripped)
 * @param query - Original query for context
 * @returns Array of 5-7 clusters with argument-style names
 */
export async function clusterResponses(
  responses: RawResponse[],
  query: string
): Promise<Cluster[]> {
  // Strip metadata - clustering agent sees content only
  const anonymized = anonymizeResponses(responses);

  console.log(`[clustering] Analyzing ${anonymized.length} responses for emergent angles`);

  // TODO: Phase 3 implementation
  // - Use Anthropic Claude SDK
  // - Apply the Clustering Agent prompt from PROMPTS.md
  // - Parse JSON response
  // - Validate 5-7 clusters returned
  // - Ensure all indices are assigned exactly once

  // Stub: Return mock clusters for pipeline testing
  const mockClusters: Cluster[] = [
    {
      id: 1,
      name: 'Automate the human decision layer out of existence',
      summary:
        'This angle argues that human judgment is the bottleneck. Rather than improving human processes, remove humans from the loop entirely through protocol-level automation.',
      memberIndices: [0, 5, 12, 23, 34, 45],
    },
    {
      id: 2,
      name: 'The problem lives in incentive structures not processes',
      summary:
        'This angle claims that process redesign is futile without addressing underlying incentives. Fix the incentives and processes will self-organize.',
      memberIndices: [1, 8, 15, 28, 41],
    },
    {
      id: 3,
      name: 'Small-scale experimentation beats top-down design every time',
      summary:
        'This angle rejects grand solutions in favor of rapid iteration. Let many small experiments compete rather than betting on one comprehensive approach.',
      memberIndices: [2, 9, 19, 31, 48],
    },
    {
      id: 4,
      name: 'Historical patterns show this problem is fundamentally unsolvable',
      summary:
        'This angle draws on historical precedents to argue the problem has no permanent solution. The best strategy is mitigation and adaptation rather than resolution.',
      memberIndices: [3, 11, 22, 37, 52],
    },
    {
      id: 5,
      name: 'Cross-domain synthesis reveals an unexpected third path',
      summary:
        'This angle combines insights from seemingly unrelated fields to propose a novel approach that existing domain experts would not naturally discover.',
      memberIndices: [4, 7, 14, 26, 39, 55],
    },
  ];

  console.log(`[clustering] Identified ${mockClusters.length} distinct intellectual angles`);
  return mockClusters;
}

/**
 * Strip source metadata from responses for clustering.
 * The clustering agent must not know which model/framework/domain produced each response.
 */
function anonymizeResponses(responses: RawResponse[]): AnonymizedResponse[] {
  return responses.map((r) => ({
    index: r.index,
    content: r.content,
  }));
}

/**
 * Get the top member responses for a cluster (by length and specificity).
 * Used to provide the Advocate with the strongest representatives.
 */
export function getTopMembers(
  cluster: Cluster,
  responses: RawResponse[],
  count: number = 3
): RawResponse[] {
  const members = cluster.memberIndices
    .map((idx) => responses[idx])
    .filter(Boolean)
    // Sort by content length as proxy for specificity
    .sort((a, b) => b.content.length - a.content.length);

  return members.slice(0, count);
}
