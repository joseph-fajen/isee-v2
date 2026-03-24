/**
 * ISEE v2 - Type Definitions
 *
 * These interfaces define the data contracts between pipeline stages.
 * See ARCHITECTURE.md for detailed stage-by-stage design.
 */

// ============================================================================
// Stage 0: Prep Agent Output
// ============================================================================

/**
 * A knowledge domain generated dynamically for a specific query.
 * Domains are invented fresh for each run - no fixed domain list exists.
 */
export interface Domain {
  /** Short name, e.g. "Behavioral Economics" */
  name: string;
  /** One sentence description of this domain */
  description: string;
  /** What specific angle or lens this domain contributes to the query */
  focus: string;
}

// ============================================================================
// Stage 1: Synthesis Layer Output
// ============================================================================

/**
 * A single response from the synthesis matrix.
 * Metadata (model, framework, domain) is preserved but withheld from clustering.
 */
export interface RawResponse {
  /** Unique index for this response (0-based) */
  index: number;
  /** The actual response content from the LLM */
  content: string;
  /** Which model produced this response - withheld from clustering agent */
  model: string;
  /** Which cognitive framework was used - withheld from clustering agent */
  framework: string;
  /** Which knowledge domain was applied - withheld from clustering agent */
  domain: string;
  /** Token count for cost tracking (optional) */
  tokens?: number;
  /** Response time in ms (optional) */
  responseTimeMs?: number;
}

/**
 * Content-only version of RawResponse for the clustering agent.
 * Source metadata is stripped to ensure emergent clustering.
 */
export interface AnonymizedResponse {
  index: number;
  content: string;
}

// ============================================================================
// Stage 2: Clustering Agent Output
// ============================================================================

/**
 * A cluster of responses grouped by intellectual angle.
 * Names should be argument-style (e.g., "Automate the human layer out")
 * not topic-style (e.g., "Technology Solutions").
 */
export interface Cluster {
  /** Unique cluster ID (1-based) */
  id: number;
  /** Argument-style name (8-12 words), e.g., "Replace governance with protocol-level incentives" */
  name: string;
  /** Two-sentence summary of what this angle claims and why it's distinctive */
  summary: string;
  /** Indices of responses belonging to this cluster */
  memberIndices: number[];
}

// ============================================================================
// Stage 3: Tournament Layer Types
// ============================================================================

/**
 * An advocate's argument for why their cluster's angle is most valuable.
 */
export interface AdvocateArgument {
  clusterId: number;
  clusterName: string;
  /** The advocate's 150-200 word argument */
  argument: string;
}

/**
 * The skeptic's challenge to a specific advocate.
 */
export interface SkepticChallenge {
  clusterId: number;
  clusterName: string;
  /** The skeptic's targeted challenge (max 100 words) */
  challenge: string;
}

/**
 * An advocate's rebuttal to the skeptic's challenge.
 */
export interface Rebuttal {
  clusterId: number;
  clusterName: string;
  /** The advocate's 100-150 word rebuttal */
  rebuttal: string;
}

/**
 * Complete debate record for one cluster.
 */
export interface DebateEntry {
  clusterId: number;
  clusterName: string;
  advocateArgument: string;
  skepticChallenge: string;
  rebuttal: string;
}

// ============================================================================
// Stage 4: Synthesis Agent Output
// ============================================================================

/**
 * One of the 3 extracted ideas in the final briefing.
 */
export interface ExtractedIdea {
  /** Concise title for the idea */
  title: string;
  /** 2-3 sentence description of the idea */
  description: string;
  /** Which angle produced it, how it survived debate */
  whyEmerged: string;
  /** The confidence narrative - specific, not generic */
  whyItMatters: string;
}

/**
 * The final briefing document produced by ISEE.
 */
export interface Briefing {
  /** The query used for analysis (original or refined) */
  query: string;
  /** Refinement metadata — shows if/how the query was improved */
  refinement?: RefinementMetadata;
  /** ISO timestamp of when the analysis completed */
  timestamp: string;
  /** The 3 extracted ideas */
  ideas: ExtractedIdea[];
  /** Full debate transcript for optional "show more" section */
  debateTranscript: DebateEntry[];
  /** Domains generated for this query */
  domains: Domain[];
  /** Statistics about the run */
  stats: RunStats;
}

// ============================================================================
// Stage 5: Translation Agent Output
// ============================================================================

/**
 * A simplified version of an extracted idea for plain-language presentation.
 */
export interface SimplifiedIdea {
  /** Plain-language title */
  title: string;
  /** 2-3 sentence accessible explanation */
  explanation: string;
  /** Personal connection to user's constraints */
  whyForYou: string;
  /** 2-3 concrete action steps */
  actionItems: string[];
}

/**
 * The translated briefing combining plain-language output with original analysis.
 */
export interface TranslatedBriefing {
  /** Conversational version of the refined query */
  queryPlainLanguage: string;
  /** Simplified versions of the 3 ideas */
  ideas: SimplifiedIdea[];
  /** Full Stage 4 output preserved exactly */
  originalBriefing: Briefing;
}

// ============================================================================
// Query Refinement Types
// ============================================================================

/**
 * Result of assessing query quality against the 4 criteria.
 */
export interface QueryAssessment {
  /** Whether the query is sufficient to proceed */
  sufficient: boolean;
  /** Which criteria are missing (if any) */
  missingCriteria: Array<'decision' | 'constraints' | 'perspective' | 'openness'>;
  /** Brief explanation of the assessment */
  reasoning: string;
}

/**
 * A follow-up question generated for the user.
 */
export interface RefinementQuestion {
  /** Which missing criterion this question targets */
  targetsCriterion: 'decision' | 'constraints' | 'perspective' | 'openness';
  /** The question to ask the user */
  question: string;
}

/**
 * User's answer to a refinement question.
 */
export interface RefinementAnswer {
  question: string;
  answer: string;
}

/**
 * Complete refinement metadata for the briefing.
 */
export interface RefinementMetadata {
  /** The original query as entered by the user */
  originalQuery: string;
  /** Whether refinement was triggered */
  wasRefined: boolean;
  /** Follow-up Q&A if refinement occurred */
  answers?: RefinementAnswer[];
  /** The refined query (if refinement occurred) */
  refinedQuery?: string;
}

// ============================================================================
// Pipeline Orchestration Types
// ============================================================================

/**
 * Statistics about a pipeline run.
 */
export interface RunStats {
  /** Total number of synthesis calls made */
  synthesisCallCount: number;
  /** Number of successful synthesis calls */
  successfulCalls: number;
  /** Number of clusters identified */
  clusterCount: number;
  /** Total pipeline duration in ms */
  totalDurationMs: number;
  /** Breakdown of time per stage */
  stageDurations: {
    prep: number;
    synthesis: number;
    clustering: number;
    tournament: number;
    synthesizer: number;
    translation: number;
  };
}

/**
 * Configuration for a pipeline run.
 */
export interface PipelineConfig {
  /** The user's query */
  query: string;
  /** Refinement metadata to include in the briefing */
  refinement?: RefinementMetadata;
  /** Number of models to use (default: 6) */
  modelCount?: number;
  /** Maximum concurrent API calls (default: 10) */
  concurrencyLimit?: number;
  /** Enable verbose logging (default: false) */
  verbose?: boolean;
}

/**
 * Progress update emitted during pipeline execution.
 */
export interface PipelineProgress {
  stage: 'refinement' | 'prep' | 'synthesis' | 'clustering' | 'tournament' | 'synthesizer' | 'translation';
  status: 'started' | 'progress' | 'completed' | 'error';
  message: string;
  /** For synthesis stage: current/total calls */
  progress?: {
    current: number;
    total: number;
  };
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * A cognitive framework template.
 */
export interface CognitiveFramework {
  /** Unique identifier, e.g., "analytical" */
  id: string;
  /** Display name, e.g., "Analytical Framework" */
  name: string;
  /** Emoji icon for UI */
  icon: string;
  /** The prompt template - {query} and {domain} are replaced at runtime */
  promptTemplate: string;
}

/**
 * A model configuration for the synthesis layer.
 */
export interface SynthesisModel {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** OpenRouter model ID, e.g., "anthropic/claude-sonnet-4" */
  openRouterId: string;
  /** Brief description of what makes this model valuable */
  description: string;
  /** Cost tier for reference */
  costTier: 'budget' | 'standard' | 'premium';
  /** Optional max tokens override for thinking models that need more headroom */
  maxTokens?: number;
}

// ============================================================================
// Production Layer Types
// ============================================================================

/**
 * Persisted record for a single pipeline execution.
 */
export interface RunRecord {
  id: string;
  apiKeyId?: string;
  query: string;
  refinedQuery?: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  errorMessage?: string;

  // Stats
  synthesisCallCount?: number;
  successfulCalls?: number;
  clusterCount?: number;

  // Cost
  totalCostUsd?: number;
  openrouterCostUsd?: number;
  anthropicCostUsd?: number;
}

/**
 * Telemetry record for a single LLM API call within a run.
 */
export interface LlmCallRecord {
  runId: string;
  stage: string;
  provider: 'openrouter' | 'anthropic';
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  success: boolean;
  errorType?: string;
  errorMessage?: string;
  costUsd?: number;
  framework?: string;
  domain?: string;
  clusterId?: number;
  timestamp: string;
}

// ============================================================================
// API Response Types
// ============================================================================

/**
 * API response wrapper.
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Request body for starting a new analysis.
 */
export interface AnalyzeRequest {
  query: string;
}

/**
 * Response when analysis starts.
 */
export interface AnalyzeStartResponse {
  runId: string;
  message: string;
}

// ============================================================================
// SSE Progress Event Types
// ============================================================================

/**
 * Rich progress event for SSE streaming.
 * Extends basic progress with timestamps, details, and sub-stages.
 */
export interface ProgressEvent {
  /** Pipeline stage */
  stage: 'refinement' | 'prep' | 'synthesis' | 'clustering' | 'tournament' | 'synthesizer' | 'translation';
  /** Event status */
  status: 'started' | 'progress' | 'completed' | 'error';
  /** Human-readable message */
  message: string;
  /** ISO timestamp */
  timestamp: string;
  /** Progress counters (for synthesis, advocates, rebuttals) */
  progress?: {
    current: number;
    total: number;
  };
  /** Tournament sub-stage */
  subStage?: 'advocates' | 'skeptic' | 'rebuttals';
  /** Stage-specific detail payload */
  detail?: ProgressDetail;
}

/**
 * Stage-specific detail payloads.
 */
export type ProgressDetail =
  | PrepDetail
  | SynthesisDetail
  | ClusteringDetail
  | TournamentDetail
  | SynthesizerDetail
  | TranslationDetail;

export interface PrepDetail {
  type: 'domains';
  domains: Array<{ name: string; description: string; focus: string }>;
}

export interface SynthesisDetail {
  type: 'response';
  modelId: string;
  frameworkId: string;
  domainName: string;
  responseTimeMs?: number;
  success: boolean;
  error?: string;
}

export interface ClusteringDetail {
  type: 'clusters';
  clusters: Array<{ id: number; name: string; memberCount: number }>;
}

export interface TournamentDetail {
  type: 'advocate' | 'skeptic' | 'rebuttal';
  clusterId: number;
  clusterName: string;
  success: boolean;
}

export interface SynthesizerDetail {
  type: 'ideas';
  ideas: Array<{ title: string; criterion: string }>;
}

export interface TranslationDetail {
  type: 'translated';
  ideas: Array<{ title: string; actionItemCount: number }>;
}
