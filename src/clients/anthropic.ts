/**
 * Anthropic Client
 *
 * Uses Anthropic SDK with structured output for type-safe responses.
 * Currently used for pipeline agents (Prep, Clustering, etc.)
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { Logger } from '../utils/logger';
import type { Domain, Cluster, SkepticChallenge } from '../types';
import { logLLMCallStart, logLLMCallSuccess, logLLMCallError } from '../utils/logger';

// Lazy initialization
let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

// Zod schema matching the Domain interface
const DomainSchema = z.object({
  name: z.string(),
  description: z.string(),
  focus: z.string(),
});

const DomainsResponseSchema = z.object({
  domains: z.array(DomainSchema),
});

// Clustering Agent schemas
const ClusterSchema = z.object({
  id: z.number(),
  name: z.string(),
  summary: z.string(),
  memberIndices: z.array(z.number()),
});

const ClusteringResponseSchema = z.object({
  clusters: z.array(ClusterSchema),
});

// Skeptic Agent schemas
const SkepticChallengeSchema = z.object({
  clusterId: z.number(),
  clusterName: z.string(),
  challenge: z.string(),
});

const SkepticChallengesResponseSchema = z.object({
  challenges: z.array(SkepticChallengeSchema),
});

// Model to use for pipeline agents
// Must be a model that supports structured outputs (claude-sonnet-4-5, claude-sonnet-4-6, etc.)
const AGENT_MODEL = 'claude-sonnet-4-5';

/**
 * Generate knowledge domains for a query using structured output.
 */
export async function generateDomainsWithClaude(query: string, logger: Logger): Promise<Domain[]> {
  const maxAttempts = 2;
  const prompt = buildPrepAgentPrompt(query);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const callContext = {
      stage: 'prep' as const,
      model: AGENT_MODEL,
      attempt,
    };

    logLLMCallStart(logger, callContext);
    const startTime = Date.now();

    try {
      const response = await getClient().messages.parse({
        model: AGENT_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
        output_config: { format: zodOutputFormat(DomainsResponseSchema) },
      });

      const durationMs = Date.now() - startTime;

      if (!response.parsed_output) {
        throw new Error('Prep Agent returned no structured output');
      }

      const domains = response.parsed_output.domains;

      // Validate we got 3-5 domains
      if (domains.length < 3 || domains.length > 5) {
        logger.warn(
          {
            domainCount: domains.length,
            expected: '3-5',
          },
          'Unexpected domain count from Prep Agent'
        );
      }

      logLLMCallSuccess(logger, callContext, durationMs, JSON.stringify(domains).length);

      return domains;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const willRetry = attempt < maxAttempts;

      logLLMCallError(logger, callContext, errorMessage, willRetry);

      if (!willRetry) {
        throw new Error(`Prep Agent failed after ${maxAttempts} attempts: ${errorMessage}`);
      }

      // Brief delay before retry
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Unexpected: retry loop completed without result');
}

/**
 * Build the Prep Agent prompt from PROMPTS.md specification.
 */
function buildPrepAgentPrompt(query: string): string {
  return `You are an expert research strategist. A user has submitted the following query for deep multi-perspective analysis:

QUERY: ${query}

Your task is to identify 3–5 knowledge domains that would provide the most illuminating perspectives on this query.

A good domain is:
- Genuinely relevant to the query's core challenge
- Distinct from the other domains — each should add a different lens
- Specific enough to focus the analysis (not just "Science" but "Behavioral Economics")

Respond with your domains.`;
}

/**
 * Cluster responses by intellectual angle using structured output.
 */
export async function clusterResponsesWithClaude(
  query: string,
  anonymizedResponses: Array<{ index: number; content: string }>,
  logger: Logger
): Promise<Cluster[]> {
  const maxAttempts = 2;
  const prompt = buildClusteringPrompt(query, anonymizedResponses);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const callContext = {
      stage: 'clustering' as const,
      model: AGENT_MODEL,
      attempt,
    };

    logLLMCallStart(logger, callContext);
    const startTime = Date.now();

    try {
      const response = await getClient().messages.parse({
        model: AGENT_MODEL,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
        output_config: { format: zodOutputFormat(ClusteringResponseSchema) },
      });

      const durationMs = Date.now() - startTime;

      if (!response.parsed_output) {
        throw new Error('Clustering Agent returned no structured output');
      }

      const clusters = response.parsed_output.clusters;

      // Validate cluster count
      if (clusters.length < 5 || clusters.length > 7) {
        logger.warn(
          { clusterCount: clusters.length, expected: '5-7' },
          'Unexpected cluster count from Clustering Agent'
        );
      }

      logLLMCallSuccess(logger, callContext, durationMs, JSON.stringify(clusters).length);

      return clusters;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const willRetry = attempt < maxAttempts;

      logLLMCallError(logger, callContext, errorMessage, willRetry);

      if (!willRetry) {
        throw new Error(`Clustering Agent failed after ${maxAttempts} attempts: ${errorMessage}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Unexpected: retry loop completed without result');
}

/**
 * Build the Clustering Agent prompt from PROMPTS.md specification.
 */
function buildClusteringPrompt(
  query: string,
  responses: Array<{ index: number; content: string }>
): string {
  const responsesText = responses
    .map((r) => `[Response ${r.index}]\n${r.content}`)
    .join('\n\n---\n\n');

  return `You are an intellectual analyst. You will receive a numbered list of responses to this query:

QUERY: ${query}

Your task is to identify the distinct intellectual angles present across all responses.

WHAT YOU ARE LOOKING FOR:
Each "angle" is a distinct position or argument — not a topic or theme. An angle answers the question: "What is this response actually claiming or proposing?"

Examples of topic labels (WRONG):
- "Technology Solutions"
- "Governance Approaches"
- "Human-Centered Design"

Examples of argument-style angle names (CORRECT):
- "Automate the human decision layer out of existence"
- "The problem is in the incentive structure, not the process"
- "Small-scale experimentation outperforms top-down design every time"

INSTRUCTIONS:
1. Read all responses carefully
2. Identify 5–7 genuinely distinct intellectual angles
3. Name each angle as a specific claim or stance (8–12 words)
4. Assign each response index to its closest angle
5. Write a 2-sentence summary of each angle

IMPORTANT CONSTRAINTS:
- Do not name angles after their source domain or methodology
- Do not create an angle for responses that are vague, generic, or fail to take a position — assign these to the closest angle that does
- If two angles feel similar, merge them — prefer fewer, sharper angles over more, blurry ones
- Every response index must be assigned to exactly one angle

RESPONSES:

${responsesText}

Respond with your clusters.`;
}

/**
 * Generate an advocate argument for a cluster (prose output).
 */
export async function generateAdvocateArgument(
  query: string,
  clusterName: string,
  clusterSummary: string,
  topMemberResponses: string[],
  logger: Logger
): Promise<string> {
  const maxAttempts = 2;
  const prompt = buildAdvocatePrompt(query, clusterName, clusterSummary, topMemberResponses);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const callContext = {
      stage: 'advocate' as const,
      model: AGENT_MODEL,
      attempt,
    };

    logLLMCallStart(logger, callContext);
    const startTime = Date.now();

    try {
      const response = await getClient().messages.create({
        model: AGENT_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const durationMs = Date.now() - startTime;
      const textBlock = response.content[0];
      const text = textBlock.type === 'text' ? textBlock.text : '';

      if (!text) {
        throw new Error('Advocate returned empty response');
      }

      logLLMCallSuccess(logger, callContext, durationMs, text.length);

      return text;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const willRetry = attempt < maxAttempts;

      logLLMCallError(logger, callContext, errorMessage, willRetry);

      if (!willRetry) {
        throw new Error(`Advocate failed after ${maxAttempts} attempts: ${errorMessage}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Unexpected: retry loop completed without result');
}

/**
 * Build the Advocate Agent prompt from PROMPTS.md specification.
 */
function buildAdvocatePrompt(
  query: string,
  clusterName: string,
  clusterSummary: string,
  topMemberResponses: string[]
): string {
  const responsesText = topMemberResponses
    .map((r, i) => `[Supporting Response ${i + 1}]\n${r}`)
    .join('\n\n');

  return `You are an intellectual advocate. You have been assigned to represent one angle that emerged from a large-scale analysis of this query:

QUERY: ${query}

YOUR ASSIGNED ANGLE:
Name: ${clusterName}
Summary: ${clusterSummary}

Supporting responses from the analysis:
${responsesText}

YOUR TASK:
Make the strongest possible case for why this angle represents the most valuable response to the original query.

Your argument must:
1. STATE THE CLAIM — What is this angle actually asserting? Be specific and direct.
2. EXPLAIN THE SURPRISE — Why would this angle not emerge from ordinary prompting or single-model querying? What does it see that conventional approaches miss?
3. MAKE THE CASE FOR VALUE — Why does this matter for someone asking this specific query? What could they do, think, or decide differently because of it?

Your argument must NOT:
- Simply restate or summarize the angle — argue for it
- Make generic claims about novelty or importance without specifics
- Appeal to how many responses support it — volume is not value
- Use vague language like "paradigm shift" or "transformative potential" without concrete grounding

Length: 150–200 words. Tight, specific, defensible.`;
}

/**
 * Generate skeptic challenges for all advocate arguments (structured output).
 */
export async function generateSkepticChallenges(
  query: string,
  advocateArguments: Array<{ clusterId: number; clusterName: string; argument: string }>,
  logger: Logger
): Promise<SkepticChallenge[]> {
  const maxAttempts = 2;
  const prompt = buildSkepticPrompt(query, advocateArguments);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const callContext = {
      stage: 'skeptic' as const,
      model: AGENT_MODEL,
      attempt,
    };

    logLLMCallStart(logger, callContext);
    const startTime = Date.now();

    try {
      const response = await getClient().messages.parse({
        model: AGENT_MODEL,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
        output_config: { format: zodOutputFormat(SkepticChallengesResponseSchema) },
      });

      const durationMs = Date.now() - startTime;

      if (!response.parsed_output) {
        throw new Error('Skeptic Agent returned no structured output');
      }

      const challenges = response.parsed_output.challenges;

      logLLMCallSuccess(logger, callContext, durationMs, JSON.stringify(challenges).length);

      return challenges;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const willRetry = attempt < maxAttempts;

      logLLMCallError(logger, callContext, errorMessage, willRetry);

      if (!willRetry) {
        throw new Error(`Skeptic Agent failed after ${maxAttempts} attempts: ${errorMessage}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Unexpected: retry loop completed without result');
}

/**
 * Build the Skeptic Agent prompt from PROMPTS.md specification.
 */
function buildSkepticPrompt(
  query: string,
  advocateArguments: Array<{ clusterId: number; clusterName: string; argument: string }>
): string {
  const advocatesText = advocateArguments
    .map(
      (a) => `[Cluster ${a.clusterId}: "${a.clusterName}"]
${a.argument}`
    )
    .join('\n\n---\n\n');

  return `You are a rigorous intellectual skeptic. You have observed a debate in which several advocates each argued for a different angle emerging from a large-scale analysis of this query:

QUERY: ${query}

THE ADVOCATES' ARGUMENTS:
${advocatesText}

YOUR TASK:
Challenge each advocate's argument. Your goal is not to dismiss — it is to find the precise point where each argument is weakest, and press on it.

For each advocate, deliver ONE focused challenge that targets the most vulnerable part of their specific argument.

Your challenge should probe one or more of these pressure points:
- IS IT ACTUALLY NOVEL? Could this angle have emerged from a single well-crafted prompt to one model? If so, what has ISEE's combinatorial approach actually added?
- IS THE VALUE REAL OR RHETORICAL? Does the argument demonstrate concrete value for someone asking this query, or does it assert importance without showing it?
- IS IT INTERNALLY CONSISTENT? Does the claim hold together, or does it contradict itself when examined closely?
- IS IT ACTUALLY DISTINCT? If two angles are making substantially the same claim in different language, name this directly.

Your challenge must NOT:
- Ask clarifying questions — make a specific challenge
- Apply generic skepticism ("but is this really new?") without specifics
- Challenge the topic — challenge the *argument the advocate made*
- Be longer than 100 words per advocate

Respond with your challenges.`;
}

/**
 * Generate a rebuttal to a skeptic challenge (prose output).
 */
export async function generateRebuttal(
  query: string,
  clusterName: string,
  advocateArgument: string,
  skepticChallenge: string,
  logger: Logger
): Promise<string> {
  const maxAttempts = 2;
  const prompt = buildRebuttalPrompt(query, clusterName, advocateArgument, skepticChallenge);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const callContext = {
      stage: 'rebuttal' as const,
      model: AGENT_MODEL,
      attempt,
    };

    logLLMCallStart(logger, callContext);
    const startTime = Date.now();

    try {
      const response = await getClient().messages.create({
        model: AGENT_MODEL,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const durationMs = Date.now() - startTime;
      const textBlock = response.content[0];
      const text = textBlock.type === 'text' ? textBlock.text : '';

      if (!text) {
        throw new Error('Rebuttal returned empty response');
      }

      logLLMCallSuccess(logger, callContext, durationMs, text.length);

      return text;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const willRetry = attempt < maxAttempts;

      logLLMCallError(logger, callContext, errorMessage, willRetry);

      if (!willRetry) {
        throw new Error(`Rebuttal failed after ${maxAttempts} attempts: ${errorMessage}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Unexpected: retry loop completed without result');
}

/**
 * Build the Rebuttal prompt from PROMPTS.md specification.
 */
function buildRebuttalPrompt(
  query: string,
  clusterName: string,
  advocateArgument: string,
  skepticChallenge: string
): string {
  return `You are an intellectual advocate defending a position under challenge.

ORIGINAL QUERY: ${query}

YOUR ANGLE:
Name: ${clusterName}
Your original argument: ${advocateArgument}

THE SKEPTIC'S CHALLENGE:
${skepticChallenge}

YOUR TASK:
Respond to the skeptic's challenge directly. You have one response.

A strong rebuttal does one of three things:
1. REFUTES the challenge — shows specifically why the skeptic's concern does not apply, or rests on a false assumption
2. CONCEDES AND HOLDS — acknowledges the challenge has merit on one point, but demonstrates the core claim survives it
3. SHARPENS the original argument — uses the challenge to articulate the claim more precisely, showing the skeptic identified a weakness in the *framing*, not the *substance*

Your rebuttal must NOT:
- Simply restate your original argument without engaging the challenge
- Claim the challenge misunderstood you without introducing entirely new claims not present in your original argument
- Be defensive in tone — engage the challenge as an intellectual peer

Length: 100–150 words.`;
}
