/**
 * Test script for Phase 4 implementation.
 * Tests the Synthesis Agent with mock debate data.
 */

import { generateBriefing, renderBriefingMarkdown } from './pipeline/synthesizer';
import { createRunLogger } from './utils/logger';
import type { DebateEntry, Domain, TranslatedBriefing } from './types';

// Mock debate entries (simulating tournament output)
const mockDebateEntries: DebateEntry[] = [
  {
    clusterId: 1,
    clusterName: 'Automate the human decision layer out of existence',
    advocateArgument:
      'This angle argues that rather than improving human decision-making processes, we should encode decisions directly into protocol rules that execute automatically. The value lies not in making humans better at deciding, but in removing the human bottleneck entirely. This is surprising because it inverts the typical "improve the human" framing. The combinatorial synthesis surfaced this by having contrarian and systems thinking frameworks converge independently on automation-first approaches. For someone asking about organizational decision-making, this offers a concrete reframe: instead of training people to decide better, identify which decisions can be eliminated entirely through protocol design.',
    skepticChallenge:
      'This argument conflates two different claims: that automation is valuable (uncontroversial) and that it should replace human judgment entirely (controversial). The advocate has not demonstrated that the "bottleneck" is humans per se, rather than poor system design that could be improved while retaining human judgment. A single well-crafted prompt about automation could surface this angle.',
    rebuttal:
      'The skeptic correctly identifies that I conflated automation value with total human replacement. Let me sharpen: the distinctive claim is not "automate everything" but rather "the framing of improvement is wrong." Most approaches ask "how do we help humans decide better?" This angle asks "which decisions should humans not be making at all?" The value is in the question itself, not a blanket automation prescription. This reframe would not naturally emerge from a direct query about organizational improvement.',
  },
  {
    clusterId: 2,
    clusterName: 'The problem is in the incentive structure, not the process',
    advocateArgument:
      'This angle claims that process improvements fail because they do not address underlying incentive misalignments. The insight is that organizational dysfunction is a symptom of rational actors responding to poorly designed incentives, not a cause to be fixed through training or procedures. This emerged from behavioral economics and game theory domains converging on incentive analysis. The actionable value: before redesigning any process, first map what people are actually incentivized to do versus what the process assumes they want to do.',
    skepticChallenge:
      'The claim that "incentives matter more than process" is well-established in organizational theory. This is not a novel insight from combinatorial synthesis—it is conventional wisdom. The advocate has not shown what ISEE adds beyond what any MBA textbook contains.',
    rebuttal:
      'I concede that incentive analysis is not novel in isolation. However, the value is not the concept but the specific diagnostic application: the angle suggests a concrete first step (map actual vs assumed incentives) before any process change. This operational specificity—treat incentive mapping as a prerequisite, not an afterthought—is what distinguishes it from generic "incentives matter" advice. The synthesis surfaced this as a blocking dependency, not just a consideration.',
  },
  {
    clusterId: 3,
    clusterName: 'Embrace inherent complexity rather than seeking simplistic solutions',
    advocateArgument:
      'Historical analysis shows that complex organizational challenges are rarely "solved" in the traditional sense. The most successful organizations accept inherent complexity and develop adaptive management approaches rather than seeking silver-bullet solutions. This challenges the assumption embedded in the original query that decision-making can be "improved" in some definitive way. The real improvement may be accepting that improvement is continuous adaptation, not a destination.',
    skepticChallenge:
      'This argument risks being a sophisticated way of saying "do nothing differently." If the advice is "accept complexity," what concrete action follows? The angle may challenge an assumption, but it does not offer actionable value to someone trying to actually improve their organization.',
    rebuttal:
      'The skeptic identifies a real weakness: acceptance without action is not valuable. Let me refine the actionable core: the insight is that framing organizational challenges as problems to solve sets up for failure, while framing them as conditions to manage enables sustained progress. The action is to shift success metrics from "problem solved" to "adaptive capacity improved." This changes how you measure, fund, and sustain improvement efforts.',
  },
  {
    clusterId: 4,
    clusterName: 'Small-scale experimentation consistently outperforms top-down design',
    advocateArgument:
      'Rather than designing comprehensive solutions, run many small experiments in parallel. The failures reveal constraints that planning cannot anticipate, and successes can be scaled. This emerged from multiple frameworks independently recommending experimental approaches over planning. The value is methodological: it de-risks improvement efforts and generates learning that planning-based approaches miss.',
    skepticChallenge:
      'Experimentation as a methodology is well-known (lean startup, agile, etc.). What is the specific insight beyond "try small things first"? The advocate needs to show what ISEE adds to standard experimental methodology advice.',
    rebuttal:
      'Fair challenge. The specific insight is the framing of failures as primary value, not unfortunate outcomes. Most experimental approaches still optimize for success. This angle suggests deliberately designing experiments expected to fail in order to map constraint boundaries. The methodological shift is from "test to validate" to "test to discover constraints." This is subtle but meaningfully different from standard lean methodology.',
  },
  {
    clusterId: 5,
    clusterName: 'Question whether the organizational structure itself is necessary',
    advocateArgument:
      'Instead of asking how to improve decision-making within existing structures, ask whether those structures need to exist at all. Many organizational layers exist due to historical accident rather than necessity. The most challenging assumption is that current organizational forms are given rather than contingent. This emerged from first-principles and contrarian frameworks converging on structural questioning.',
    skepticChallenge:
      'This is abstractly provocative but practically unhelpful. Few people asking about organizational improvement have the authority or appetite to eliminate organizational structures entirely. The angle challenges assumptions the user cannot act on.',
    rebuttal:
      'I partially concede: wholesale structural elimination is unrealistic for most users. However, the actionable kernel is smaller-scale: for any given decision process being improved, ask whether the decision itself is necessary or whether it exists because of a structure that no longer serves its original purpose. This is not about eliminating the org chart but about questioning individual decision points.',
  },
];

const mockDomains: Domain[] = [
  { name: 'Behavioral Economics', description: 'Study of psychological factors in decision-making', focus: 'Incentive structures and cognitive biases' },
  { name: 'Systems Theory', description: 'Analysis of complex interconnected systems', focus: 'Feedback loops and emergent behavior' },
  { name: 'Organizational Psychology', description: 'Human behavior in organizational contexts', focus: 'Group dynamics and culture' },
];

async function testPhase4() {
  const query = 'How might we improve decision-making in complex organizations?';
  const runLogger = createRunLogger('test-phase4');

  console.log('='.repeat(60));
  console.log('ISEE v2 - Phase 4 Test (Synthesis Agent)');
  console.log('='.repeat(60));
  console.log(`Query: ${query}`);
  console.log(`Debate entries: ${mockDebateEntries.length}`);
  console.log('');

  // Test Synthesis Agent
  console.log('Testing Synthesis Agent...');
  const briefing = await generateBriefing({
    query,
    domains: mockDomains,
    debateEntries: mockDebateEntries,
    stats: {
      synthesisCallCount: 66,
      successfulCalls: 64,
      stageDurations: {
        prep: 2000,
        synthesis: 45000,
        clustering: 5000,
        tournament: 15000,
        synthesizer: 0,
        translation: 0,
      },
    },
    runLogger,
  });

  console.log(`Generated ${briefing.ideas.length} ideas:`);
  briefing.ideas.forEach((idea, i) => {
    console.log('');
    console.log(`--- Idea ${i + 1}: ${idea.title} ---`);
    console.log(`Description: ${idea.description}`);
    console.log(`Why Emerged: ${idea.whyEmerged.substring(0, 150)}...`);
    console.log(`Why It Matters: ${idea.whyItMatters.substring(0, 150)}...`);
  });

  // Render markdown
  console.log('');
  console.log('='.repeat(60));
  console.log('RENDERED MARKDOWN OUTPUT:');
  console.log('='.repeat(60));
  console.log('');
  // Create a mock translated briefing for rendering
  const translatedBriefing: TranslatedBriefing = {
    queryPlainLanguage: query,
    ideas: briefing.ideas.map((idea) => ({
      title: idea.title,
      explanation: idea.description,
      whyForYou: idea.whyItMatters,
      actionItems: ['Action item 1', 'Action item 2'],
    })),
    originalBriefing: briefing,
  };
  const markdown = renderBriefingMarkdown(translatedBriefing);
  console.log(markdown);

  console.log('');
  console.log('='.repeat(60));
  console.log('Phase 4 test complete!');
}

testPhase4().catch(console.error);
