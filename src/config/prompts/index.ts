/**
 * Pipeline Prompts — Single import point
 *
 * All pipeline prompt builders are centralized here.
 * Import from this module: import { buildPrepAgentPrompt, ... } from '../config/prompts';
 */

export { buildPrepAgentPrompt, type PrepPromptInput } from './prep';
export { buildClusteringPrompt, type ClusteringPromptInput } from './clustering';
export { buildAdvocatePrompt, type AdvocatePromptInput } from './advocate';
export { buildSkepticPrompt, type SkepticPromptInput } from './skeptic';
export { buildRebuttalPrompt, type RebuttalPromptInput } from './rebuttal';
export { buildSynthesisPrompt, type SynthesisPromptInput } from './synthesis';
export {
  buildAssessmentPrompt,
  buildQuestionGeneratorPrompt,
  buildRewriterPrompt,
  type AssessmentPromptInput,
  type QuestionGeneratorPromptInput,
  type RewriterPromptInput,
} from './refinement';
