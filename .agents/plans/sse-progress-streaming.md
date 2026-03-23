# Feature: SSE Progress Streaming + Activity Log

The following plan should be complete, but validate documentation and codebase patterns before implementing.

Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

Add real-time progress streaming via Server-Sent Events (SSE) to the ISEE v2 web UI. Users will see continuous updates during the 2-3 minute pipeline run, including:

- **Domain names** appearing during Prep stage
- **Model/framework names + completion count** during Synthesis (~66 calls)
- **Cluster names** appearing during Clustering
- **Tournament sub-stages** (Advocates, Skeptic, Rebuttals) with per-cluster progress
- **Idea titles** appearing during final Synthesis

Additionally, a **scrolling activity log** (visible by default, toggleable) shows timestamped entries for users who want detailed visibility into pipeline execution.

## User Story

As a user waiting for ISEE analysis results
I want to see continuous real-time updates about what ISEE is doing
So that I stay engaged during the 2-3 minute pipeline run and understand how my query is being processed

## Problem Statement

The current UI shows static stage labels and fakes progress with 500ms delays, then blocks until the full pipeline completes. Users see no meaningful feedback for 2-3 minutes, creating a poor experience and uncertainty about whether the system is working.

## Solution Statement

Add a new SSE endpoint (`GET /api/analyze/stream`) that streams progress events as they occur. Extend each pipeline stage to emit rich intermediate events. Update the frontend to consume events via `EventSource`, updating stage indicators in real-time and populating a scrolling activity log.

## Feature Metadata

**Feature Type**: Enhancement
**Estimated Complexity**: Medium-High
**Primary Systems Affected**: `src/server.ts`, `src/pipeline.ts`, `src/pipeline/*.ts`, `src/types.ts`, `public/index.html`
**Dependencies**: None new (uses native Bun streaming + browser EventSource)

---

## CONTEXT REFERENCES

### Relevant Codebase Files - IMPORTANT: READ THESE FILES BEFORE IMPLEMENTING!

**Type Definitions:**
- `src/types.ts` (lines 200-212) - Current `PipelineProgress` interface to extend
- `src/types.ts` (lines 16-23) - `Domain` interface for prep stage events
- `src/types.ts` (lines 68-77) - `Cluster` interface for clustering stage events

**Server:**
- `src/server.ts` (lines 20-82) - Current request handler, add SSE endpoint here
- `src/server.ts` (lines 39-77) - `/api/analyze` POST handler pattern to reference

**Pipeline Orchestrator:**
- `src/pipeline.ts` (lines 32-35) - `runPipeline` signature with `onProgress` callback
- `src/pipeline.ts` (lines 56-65) - `emit()` helper function pattern
- `src/pipeline.ts` (lines 70-145) - Stage execution with emit calls

**Pipeline Stages:**
- `src/pipeline/prep.ts` (lines 22-38) - `generateDomains()` - add callback for domains
- `src/pipeline/synthesis.ts` (lines 37-128) - `generateSynthesisMatrix()` - already has progress callback, enhance with details
- `src/pipeline/synthesis.ts` (lines 66-108) - Per-call execution with model/framework/domain available
- `src/pipeline/clustering.ts` (lines 24-62) - `clusterResponses()` - add callback for clusters
- `src/pipeline/tournament.ts` (lines 45-98) - `runTournament()` - add callbacks for sub-stages
- `src/pipeline/tournament.ts` (lines 109-145) - Advocate parallel execution
- `src/pipeline/tournament.ts` (lines 151-165) - Skeptic single call
- `src/pipeline/tournament.ts` (lines 177-228) - Rebuttal parallel execution
- `src/pipeline/synthesizer.ts` (lines 34-72) - `generateBriefing()` - add callback for ideas

**Frontend:**
- `public/index.html` (lines 265-290) - Progress section HTML structure
- `public/index.html` (lines 302-328) - `setStageStatus()` function
- `public/index.html` (lines 330-395) - `analyze()` function to replace with EventSource

**Logging:**
- `src/utils/logger.ts` - Structured logging patterns

### New Files to Create

None - all changes are updates to existing files.

### Relevant Documentation - READ THESE BEFORE IMPLEMENTING!

- [MDN: Using Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
  - Section: Event stream format
  - Why: Defines SSE event format (`data:`, `event:`, `id:` fields)

- [Bun Streams Documentation](https://bun.com/docs/runtime/streams)
  - Section: ReadableStream with direct controller
  - Why: Shows how to create streaming responses in Bun

- [JavaScript.info: Server Sent Events](https://javascript.info/server-sent-events)
  - Section: EventSource reconnection and error handling
  - Why: Client-side EventSource best practices

### Patterns to Follow

**SSE Event Format (from MDN):**
```
event: progress
data: {"stage":"synthesis","message":"15/66 completed"}

event: complete
data: {"briefing":{...},"markdown":"..."}
```

**Bun ReadableStream for SSE:**
```typescript
const stream = new ReadableStream({
  type: 'direct',
  async pull(controller) {
    // Write events with flush for immediate delivery
    controller.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    controller.flush();
  }
});

return new Response(stream, {
  headers: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  },
});
```

**Current Progress Emission Pattern (from pipeline.ts:56-65):**
```typescript
const emit = (
  stage: PipelineProgress['stage'],
  status: PipelineProgress['status'],
  message: string,
  progress?: { current: number; total: number }
) => {
  onProgress?.({ stage, status, message, progress });
};
```

**Auto-scroll with User Override:**
```javascript
function shouldAutoScroll(container) {
  const threshold = 50;
  return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
}
```

---

## IMPLEMENTATION PLAN

### Phase 1: Extend Types

Add rich progress event types to support SSE streaming.

**Tasks:**
- Add `ProgressEvent` interface with timestamp, details, subStage fields
- Add stage-specific detail types (domain, response, cluster, etc.)

### Phase 2: SSE Server Endpoint

Create the streaming endpoint in the server.

**Tasks:**
- Add `GET /api/analyze/stream` SSE endpoint
- Implement ReadableStream with direct controller
- Wire progress callback to stream writer
- Handle completion and errors

### Phase 3: Enrich Pipeline Emissions

Update each stage to emit rich progress events.

**Tasks:**
- Prep: Emit domain names after generation
- Synthesis: Emit model/framework/domain per call (enhance existing)
- Clustering: Emit cluster names after identification
- Tournament: Emit per-advocate, skeptic, per-rebuttal progress
- Synthesizer: Emit idea titles after selection

### Phase 4: Frontend EventSource + Activity Log

Update UI to consume SSE and display activity log.

**Tasks:**
- Replace fetch() with EventSource
- Add activity log container (visible by default, toggleable)
- Update stage indicators from events
- Implement auto-scroll with user override
- Handle completion and error events

### Phase 5: Testing & Validation

Verify end-to-end streaming works correctly.

**Tasks:**
- Test SSE endpoint manually with curl
- Test full pipeline via web UI
- Verify activity log updates and toggle
- Test error handling

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

---

### Task 1: UPDATE src/types.ts - Add ProgressEvent interface

- **IMPLEMENT**: Add rich `ProgressEvent` interface for SSE streaming
- **PATTERN**: Follow existing interface style in types.ts
- **IMPORTS**: None needed
- **GOTCHA**: Keep backward compatible with existing `PipelineProgress`
- **VALIDATE**: `bun run typecheck`

**Add after PipelineProgress interface (around line 213):**
```typescript
// ============================================================================
// SSE Progress Event Types
// ============================================================================

/**
 * Rich progress event for SSE streaming.
 * Extends basic progress with timestamps, details, and sub-stages.
 */
export interface ProgressEvent {
  /** Pipeline stage */
  stage: 'prep' | 'synthesis' | 'clustering' | 'tournament' | 'synthesizer';
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
  | SynthesizerDetail;

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
```

---

### Task 2: UPDATE src/server.ts - Add SSE endpoint

- **IMPLEMENT**: Add `GET /api/analyze/stream` SSE endpoint with ReadableStream
- **PATTERN**: Use Bun's native ReadableStream with direct controller
- **IMPORTS**: Add `runPipeline` import, add `ProgressEvent` type
- **GOTCHA**: Must flush after each write for immediate delivery; handle stream cleanup
- **VALIDATE**: `bun run typecheck && curl -N "http://localhost:3000/api/analyze/stream?query=test"`

**Add new handler in handleRequest function (after line 35, before POST /api/analyze):**
```typescript
  // SSE: Stream analysis progress
  if (method === 'GET' && path === '/api/analyze/stream') {
    const query = url.searchParams.get('query');

    if (!query) {
      return new Response('Missing query parameter', { status: 400 });
    }

    console.log(`[server] Starting SSE stream for query: ${query.substring(0, 50)}...`);

    const encoder = new TextEncoder();
    let streamClosed = false;

    const stream = new ReadableStream({
      type: 'direct',
      async pull(controller: ReadableStreamDirectController) {
        const sendEvent = (event: string, data: unknown) => {
          if (streamClosed) return;
          const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.write(encoder.encode(payload));
          controller.flush();
        };

        const sendProgress = (progressEvent: ProgressEvent) => {
          sendEvent('progress', progressEvent);
        };

        try {
          const result = await runPipeline(
            { query, verbose: false },
            (progress) => {
              // Convert basic progress to rich event
              const event: ProgressEvent = {
                stage: progress.stage,
                status: progress.status,
                message: progress.message,
                timestamp: new Date().toISOString(),
                progress: progress.progress,
              };
              sendProgress(event);
            }
          );

          // Save briefing to file
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `output/isee-briefing-${timestamp}.md`;
          await Bun.write(filename, result.markdown);
          console.log(`[server] Saved briefing to: ${filename}`);

          // Send completion event
          sendEvent('complete', {
            briefing: result.briefing,
            markdown: result.markdown,
          });

        } catch (error) {
          console.error('[server] SSE pipeline error:', error);
          sendEvent('error', {
            message: error instanceof Error ? error.message : 'Pipeline failed',
          });
        } finally {
          streamClosed = true;
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }
```

**Also add import at top of file:**
```typescript
import type { ProgressEvent } from './types';
```

---

### Task 3: UPDATE src/pipeline.ts - Enhance emit helper for rich events

- **IMPLEMENT**: Update emit helper to support rich ProgressEvent with details
- **PATTERN**: Extend existing emit pattern, maintain backward compatibility
- **IMPORTS**: Update ProgressEvent import
- **GOTCHA**: Must pass detail through from stage callbacks
- **VALIDATE**: `bun run typecheck`

**Update the emit helper and add detail parameter (lines 56-65):**
```typescript
  // Helper to emit progress with optional detail
  const emit = (
    stage: ProgressEvent['stage'],
    status: ProgressEvent['status'],
    message: string,
    options?: {
      progress?: { current: number; total: number };
      subStage?: ProgressEvent['subStage'];
      detail?: ProgressEvent['detail'];
    }
  ) => {
    const event: ProgressEvent = {
      stage,
      status,
      message,
      timestamp: new Date().toISOString(),
      ...options,
    };
    onProgress?.(event);
    log(`[${stage}] ${status}: ${message}`);
  };
```

**Update the function signature (line 32-35):**
```typescript
export async function runPipeline(
  config: PipelineConfig,
  onProgress?: (progress: ProgressEvent) => void
): Promise<PipelineResult> {
```

**Update import at top:**
```typescript
import type { PipelineConfig, ProgressEvent, Briefing, RunStats } from './types';
```

---

### Task 4: UPDATE src/pipeline/prep.ts - Emit domain names

- **IMPLEMENT**: Add callback to emit domain names after generation
- **PATTERN**: Pass callback through, emit once domains are ready
- **IMPORTS**: Add ProgressEvent, PrepDetail types
- **GOTCHA**: Domains come as array from single LLM call, emit all at once
- **VALIDATE**: `bun run typecheck`

**Update function signature (line 22):**
```typescript
export async function generateDomains(
  query: string,
  runLogger?: Logger,
  onDomainsReady?: (domains: Domain[]) => void
): Promise<Domain[]> {
```

**Add callback invocation after line 27 (after generateDomainsWithClaude returns):**
```typescript
  const domains = await generateDomainsWithClaude(query, log);

  // Emit domains for SSE streaming
  onDomainsReady?.(domains);

  log.info(
```

**Update call in pipeline.ts (around line 73):**
```typescript
  const domains = await generateDomains(query, runLogger, (domains) => {
    emit('prep', 'progress', `Generated ${domains.length} domains`, {
      detail: {
        type: 'domains',
        domains: domains.map(d => ({ name: d.name, description: d.description, focus: d.focus })),
      },
    });
  });
```

---

### Task 5: UPDATE src/pipeline/synthesis.ts - Emit model/framework per call

- **IMPLEMENT**: Add detailed callback for each synthesis call completion
- **PATTERN**: Enhance existing onProgress with per-call details
- **IMPORTS**: Add SynthesisDetail type
- **GOTCHA**: Call inside finally block after response is ready
- **VALIDATE**: `bun run typecheck`

**Update function signature to add onDetail callback (line 37-40):**
```typescript
export async function generateSynthesisMatrix(
  config: SynthesisConfig,
  onProgress?: (current: number, total: number) => void,
  onResponseComplete?: (detail: {
    modelId: string;
    frameworkId: string;
    domainName: string;
    responseTimeMs?: number;
    success: boolean;
    error?: string;
  }) => void
): Promise<RawResponse[]> {
```

**Add callback invocation in the promise handler (after line 89, before finally):**
```typescript
        responses.push(response);

        // Emit detail for SSE
        onResponseComplete?.({
          modelId: combo.model.id,
          frameworkId: combo.framework.id,
          domainName: combo.domain.name,
          responseTimeMs: result.durationMs,
          success: true,
        });
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        failures.push({
          model: combo.model.id,
          framework: combo.framework.id,
          domain: combo.domain.name,
          error: errorMessage,
        });

        // Emit failure for SSE
        onResponseComplete?.({
          modelId: combo.model.id,
          frameworkId: combo.framework.id,
          domainName: combo.domain.name,
          success: false,
          error: errorMessage,
        });
      } finally {
```

**Update call in pipeline.ts (around line 84-89):**
```typescript
  const responses = await generateSynthesisMatrix(
    { query, domains, concurrencyLimit, runLogger },
    (current, total) => {
      emit('synthesis', 'progress', `${current}/${total} calls completed`, { progress: { current, total } });
    },
    (detail) => {
      emit('synthesis', 'progress', `${detail.modelId} + ${detail.frameworkId}`, {
        detail: {
          type: 'response',
          ...detail,
        },
      });
    }
  );
```

---

### Task 6: UPDATE src/pipeline/clustering.ts - Emit cluster names

- **IMPLEMENT**: Add callback to emit cluster names after clustering completes
- **PATTERN**: Pass callback through, emit once clusters are ready
- **IMPORTS**: None needed (Cluster already imported)
- **GOTCHA**: Clusters come as array from single LLM call
- **VALIDATE**: `bun run typecheck`

**Update function signature (line 24-28):**
```typescript
export async function clusterResponses(
  responses: RawResponse[],
  query: string,
  runLogger?: Logger,
  onClustersReady?: (clusters: Cluster[]) => void
): Promise<Cluster[]> {
```

**Add callback invocation after validation (around line 50):**
```typescript
  // Emit clusters for SSE streaming
  onClustersReady?.(clusters);

  log.info(
```

**Update call in pipeline.ts (around line 100):**
```typescript
  const clusters = await clusterResponses(responses, query, runLogger, (clusters) => {
    emit('clustering', 'progress', `Identified ${clusters.length} clusters`, {
      detail: {
        type: 'clusters',
        clusters: clusters.map(c => ({ id: c.id, name: c.name, memberCount: c.memberIndices.length })),
      },
    });
  });
```

---

### Task 7: UPDATE src/pipeline/tournament.ts - Emit tournament sub-stage progress

- **IMPLEMENT**: Add callbacks for advocates, skeptic, and rebuttals phases
- **PATTERN**: Pass callbacks through runTournament to sub-functions
- **IMPORTS**: None needed
- **GOTCHA**: Advocates and rebuttals run in parallel, emit as each completes
- **VALIDATE**: `bun run typecheck`

**Update TournamentConfig interface (around line 29):**
```typescript
interface TournamentConfig {
  query: string;
  clusters: Cluster[];
  responses: RawResponse[];
  runLogger?: Logger;
  // SSE callbacks
  onAdvocateComplete?: (clusterId: number, clusterName: string, success: boolean) => void;
  onSkepticComplete?: (challengeCount: number) => void;
  onRebuttalComplete?: (clusterId: number, clusterName: string, success: boolean) => void;
}
```

**Add callback invocations in runAdvocates (inside try block, after argument is generated, around line 130):**
```typescript
      config.onAdvocateComplete?.(cluster.id, cluster.name, true);
      return result;
    } catch (error) {
      // ... existing error handling
      config.onAdvocateComplete?.(cluster.id, cluster.name, false);
```

**Add callback invocation in runSkeptic (after challenges are generated, around line 163):**
```typescript
  config.onSkepticComplete?.(challenges.length);
  return challenges;
```

**Add callback invocations in runRebuttals (inside try block, around line 210):**
```typescript
      config.onRebuttalComplete?.(advocateArg.clusterId, advocateArg.clusterName, true);
      return result;
    } catch (error) {
      // ... existing error handling
      config.onRebuttalComplete?.(advocateArg.clusterId, advocateArg.clusterName, false);
```

**Update call in pipeline.ts (around line 111-116):**
```typescript
  let advocatesCompleted = 0;
  let rebuttalsCompleted = 0;
  const totalClusters = clusters.length;

  const { debateEntries } = await runTournament({
    query,
    clusters,
    responses,
    runLogger,
    onAdvocateComplete: (clusterId, clusterName, success) => {
      advocatesCompleted++;
      emit('tournament', 'progress', `Advocate ${advocatesCompleted}/${totalClusters}: ${clusterName}`, {
        subStage: 'advocates',
        progress: { current: advocatesCompleted, total: totalClusters },
        detail: { type: 'advocate', clusterId, clusterName, success },
      });
    },
    onSkepticComplete: (challengeCount) => {
      emit('tournament', 'progress', `Skeptic challenged ${challengeCount} advocates`, {
        subStage: 'skeptic',
      });
    },
    onRebuttalComplete: (clusterId, clusterName, success) => {
      rebuttalsCompleted++;
      emit('tournament', 'progress', `Rebuttal ${rebuttalsCompleted}/${totalClusters}: ${clusterName}`, {
        subStage: 'rebuttals',
        progress: { current: rebuttalsCompleted, total: totalClusters },
        detail: { type: 'rebuttal', clusterId, clusterName, success },
      });
    },
  });
```

---

### Task 8: UPDATE src/pipeline/synthesizer.ts - Emit idea titles

- **IMPLEMENT**: Add callback to emit idea titles after synthesis completes
- **PATTERN**: Pass callback through, emit once ideas are ready
- **IMPORTS**: None needed (ExtractedIdea already available)
- **GOTCHA**: Ideas come as array from single LLM call
- **VALIDATE**: `bun run typecheck`

**Update SynthesizerConfig interface (around line 36):**
```typescript
interface SynthesizerConfig {
  query: string;
  domains: Domain[];
  debateEntries: DebateEntry[];
  stats: Partial<RunStats>;
  runLogger?: Logger;
  onIdeasReady?: (ideas: ExtractedIdea[]) => void;
}
```

**Add callback invocation after ideas are generated (around line 57):**
```typescript
  const ideas = await generateBriefingWithClaude(query, debateEntries, log);

  // Emit ideas for SSE streaming
  config.onIdeasReady?.(ideas);

  log.info(
```

**Update call in pipeline.ts (around line 133):**
```typescript
  const briefing = await generateBriefing({
    query,
    domains,
    debateEntries,
    stats: partialStats,
    runLogger,
    onIdeasReady: (ideas) => {
      emit('synthesizer', 'progress', `Selected ${ideas.length} ideas`, {
        detail: {
          type: 'ideas',
          ideas: ideas.map((idea, i) => ({
            title: idea.title,
            criterion: ['Most Surprising', 'Most Actionable', 'Most Assumption-Challenging'][i] || 'Selected',
          })),
        },
      });
    },
  });
```

---

### Task 9: UPDATE public/index.html - Add activity log container and toggle

- **IMPLEMENT**: Add toggleable activity log container below progress section
- **PATTERN**: Follow existing CSS variable usage and styling
- **GOTCHA**: Log visible by default; toggle button changes text
- **VALIDATE**: Manual browser check

**Add CSS for activity log (before closing </style> tag, around line 245):**
```css
    /* Activity Log */
    .activity-section {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      display: none;
    }

    .activity-section.active {
      display: block;
    }

    .activity-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }

    .activity-title {
      font-weight: 600;
      color: var(--text-primary);
    }

    .activity-toggle {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text-secondary);
      padding: 0.25rem 0.75rem;
      font-size: 0.85rem;
      border-radius: 4px;
      cursor: pointer;
      width: auto;
    }

    .activity-toggle:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .activity-log {
      background: var(--bg-tertiary);
      border-radius: 8px;
      padding: 1rem;
      max-height: 300px;
      overflow-y: auto;
      font-family: 'SF Mono', Monaco, 'Courier New', monospace;
      font-size: 0.8rem;
      line-height: 1.5;
    }

    .activity-log.hidden {
      display: none;
    }

    .log-entry {
      color: var(--text-secondary);
      margin-bottom: 0.25rem;
    }

    .log-entry .timestamp {
      color: var(--text-secondary);
      opacity: 0.6;
      margin-right: 0.5rem;
    }

    .log-entry .stage {
      color: var(--accent);
      font-weight: 500;
      margin-right: 0.5rem;
    }

    .log-entry .message {
      color: var(--text-primary);
    }

    .log-entry.error .message {
      color: var(--error);
    }

    .log-entry.detail {
      padding-left: 1rem;
      opacity: 0.8;
    }
```

**Add activity log HTML after progress section (after line 290):**
```html
    <!-- Activity Log Section -->
    <div class="activity-section" id="activity-section">
      <div class="activity-header">
        <span class="activity-title">Real-time Activity</span>
        <button class="activity-toggle" id="activity-toggle" onclick="toggleActivityLog()">
          Hide activity log
        </button>
      </div>
      <div class="activity-log" id="activity-log"></div>
    </div>
```

---

### Task 10: UPDATE public/index.html - Replace fetch with EventSource

- **IMPLEMENT**: Replace fake progress + fetch with real EventSource SSE consumption
- **PATTERN**: Use native EventSource API with event listeners
- **GOTCHA**: Handle reconnection, errors, and cleanup properly
- **VALIDATE**: Manual browser test with `bun run dev`

**Replace the entire script section (lines 302-396) with:**
```html
  <script>
    const stages = ['prep', 'synthesis', 'clustering', 'tournament', 'synthesizer'];
    let eventSource = null;
    let activityLogVisible = true;

    function setStageStatus(stageId, status) {
      const el = document.getElementById(`stage-${stageId}`);
      if (!el) return;

      el.classList.remove('pending', 'active', 'completed', 'error');
      el.classList.add(status);

      const icon = el.querySelector('.stage-icon');
      switch (status) {
        case 'active':
          icon.textContent = '●';
          break;
        case 'completed':
          icon.textContent = '✓';
          break;
        case 'error':
          icon.textContent = '✗';
          break;
        default:
          icon.textContent = '○';
      }
    }

    function updateStageMessage(stageId, message) {
      const el = document.getElementById(`stage-${stageId}`);
      if (!el) return;
      const span = el.querySelector('span:last-child');
      if (span) span.textContent = message;
    }

    function addLogEntry(stage, message, isDetail = false, isError = false) {
      const log = document.getElementById('activity-log');
      if (!log) return;

      const entry = document.createElement('div');
      entry.className = 'log-entry' + (isDetail ? ' detail' : '') + (isError ? ' error' : '');

      const time = new Date().toLocaleTimeString('en-US', { hour12: false });
      entry.innerHTML = `<span class="timestamp">[${time}]</span><span class="stage">${stage}</span><span class="message">${message}</span>`;

      log.appendChild(entry);

      // Auto-scroll if user is near bottom
      const threshold = 50;
      const isNearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < threshold;
      if (isNearBottom) {
        log.scrollTop = log.scrollHeight;
      }
    }

    function toggleActivityLog() {
      const log = document.getElementById('activity-log');
      const toggle = document.getElementById('activity-toggle');
      activityLogVisible = !activityLogVisible;

      if (activityLogVisible) {
        log.classList.remove('hidden');
        toggle.textContent = 'Hide activity log';
      } else {
        log.classList.add('hidden');
        toggle.textContent = 'View real-time activity';
      }
    }

    function clearActivityLog() {
      const log = document.getElementById('activity-log');
      if (log) log.innerHTML = '';
    }

    async function analyze() {
      const query = document.getElementById('query').value.trim();
      if (!query) {
        alert('Please enter a research question');
        return;
      }

      // Reset UI
      const btn = document.getElementById('analyze-btn');
      const progressSection = document.getElementById('progress-section');
      const activitySection = document.getElementById('activity-section');
      const outputSection = document.getElementById('output-section');

      btn.disabled = true;
      btn.textContent = 'Analyzing...';
      progressSection.classList.add('active');
      activitySection.classList.add('active');
      outputSection.classList.remove('active');

      // Reset all stages and activity log
      stages.forEach(s => setStageStatus(s, 'pending'));
      clearActivityLog();

      // Close any existing connection
      if (eventSource) {
        eventSource.close();
      }

      // Connect to SSE endpoint
      const encodedQuery = encodeURIComponent(query);
      eventSource = new EventSource(`/api/analyze/stream?query=${encodedQuery}`);

      let currentStage = null;

      eventSource.addEventListener('progress', (e) => {
        try {
          const data = JSON.parse(e.data);

          // Update stage indicator
          if (data.stage !== currentStage) {
            if (currentStage) {
              setStageStatus(currentStage, 'completed');
            }
            currentStage = data.stage;
            setStageStatus(currentStage, 'active');
          }

          // Update stage message if there's progress
          if (data.progress) {
            const pct = Math.round((data.progress.current / data.progress.total) * 100);
            updateStageMessage(data.stage, `${data.message} (${pct}%)`);
          }

          // Add to activity log
          addLogEntry(data.stage, data.message);

          // Add detail entries
          if (data.detail) {
            switch (data.detail.type) {
              case 'domains':
                data.detail.domains.forEach(d => {
                  addLogEntry(data.stage, `→ ${d.name}: ${d.focus}`, true);
                });
                break;
              case 'response':
                if (data.detail.success) {
                  addLogEntry(data.stage, `→ ${data.detail.modelId} × ${data.detail.frameworkId} (${data.detail.responseTimeMs}ms)`, true);
                } else {
                  addLogEntry(data.stage, `→ FAILED: ${data.detail.modelId} × ${data.detail.frameworkId}: ${data.detail.error}`, true, true);
                }
                break;
              case 'clusters':
                data.detail.clusters.forEach(c => {
                  addLogEntry(data.stage, `→ Cluster ${c.id}: "${c.name}" (${c.memberCount} responses)`, true);
                });
                break;
              case 'advocate':
              case 'rebuttal':
                const status = data.detail.success ? '✓' : '✗';
                addLogEntry(data.stage, `→ ${status} ${data.detail.clusterName}`, true, !data.detail.success);
                break;
              case 'ideas':
                data.detail.ideas.forEach(idea => {
                  addLogEntry(data.stage, `→ ${idea.criterion}: "${idea.title}"`, true);
                });
                break;
            }
          }
        } catch (err) {
          console.error('Error parsing progress event:', err);
        }
      });

      eventSource.addEventListener('complete', (e) => {
        try {
          const data = JSON.parse(e.data);

          // Mark all stages complete
          stages.forEach(s => setStageStatus(s, 'completed'));
          addLogEntry('complete', 'Analysis complete!');

          // Render the briefing
          const briefingContent = document.getElementById('briefing-content');
          briefingContent.innerHTML = marked.parse(data.markdown);
          outputSection.classList.add('active');

        } catch (err) {
          console.error('Error parsing complete event:', err);
        } finally {
          cleanup();
        }
      });

      eventSource.addEventListener('error', (e) => {
        try {
          // Try to parse error data if available
          if (e.data) {
            const data = JSON.parse(e.data);
            addLogEntry('error', data.message || 'An error occurred', false, true);
          }
        } catch {
          // Connection error
          addLogEntry('error', 'Connection lost', false, true);
        }

        if (currentStage) {
          setStageStatus(currentStage, 'error');
        }

        const briefingContent = document.getElementById('briefing-content');
        briefingContent.innerHTML = `<div class="error-message">Error: Analysis failed. Check console for details.</div>`;
        outputSection.classList.add('active');

        cleanup();
      });

      eventSource.onerror = (e) => {
        // Handle connection errors (not custom error events)
        if (eventSource.readyState === EventSource.CLOSED) {
          console.log('SSE connection closed');
        }
      };

      function cleanup() {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        btn.disabled = false;
        btn.textContent = 'Analyze with ISEE';
      }
    }
  </script>
```

---

## TESTING STRATEGY

### Unit Tests

- Type checking passes for all new interfaces
- No regressions in existing pipeline functionality

### Integration Tests

**SSE Endpoint Test (curl):**
```bash
curl -N "http://localhost:3000/api/analyze/stream?query=test%20query"
```
Expected: Stream of `event: progress` followed by `event: complete`

**Full Pipeline Test:**
```bash
bun run dev
# Open http://localhost:3000 in browser
# Submit query, observe real-time updates
```

### Edge Cases

- Empty query → 400 error response (not SSE)
- Pipeline failure mid-run → `event: error` sent, stream closes
- Client disconnects → No crash, stream cleanup
- Very fast stages → Events still delivered (flush working)
- Long synthesis stage → Continuous events, no timeout

---

## VALIDATION COMMANDS

Execute every command to ensure zero regressions and 100% feature correctness.

### Level 1: Type Checking

```bash
bun run typecheck
```

### Level 2: Server Startup

```bash
bun run dev &
sleep 2
curl -s http://localhost:3000/health | jq
```

### Level 3: SSE Endpoint Test

```bash
# Test SSE endpoint (should see events streaming)
timeout 10 curl -N "http://localhost:3000/api/analyze/stream?query=How%20can%20we%20improve%20testing" || true
```

### Level 4: Full UI Test

```bash
# Start server and open browser
bun run dev
# Manual: Open http://localhost:3000
# Manual: Submit query "How might we improve decision-making?"
# Manual: Verify:
#   - Stage indicators update in real-time
#   - Activity log shows timestamped entries
#   - Domain names, model names, cluster names appear
#   - Tournament shows advocate/skeptic/rebuttal progress
#   - Final briefing renders correctly
#   - Activity log toggle works
```

### Level 5: Backward Compatibility

```bash
# Verify original POST endpoint still works
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"query": "Test query"}' | jq '.success'
```

---

## ACCEPTANCE CRITERIA

- [ ] `bun run typecheck` passes with zero errors
- [ ] SSE endpoint streams events in real-time (no batching)
- [ ] Stage indicators update as pipeline progresses
- [ ] Activity log shows timestamped entries for each event
- [ ] Activity log is visible by default with working toggle
- [ ] Domain names appear during Prep stage
- [ ] Model/framework names + count appear during Synthesis
- [ ] Cluster names appear during Clustering
- [ ] Tournament shows advocate/skeptic/rebuttal sub-stages
- [ ] Idea titles appear during final Synthesis
- [ ] Final briefing renders correctly after completion
- [ ] Errors are handled gracefully with error events
- [ ] Original POST `/api/analyze` endpoint still works
- [ ] Auto-scroll works but respects user scroll position

---

## COMPLETION CHECKLIST

- [ ] All 10 tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully
- [ ] `bun run typecheck` passes
- [ ] SSE endpoint tested with curl
- [ ] Full UI tested in browser
- [ ] Activity log toggle verified
- [ ] Backward compatibility with POST endpoint verified
- [ ] No regressions in existing functionality

---

## NOTES

### Design Decisions

1. **GET endpoint with query param**: Simpler for EventSource (no preflight CORS issues). Query is URL-encoded.

2. **Direct ReadableStream**: Using Bun's `type: 'direct'` with explicit flush ensures events are sent immediately, not batched.

3. **Activity log visible by default**: Per user requirement - users who want detail can see it; others can toggle off.

4. **Auto-scroll with threshold**: Only auto-scroll if user is within 50px of bottom, preserving manual scroll position.

5. **Backward compatibility**: Original POST `/api/analyze` remains functional for CLI and non-browser clients.

### Trade-offs

- **Event frequency**: Synthesis emits ~66 events (one per call). This provides rich detail but creates UI activity. Could throttle if needed.

- **No heartbeat implemented**: For pipeline runs under 3 minutes, heartbeat may not be needed. Could add if proxy timeouts become an issue.

### Potential Improvements

- Add elapsed time display per stage
- Add estimated time remaining based on synthesis progress
- Add ability to cancel running analysis
- Add sound/notification on completion
- Persist activity log across runs for comparison

### Sources Referenced

- [MDN: Using Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [Bun Streams Documentation](https://bun.com/docs/runtime/streams)
- [JavaScript.info: Server Sent Events](https://javascript.info/server-sent-events)
