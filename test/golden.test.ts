import { describe, test, expect } from 'bun:test';
import { runPipeline } from '../src/pipeline';
import goldenQueries from './golden-queries.json';

describe('Golden Query Tests', () => {
  for (const query of goldenQueries) {
    test(`Golden: ${query.id}`, async () => {
      const result = await runPipeline({ query: query.query });

      expect(result.briefing.ideas.length).toBeGreaterThanOrEqual(query.expectations.minIdeas);
      expect(result.briefing.stats.clusterCount).toBeGreaterThanOrEqual(query.expectations.minClusters);
      expect(result.briefing.stats.clusterCount).toBeLessThanOrEqual(query.expectations.maxClusters);
      expect(result.briefing.stats.totalDurationMs).toBeLessThan(query.expectations.maxDurationMs);
    }, 480000); // 8 minute timeout (buffer beyond 7min pipeline timeout)
  }
});
