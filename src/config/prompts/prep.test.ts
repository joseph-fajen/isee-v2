/**
 * Tests for the prep agent prompt builder.
 *
 * Verifies that the querySection conditional produces structurally
 * different output based on whether refinedQuery is present, and that
 * the authority hierarchy labels are correct.
 */

import { describe, test, expect } from 'bun:test';
import { buildPrepAgentPrompt } from './prep';

describe('buildPrepAgentPrompt', () => {
  test('without refinedQuery: uses single verbatim label', () => {
    const prompt = buildPrepAgentPrompt({ originalQuery: 'Is consciousness computational?' });
    expect(prompt).toContain("USER'S QUERY (verbatim):");
    expect(prompt).toContain('Is consciousness computational?');
    expect(prompt).not.toContain('ADDITIONAL CONTEXT');
    expect(prompt).not.toContain('authoritative statement of intent');
  });

  test('with refinedQuery: labels both sections with authority hierarchy', () => {
    const prompt = buildPrepAgentPrompt({
      originalQuery: 'Is consciousness computational?',
      refinedQuery: 'Focus on integrated information theory',
    });
    expect(prompt).toContain("USER'S QUERY (verbatim — this is the authoritative statement of intent):");
    expect(prompt).toContain('Is consciousness computational?');
    expect(prompt).toContain('ADDITIONAL CONTEXT (from follow-up questions — additive only');
    expect(prompt).toContain('Focus on integrated information theory');
  });

  test('without refinedQuery: original query appears in prompt', () => {
    const query = 'How might we improve decision-making in complex organizations?';
    const prompt = buildPrepAgentPrompt({ originalQuery: query });
    expect(prompt).toContain(query);
  });
});
