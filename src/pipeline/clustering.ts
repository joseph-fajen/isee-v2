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
import { clusterResponsesWithClaude, type QueryContext } from '../clients/anthropic';
import { logger as baseLogger, type Logger } from '../utils/logger';

/**
 * Cluster responses by emergent intellectual angle.
 *
 * @param responses - Raw responses (metadata will be stripped)
 * @param queryContext - The user's query (original and optionally refined)
 * @param runLogger - Optional logger with run context
 * @returns Array of 5-7 clusters with argument-style names
 */
export async function clusterResponses(
  responses: RawResponse[],
  queryContext: QueryContext,
  runLogger?: Logger,
  onClustersReady?: (clusters: Cluster[]) => void,
  runId?: string
): Promise<Cluster[]> {
  const log = runLogger || baseLogger;

  // Strip metadata - clustering agent sees content only
  const anonymized = anonymizeResponses(responses);

  log.info({ responseCount: anonymized.length }, 'Clustering agent starting');

  const clusters = await clusterResponsesWithClaude(queryContext, anonymized, log, runId);

  // Validate all indices are assigned
  const validation = validateClusterAssignments(clusters, responses.length);
  if (!validation.valid) {
    log.warn(
      {
        issues: validation.issues,
        clusterCount: clusters.length,
        responseCount: responses.length,
      },
      'Cluster assignment validation warnings'
    );
  }

  // Emit clusters for SSE streaming
  onClustersReady?.(clusters);

  log.info(
    {
      clusterCount: clusters.length,
      clusterNames: clusters.map((c) => c.name),
    },
    'Clustering agent complete'
  );

  return clusters;
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
 * Validate that cluster assignments cover all responses exactly once.
 */
function validateClusterAssignments(
  clusters: Cluster[],
  totalResponses: number
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const assignedIndices = new Set<number>();

  for (const cluster of clusters) {
    for (const idx of cluster.memberIndices) {
      if (idx < 0 || idx >= totalResponses) {
        issues.push(`Invalid index ${idx} in cluster "${cluster.name}" (valid range: 0-${totalResponses - 1})`);
      } else if (assignedIndices.has(idx)) {
        issues.push(`Duplicate assignment: index ${idx} appears in multiple clusters`);
      } else {
        assignedIndices.add(idx);
      }
    }
  }

  // Check for unassigned indices
  for (let i = 0; i < totalResponses; i++) {
    if (!assignedIndices.has(i)) {
      issues.push(`Unassigned response: index ${i} not in any cluster`);
    }
  }

  return { valid: issues.length === 0, issues };
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
