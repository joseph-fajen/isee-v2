/**
 * Stage 4: Synthesis Agent - Briefing Generation
 *
 * Reads the full debate transcript and selects 3 ideas.
 * Produces the final briefing document with confidence narratives.
 *
 * Selection criteria:
 * 1. Most surprising - least likely to emerge from single direct query
 * 2. Most actionable - points toward something the user can actually do
 * 3. Most assumption-challenging - challenges beliefs the user probably holds
 *
 * NOTE: The prompt for this stage is deferred to implementation phase
 * where real debate transcripts can be used for testing and tuning.
 */

import type { Domain, DebateEntry, ExtractedIdea, Briefing, RunStats } from '../types';

interface SynthesizerConfig {
  query: string;
  domains: Domain[];
  debateEntries: DebateEntry[];
  stats: Partial<RunStats>;
}

/**
 * Generate the final briefing from the debate transcript.
 *
 * @param config - Query, debate entries, and run statistics
 * @returns Complete briefing document
 */
export async function generateBriefing(config: SynthesizerConfig): Promise<Briefing> {
  const { query, domains, debateEntries, stats } = config;

  console.log(`[synthesizer] Generating briefing from ${debateEntries.length} debate entries`);

  // TODO: Phase 4 implementation
  // - Use Anthropic Claude SDK
  // - Design and apply Synthesis Agent prompt
  // - Select 3 ideas with visible reasoning
  // - Generate confidence narratives

  // Stub: Return mock briefing for pipeline testing
  const mockIdeas: ExtractedIdea[] = [
    {
      title: 'Protocol-Level Automation as Governance Bypass',
      description:
        'Rather than improving human decision processes, encode decisions directly into protocol rules that execute automatically. This shifts governance from deliberation to design.',
      whyEmerged:
        'This angle emerged from the convergence of systems thinking and contrarian frameworks across multiple models. The debate revealed that while skeptical challenges about feasibility were valid, the core insight about removing human bottlenecks survived scrutiny.',
      whyItMatters:
        'This matters because it reframes the problem entirely. Instead of asking "how do we make better decisions?" it asks "which decisions can we eliminate?" This is actionable: identify decision points that could be automated away.',
    },
    {
      title: 'Incentive Architecture Over Process Design',
      description:
        'Process improvements fail when incentive structures remain misaligned. Rather than redesigning workflows, map the incentive landscape and realign it so desired behaviors become the path of least resistance.',
      whyEmerged:
        'Multiple frameworks independently identified incentive misalignment as the root cause. The behavioral economics and historical precedent domains both surfaced examples where process changes failed until incentives were addressed.',
      whyItMatters:
        'This challenges the common assumption that better processes lead to better outcomes. The actionable insight: before any process change, ask "what are people actually incentivized to do?"',
    },
    {
      title: 'Deliberate Small-Scale Failure as Discovery Method',
      description:
        'Instead of designing for success, design many small experiments expected to fail. The failures reveal constraints and possibilities that successful implementations hide.',
      whyEmerged:
        'This contrarian angle survived the skeptic\'s challenge about practicality by pointing to historical examples where deliberate failure-seeking outperformed careful planning.',
      whyItMatters:
        'This inverts the typical approach. Instead of avoiding failure, instrumentalize it. The user can apply this immediately: what small experiment would be valuable even if it fails?',
    },
  ];

  const briefing: Briefing = {
    query,
    timestamp: new Date().toISOString(),
    ideas: mockIdeas,
    debateTranscript: debateEntries,
    domains,
    stats: {
      synthesisCallCount: stats.synthesisCallCount || 0,
      successfulCalls: stats.successfulCalls || 0,
      clusterCount: debateEntries.length,
      totalDurationMs: stats.totalDurationMs || 0,
      stageDurations: stats.stageDurations || {
        prep: 0,
        synthesis: 0,
        clustering: 0,
        tournament: 0,
        synthesizer: 0,
      },
    },
  };

  console.log(`[synthesizer] Briefing complete with ${briefing.ideas.length} extracted ideas`);
  return briefing;
}

/**
 * Render the briefing as Markdown.
 */
export function renderBriefingMarkdown(briefing: Briefing): string {
  const lines: string[] = [];

  lines.push(`# ISEE Briefing`);
  lines.push('');
  lines.push(`**Query**: ${briefing.query}`);
  lines.push(`**Generated**: ${new Date(briefing.timestamp).toLocaleString()}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Render each idea
  briefing.ideas.forEach((idea, index) => {
    lines.push(`## Idea ${index + 1}: ${idea.title}`);
    lines.push('');
    lines.push(idea.description);
    lines.push('');
    lines.push(`**Why this emerged**: ${idea.whyEmerged}`);
    lines.push('');
    lines.push(`**Why it matters**: ${idea.whyItMatters}`);
    lines.push('');
    lines.push('---');
    lines.push('');
  });

  // Expandable debate transcript
  lines.push('<details>');
  lines.push('<summary>Show full debate transcript</summary>');
  lines.push('');

  briefing.debateTranscript.forEach((entry) => {
    lines.push(`### ${entry.clusterName}`);
    lines.push('');
    lines.push('**Advocate Argument:**');
    lines.push(entry.advocateArgument);
    lines.push('');
    lines.push('**Skeptic Challenge:**');
    lines.push(entry.skepticChallenge);
    lines.push('');
    lines.push('**Rebuttal:**');
    lines.push(entry.rebuttal);
    lines.push('');
    lines.push('---');
    lines.push('');
  });

  lines.push('</details>');
  lines.push('');

  // Stats footer
  lines.push('---');
  lines.push('');
  lines.push('*Analysis Statistics:*');
  lines.push(`- Synthesis calls: ${briefing.stats.synthesisCallCount}`);
  lines.push(`- Clusters analyzed: ${briefing.stats.clusterCount}`);
  lines.push(`- Total duration: ${(briefing.stats.totalDurationMs / 1000).toFixed(1)}s`);

  return lines.join('\n');
}
