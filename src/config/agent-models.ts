/**
 * Agent Model Configuration
 *
 * Maps each pipeline stage to the appropriate Claude model.
 * Simpler tasks use claude-haiku-4-5 for cost efficiency;
 * complex reasoning tasks use claude-sonnet-4-5 for quality.
 */

/** Pipeline stage names for agent model lookup. */
export type AgentStage =
  | 'prep'
  | 'refinement'
  | 'translation'
  | 'rebuttal'
  | 'clustering'
  | 'advocate'
  | 'skeptic'
  | 'synthesizer';

/**
 * Model assignments per pipeline stage.
 * Haiku for simpler/mechanical tasks; Sonnet for complex reasoning.
 */
export const STAGE_MODELS: Record<AgentStage, string> = {
  // Simpler tasks — structured extraction or mechanical rewriting
  prep:        'claude-haiku-4-5',
  refinement:  'claude-haiku-4-5',
  translation: 'claude-haiku-4-5',
  rebuttal:    'claude-haiku-4-5',

  // Complex reasoning tasks — clustering, argumentation, synthesis
  clustering:  'claude-sonnet-4-5',
  advocate:    'claude-sonnet-4-5',
  skeptic:     'claude-sonnet-4-5',
  synthesizer: 'claude-sonnet-4-5',
};

/**
 * Returns the Claude model ID to use for a given pipeline stage.
 *
 * @param stage - The pipeline stage name
 * @returns Anthropic model ID string
 */
export function getModelForStage(stage: AgentStage): string {
  return STAGE_MODELS[stage];
}
