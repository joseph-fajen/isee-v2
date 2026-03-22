/**
 * Test script for Phase 2 implementation.
 * Runs synthesis with the full model set (6 models × 11 frameworks = 66 calls)
 */

import { generateDomains } from './pipeline/prep';
import { generateSynthesisMatrix } from './pipeline/synthesis';
import { createRunLogger } from './utils/logger';
import { MODELS } from './config/models';

async function testSynthesis() {
  const query = 'How might we improve decision-making in complex organizations?';
  const runLogger = createRunLogger('test-run');

  console.log('='.repeat(60));
  console.log('ISEE v2 - Phase 2 Test');
  console.log('='.repeat(60));
  console.log(`Query: ${query}`);
  console.log('');

  // Test Prep Agent
  console.log('Testing Prep Agent...');
  const domains = await generateDomains(query, runLogger);
  console.log(`Generated ${domains.length} domains:`);
  domains.forEach((d) => console.log(`  - ${d.name}: ${d.focus}`));
  console.log('');

  // Test Synthesis Layer (full matrix with progress logging)
  console.log('Testing Synthesis Layer...');
  console.log(`Expected calls: ${MODELS.length} models × 11 frameworks = ${MODELS.length * 11}`);

  const responses = await generateSynthesisMatrix(
    { query, domains, concurrencyLimit: 5, runLogger },
    (current, total) => {
      process.stdout.write(`\rProgress: ${current}/${total}`);
    }
  );

  console.log(''); // newline after progress
  console.log(`Received ${responses.length} responses`);

  // Show sample response
  if (responses.length > 0) {
    const sample = responses[0];
    console.log('');
    console.log('Sample response:');
    console.log(`  Model: ${sample.model}`);
    console.log(`  Framework: ${sample.framework}`);
    console.log(`  Domain: ${sample.domain}`);
    console.log(`  Duration: ${sample.responseTimeMs}ms`);
    console.log(`  Content preview: ${sample.content.substring(0, 200)}...`);
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Test complete!');
}

testSynthesis().catch(console.error);
