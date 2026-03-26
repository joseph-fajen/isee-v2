import { describe, test, expect } from 'bun:test';
import { STAGE_MODELS, getModelForStage, type AgentStage } from '../src/config/agent-models';

describe('STAGE_MODELS', () => {
  test('haiku stages use claude-haiku-4-5', () => {
    const haikuStages: AgentStage[] = ['prep', 'refinement', 'translation', 'rebuttal'];
    for (const stage of haikuStages) {
      expect(STAGE_MODELS[stage]).toBe('claude-haiku-4-5');
    }
  });

  test('sonnet stages use claude-sonnet-4-5', () => {
    const sonnetStages: AgentStage[] = ['clustering', 'advocate', 'skeptic', 'synthesizer'];
    for (const stage of sonnetStages) {
      expect(STAGE_MODELS[stage]).toBe('claude-sonnet-4-5');
    }
  });

  test('covers all 8 stages', () => {
    expect(Object.keys(STAGE_MODELS)).toHaveLength(8);
  });
});

describe('getModelForStage', () => {
  test('returns correct model for each stage', () => {
    expect(getModelForStage('prep')).toBe('claude-haiku-4-5');
    expect(getModelForStage('refinement')).toBe('claude-haiku-4-5');
    expect(getModelForStage('translation')).toBe('claude-haiku-4-5');
    expect(getModelForStage('rebuttal')).toBe('claude-haiku-4-5');
    expect(getModelForStage('clustering')).toBe('claude-sonnet-4-5');
    expect(getModelForStage('advocate')).toBe('claude-sonnet-4-5');
    expect(getModelForStage('skeptic')).toBe('claude-sonnet-4-5');
    expect(getModelForStage('synthesizer')).toBe('claude-sonnet-4-5');
  });

  test('returns a string for every stage', () => {
    const stages: AgentStage[] = ['prep', 'refinement', 'translation', 'rebuttal', 'clustering', 'advocate', 'skeptic', 'synthesizer'];
    for (const stage of stages) {
      expect(typeof getModelForStage(stage)).toBe('string');
      expect(getModelForStage(stage).length).toBeGreaterThan(0);
    }
  });
});
