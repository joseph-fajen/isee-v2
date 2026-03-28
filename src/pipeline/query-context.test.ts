/**
 * Tests for QueryContext construction via buildQueryContext helper.
 *
 * Covers all three branches of the dual-query logic:
 * 1. No refinement: originalQuery = query, refinedQuery = undefined
 * 2. wasRefined=true: originalQuery = refinement.originalQuery, refinedQuery = query
 * 3. wasRefined=false: refinedQuery is undefined even if originalQuery is set
 */

import { describe, test, expect } from 'bun:test';
import { buildQueryContext } from '../pipeline';

describe('buildQueryContext', () => {
  test('no refinement: originalQuery equals query, refinedQuery is undefined', () => {
    const ctx = buildQueryContext('what is consciousness?', undefined);
    expect(ctx.originalQuery).toBe('what is consciousness?');
    expect(ctx.refinedQuery).toBeUndefined();
  });

  test('wasRefined=true: originalQuery from refinement.originalQuery, refinedQuery is query', () => {
    const ctx = buildQueryContext(
      'what is consciousness? (refined: focus on neuroscience)',
      { originalQuery: 'what is consciousness?', wasRefined: true }
    );
    expect(ctx.originalQuery).toBe('what is consciousness?');
    expect(ctx.refinedQuery).toBe('what is consciousness? (refined: focus on neuroscience)');
  });

  test('wasRefined=false: refinedQuery is undefined even if originalQuery is set', () => {
    const ctx = buildQueryContext('query', { originalQuery: 'original', wasRefined: false });
    expect(ctx.originalQuery).toBe('original');
    expect(ctx.refinedQuery).toBeUndefined();
  });

  test('refinement without originalQuery: falls back to query as originalQuery', () => {
    // This covers the `?? query` fallback invariant
    const ctx = buildQueryContext('fallback query', { wasRefined: false });
    expect(ctx.originalQuery).toBe('fallback query');
    expect(ctx.refinedQuery).toBeUndefined();
  });
});
