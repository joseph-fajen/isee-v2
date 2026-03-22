/**
 * Test script for Phase 3 implementation.
 * Tests clustering and tournament with mock synthesis data.
 */

import { clusterResponses } from './pipeline/clustering';
import { runTournament } from './pipeline/tournament';
import { createRunLogger } from './utils/logger';
import type { RawResponse } from './types';

// Mock responses for testing (simulating synthesis output)
const mockResponses: RawResponse[] = Array.from({ length: 20 }, (_, i) => ({
  index: i,
  content: getMockContent(i),
  model: `model-${i % 3}`,
  framework: `framework-${i % 5}`,
  domain: `domain-${i % 4}`,
}));

function getMockContent(index: number): string {
  const perspectives = [
    'The key insight is that automation can remove human bottlenecks entirely. Rather than trying to improve human decision-making, we should design systems where critical decisions are encoded into protocols that execute automatically. This shifts the challenge from training humans to designing better rules.',
    'Incentive structures are the root cause of most organizational dysfunction. Process improvements fail because they don\'t address the underlying incentives that drive behavior. Realign incentives first, and processes will self-organize toward desired outcomes.',
    'Historical precedents show that complex organizational challenges are rarely "solved" - they are managed, mitigated, and adapted to. The most successful organizations accept inherent complexity rather than seeking simplistic solutions.',
    'Small-scale experimentation consistently outperforms top-down design. Rather than betting on one comprehensive solution, run many small experiments in parallel. The failures teach you about constraints, and the successes can be scaled.',
    'Cross-domain synthesis reveals unexpected solutions. By combining insights from behavioral economics, network theory, and ecological systems, we can see patterns that domain experts miss because they\'re too embedded in conventional thinking.',
    'The problem is framed incorrectly. Instead of asking "how do we improve X," we should ask "do we need X at all?" Many organizational structures exist because of historical accident, not actual necessity.',
  ];
  return perspectives[index % perspectives.length] + ` (Response ${index})`;
}

async function testPhase3() {
  const query = 'How might we improve decision-making in complex organizations?';
  const runLogger = createRunLogger('test-phase3');

  console.log('='.repeat(60));
  console.log('ISEE v2 - Phase 3 Test');
  console.log('='.repeat(60));
  console.log(`Query: ${query}`);
  console.log(`Mock responses: ${mockResponses.length}`);
  console.log('');

  // Test Clustering
  console.log('Testing Clustering Agent...');
  const clusters = await clusterResponses(mockResponses, query, runLogger);
  console.log(`Generated ${clusters.length} clusters:`);
  clusters.forEach((c) => {
    console.log(`  [${c.id}] ${c.name}`);
    console.log(`      Members: ${c.memberIndices.join(', ')}`);
  });
  console.log('');

  // Test Tournament
  console.log('Testing Tournament Layer...');
  const { debateEntries } = await runTournament({
    query,
    clusters,
    responses: mockResponses,
    runLogger,
  });
  console.log(`Generated ${debateEntries.length} debate entries:`);
  debateEntries.forEach((entry) => {
    console.log('');
    console.log(`--- Cluster: ${entry.clusterName} ---`);
    console.log(`Advocate: ${entry.advocateArgument.substring(0, 150)}...`);
    console.log(`Skeptic: ${entry.skepticChallenge.substring(0, 150)}...`);
    console.log(`Rebuttal: ${entry.rebuttal.substring(0, 150)}...`);
  });

  console.log('');
  console.log('='.repeat(60));
  console.log('Phase 3 test complete!');
}

testPhase3().catch(console.error);
