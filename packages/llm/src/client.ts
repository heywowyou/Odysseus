import Anthropic from '@anthropic-ai/sdk';
import { getAnthropicApiKey } from './config.js';
import { CLAUDE_EFFORT, CLAUDE_MODEL, MAX_OUTPUT_TOKENS } from './constants.js';
import { structurePassOutputSchema, type StructureInput, type StructurePassOutput } from './structure-schema.js';
import { STRUCTURE_OUTPUT_JSON_SCHEMA } from './structure-output-schema.js';
import { buildStructureSystemPrompt, buildStructureUserPrompt } from './structure-prompt.js';
import { writingPassOutputSchema, type WritingInput, type WritingPassOutput } from './writing-schema.js';
import { WRITING_OUTPUT_JSON_SCHEMA } from './writing-output-schema.js';
import { buildWritingSystemPrompt, buildWritingUserPrompt } from './writing-prompt.js';

function createClient(): Anthropic {
  return new Anthropic({ apiKey: getAnthropicApiKey() });
}

export interface RawStructureCallResult {
  /** Present only when refused is false. */
  output: StructurePassOutput | undefined;
  refused: boolean;
}

export interface RawWritingCallResult {
  /** Present only when refused is false. */
  output: WritingPassOutput | undefined;
  refused: boolean;
}

/** Single call to Claude for the structure pass. Returns either a
 *  schema-validated StructurePassOutput or refused: true. Throws only
 *  on transport/API errors - those propagate to analyzeStructure's retry
 *  loop like any other failed attempt.
 *
 *  Uses output_config.format as a shape hint (see
 *  structure-output-schema.ts for why it's a hand-built JSON Schema
 *  rather than the SDK's zodOutputFormat helper), then runs an explicit,
 *  visible structurePassOutputSchema.parse() on the response text - not
 *  implicit trust in the API's shape constraint - because CLAUDE.md's
 *  "all LLM output is validated with Zod" rule is a non-negotiable
 *  business rule and must be an obvious, auditable line in this code. */
export async function callClaudeForStructure(
  input: StructureInput,
  usedFallbackContext: boolean,
): Promise<RawStructureCallResult> {
  const client = createClient();

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    // Claude Opus 5 runs adaptive thinking by default when `thinking` is
    // omitted, and thinking output shares max_tokens with the response.
    // This is a bounded, non-agentic structured-output call (no tools, no
    // exploration needed) - disabling thinking keeps the whole budget
    // available for the JSON response and avoids the truncation this
    // caused on a real 124-finding site. Accepted at effort 'medium'
    // (disabling thinking 400s only above 'high').
    thinking: { type: 'disabled' },
    system: buildStructureSystemPrompt(usedFallbackContext),
    messages: [{ role: 'user', content: buildStructureUserPrompt(input) }],
    output_config: {
      format: { type: 'json_schema', schema: STRUCTURE_OUTPUT_JSON_SCHEMA },
      effort: CLAUDE_EFFORT,
    },
  });

  if (response.stop_reason === 'refusal') {
    return { output: undefined, refused: true };
  }

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock) {
    throw new Error('odysseus analyze (structure pass): Claude response contained no text content block');
  }

  const output = structurePassOutputSchema.parse(JSON.parse(textBlock.text));
  return { output, refused: false };
}

/** Single call to Claude for the writing pass. Same posture as
 *  callClaudeForStructure, against writingPassOutputSchema and
 *  WRITING_OUTPUT_JSON_SCHEMA instead. */
export async function callClaudeForWriting(
  input: WritingInput,
  usedFallbackContext: boolean,
): Promise<RawWritingCallResult> {
  const client = createClient();

  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    // See callClaudeForStructure's comment - same rationale applies here.
    thinking: { type: 'disabled' },
    system: buildWritingSystemPrompt(input.language, usedFallbackContext),
    messages: [{ role: 'user', content: buildWritingUserPrompt(input) }],
    output_config: {
      format: { type: 'json_schema', schema: WRITING_OUTPUT_JSON_SCHEMA },
      effort: CLAUDE_EFFORT,
    },
  });

  if (response.stop_reason === 'refusal') {
    return { output: undefined, refused: true };
  }

  const textBlock = response.content.find((block) => block.type === 'text');
  if (!textBlock) {
    throw new Error('odysseus analyze (writing pass): Claude response contained no text content block');
  }

  const output = writingPassOutputSchema.parse(JSON.parse(textBlock.text));
  return { output, refused: false };
}
