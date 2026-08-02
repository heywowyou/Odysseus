import Anthropic from '@anthropic-ai/sdk';
import { llmOutputSchema, type LlmInput, type LlmOutput } from '@odysseus/core';
import { getAnthropicApiKey } from './config.js';
import { CLAUDE_EFFORT, CLAUDE_MODEL, MAX_OUTPUT_TOKENS } from './constants.js';
import { LLM_OUTPUT_JSON_SCHEMA } from './output-schema.js';
import { buildSystemPrompt, buildUserPrompt } from './prompt.js';

export interface RawCallResult {
  /** Present only when refused is false. */
  output: LlmOutput | undefined;
  refused: boolean;
}

/** Single call to Claude. Returns either a schema-validated LlmOutput or
 *  refused: true. Throws only on transport/API errors (network, auth,
 *  rate limit) - those propagate to analyze.ts's retry loop like any
 *  other failed attempt.
 *
 *  Uses output_config.format as a shape hint (see output-schema.ts for
 *  why it's a hand-built JSON Schema rather than the SDK's
 *  zodOutputFormat helper), then runs an explicit, visible
 *  llmOutputSchema.parse() on the response text - not implicit trust in
 *  the API's shape constraint - because CLAUDE.md's "all LLM output is
 *  validated with Zod" rule is a non-negotiable business rule and must
 *  be an obvious, auditable line in this code. */
export async function callClaude(input: LlmInput, usedFallbackContext: boolean): Promise<RawCallResult> {
  const client = new Anthropic({ apiKey: getAnthropicApiKey() });

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: buildSystemPrompt(input.language, usedFallbackContext),
    messages: [{ role: 'user', content: buildUserPrompt(input) }],
    output_config: {
      format: { type: 'json_schema', schema: LLM_OUTPUT_JSON_SCHEMA },
      effort: CLAUDE_EFFORT,
    },
  });

  if (response.stop_reason === 'refusal') {
    return { output: undefined, refused: true };
  }

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock) {
    throw new Error('odysseus analyze: Claude response contained no text content block');
  }

  const output = llmOutputSchema.parse(JSON.parse(textBlock.text));
  return { output, refused: false };
}
