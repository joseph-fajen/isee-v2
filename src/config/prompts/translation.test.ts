/**
 * Tests for the translation prompt builder.
 *
 * Verifies that the queryPlainLanguage instruction uses faithful
 * restatement language (not conversational simplification), and that
 * the old bug text is absent.
 */

import { describe, test, expect } from 'bun:test';
import { buildTranslationPrompt } from './translation';

const minimalInput = {
  query: 'How might we improve decision-making in complex organizations?',
  ideas: [
    {
      title: 'Test Idea',
      description: 'A test description.',
      whyEmerged: 'It emerged from synthesis.',
      whyItMatters: 'It matters because of this.',
    },
    {
      title: 'Test Idea 2',
      description: 'Another test description.',
      whyEmerged: 'It emerged from synthesis too.',
      whyItMatters: 'It also matters.',
    },
    {
      title: 'Test Idea 3',
      description: 'Third test description.',
      whyEmerged: 'Third emergence.',
      whyItMatters: 'Third importance.',
    },
  ],
};

describe('buildTranslationPrompt — queryPlainLanguage instruction', () => {
  test('emphasizes faithful restatement, not conversational simplification', () => {
    const prompt = buildTranslationPrompt(minimalInput);
    expect(prompt).toContain('faithful restatement');
    expect(prompt).toContain('preserves their original framing');
    expect(prompt).toContain('NOT a simplification');
  });

  test('old conversational simplification language is absent', () => {
    const prompt = buildTranslationPrompt(minimalInput);
    expect(prompt).not.toContain('as if the user were explaining their problem to a friend');
    expect(prompt).not.toContain('restate it conversationally');
  });

  test('includes the user query in the prompt', () => {
    const prompt = buildTranslationPrompt(minimalInput);
    expect(prompt).toContain(minimalInput.query);
  });
});
