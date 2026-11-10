import { describe, test, expect } from 'bun:test';
import { isReasoningRejection } from './openrouter';

describe('isReasoningRejection', () => {
  const err = (status: number, message: string) => Object.assign(new Error(message), { status });

  test('true for a 400 about reasoning', () => {
    expect(isReasoningRejection(err(400, 'Reasoning is mandatory for this endpoint and cannot be disabled.'))).toBe(true);
  });
  test('false for a 400 about something else', () => {
    expect(isReasoningRejection(err(400, 'max_tokens too large'))).toBe(false);
  });
  test('false for a non-400 that mentions reasoning', () => {
    expect(isReasoningRejection(err(500, 'reasoning service unavailable'))).toBe(false);
  });
});
