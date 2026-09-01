import { Mistral } from '@mistralai/mistralai';
import { getMistralApiKey } from './config.js';
import {
  MISTRAL_MODEL,
  MISTRAL_TEMPERATURE,
  MAX_OUTPUT_TOKENS,
  REVIEWER_MAX_OUTPUT_TOKENS,
} from './constants.js';
import {
  structurePassOutputSchema,
  type StructureInput,
  type StructurePassOutput,
} from './structure-schema.js';
import { STRUCTURE_OUTPUT_JSON_SCHEMA } from './structure-output-schema.js';
import { buildStructureSystemPrompt, buildStructureUserPrompt } from './structure-prompt.js';
import {
  writingPassOutputSchema,
  type WritingInput,
  type WritingPassOutput,
} from './writing-schema.js';
import { WRITING_OUTPUT_JSON_SCHEMA } from './writing-output-schema.js';
import { buildWritingSystemPrompt, buildWritingUserPrompt } from './writing-prompt.js';
import {
  reviewerPassOutputSchema,
  type ReviewerInput,
  type ReviewerPassOutput,
} from './reviewer-schema.js';
import { REVIEWER_OUTPUT_JSON_SCHEMA } from './reviewer-output-schema.js';
import { buildReviewerSystemPrompt, buildReviewerUserPrompt } from './reviewer-prompt.js';

function createClient(): Mistral {
  return new Mistral({ apiKey: getMistralApiKey() });
}

export interface RawStructureCallResult {
  output: StructurePassOutput;
}

export interface RawWritingCallResult {
  output: WritingPassOutput;
}

/** Single call to Mistral for the structure pass. Returns a
 *  schema-validated StructurePassOutput. Throws on transport/API errors, a
 *  truncated response, or a malformed/schema-invalid body - all three
 *  propagate to analyzeStructure's retry loop like any other failed
 *  attempt. Mistral has no distinct refusal signal equivalent to
 *  Anthropic's stop_reason 'refusal'; refusal-like model behavior surfaces
 *  as a JSON parse or Zod validation failure instead and is caught the
 *  same way.
 *
 *  Uses responseFormat as a shape hint (see structure-output-schema.ts for
 *  why it's a hand-built JSON Schema rather than the SDK's
 *  responseFormatFromZodObject helper), then runs an explicit, visible
 *  structurePassOutputSchema.parse() on the response text - not implicit
 *  trust in the API's shape constraint - because CLAUDE.md's "all LLM
 *  output is validated with Zod" rule is a non-negotiable business rule
 *  and must be an obvious, auditable line in this code. */
export async function callMistralForStructure(
  input: StructureInput,
  usedFallbackContext: boolean,
): Promise<RawStructureCallResult> {
  const client = createClient();

  const response = await client.chat.complete({
    model: MISTRAL_MODEL,
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: MISTRAL_TEMPERATURE,
    // reasoningEffort is deliberately never set: Magistral's chain-of-thought
    // "thinking" content blocks share this same maxTokens budget with the
    // JSON answer, the exact failure mode that already forced
    // MAX_OUTPUT_TOKENS to 16000 once for Claude's adaptive thinking. Leaving
    // it unset also keeps message.content a plain string (see below) rather
    // than a content-chunk array.
    messages: [
      { role: 'system', content: buildStructureSystemPrompt(usedFallbackContext) },
      { role: 'user', content: buildStructureUserPrompt(input) },
    ],
    responseFormat: {
      type: 'json_schema',
      jsonSchema: {
        name: 'structure_pass_output',
        schemaDefinition: STRUCTURE_OUTPUT_JSON_SCHEMA,
        strict: true,
      },
    },
  });

  const choice = response.choices?.[0];
  if (!choice) {
    throw new Error('odysseus analyze (structure pass): Mistral response contained no choices');
  }

  if (choice.finishReason === 'length') {
    throw new Error(
      'odysseus analyze (structure pass): Mistral response was truncated (finishReason: length) - increase MAX_OUTPUT_TOKENS',
    );
  }

  const content = choice.message?.content;
  if (typeof content !== 'string') {
    throw new Error(
      'odysseus analyze (structure pass): Mistral response content was not a plain string (unexpected shape)',
    );
  }

  const output = structurePassOutputSchema.parse(JSON.parse(content));
  return { output };
}

/** Single call to Mistral for the writing pass. Same posture as
 *  callMistralForStructure, against writingPassOutputSchema and
 *  WRITING_OUTPUT_JSON_SCHEMA instead.
 *
 *  previousRejection is undefined on the first attempt and carries the
 *  guard's failure reason thereafter, appended to the user prompt so a
 *  retry is a correction rather than a rerun of the identical conversation
 *  (issue #21, same fix shape as callMistralForOutreach for issue #12). */
export async function callMistralForWriting(
  input: WritingInput,
  usedFallbackContext: boolean,
  previousRejection?: string,
): Promise<RawWritingCallResult> {
  const client = createClient();

  const response = await client.chat.complete({
    model: MISTRAL_MODEL,
    maxTokens: MAX_OUTPUT_TOKENS,
    temperature: MISTRAL_TEMPERATURE,
    // See callMistralForStructure's comment - same rationale applies here.
    messages: [
      {
        role: 'system',
        content: buildWritingSystemPrompt(
          input.language,
          usedFallbackContext,
          input.dominantPerformanceMetric,
        ),
      },
      { role: 'user', content: buildWritingUserPrompt(input, previousRejection) },
    ],
    responseFormat: {
      type: 'json_schema',
      jsonSchema: {
        name: 'writing_pass_output',
        schemaDefinition: WRITING_OUTPUT_JSON_SCHEMA,
        strict: true,
      },
    },
  });

  const choice = response.choices?.[0];
  if (!choice) {
    throw new Error('odysseus analyze (writing pass): Mistral response contained no choices');
  }

  if (choice.finishReason === 'length') {
    throw new Error(
      'odysseus analyze (writing pass): Mistral response was truncated (finishReason: length) - increase MAX_OUTPUT_TOKENS',
    );
  }

  const content = choice.message?.content;
  if (typeof content !== 'string') {
    throw new Error(
      'odysseus analyze (writing pass): Mistral response content was not a plain string (unexpected shape)',
    );
  }

  const output = writingPassOutputSchema.parse(JSON.parse(content));
  return { output };
}

export interface RawReviewerCallResult {
  output: ReviewerPassOutput;
}

/** Single call to Mistral for the shadow reviewer pass. Same posture as
 *  callMistralForWriting, against reviewerPassOutputSchema and
 *  REVIEWER_OUTPUT_JSON_SCHEMA instead, with the reviewer's own token
 *  budget. The reviewer is shadow-mode: any error this throws is caught
 *  by analyzeReview, which skips the review and never blocks the
 *  analysis, so unlike the two production passes nothing here feeds a
 *  retry loop. */
export async function callMistralForReview(input: ReviewerInput): Promise<RawReviewerCallResult> {
  const client = createClient();

  const response = await client.chat.complete({
    model: MISTRAL_MODEL,
    maxTokens: REVIEWER_MAX_OUTPUT_TOKENS,
    temperature: MISTRAL_TEMPERATURE,
    messages: [
      { role: 'system', content: buildReviewerSystemPrompt() },
      { role: 'user', content: buildReviewerUserPrompt(input) },
    ],
    responseFormat: {
      type: 'json_schema',
      jsonSchema: {
        name: 'reviewer_pass_output',
        schemaDefinition: REVIEWER_OUTPUT_JSON_SCHEMA,
        strict: true,
      },
    },
  });

  const choice = response.choices?.[0];
  if (!choice) {
    throw new Error('odysseus analyze (review pass): Mistral response contained no choices');
  }

  if (choice.finishReason === 'length') {
    throw new Error(
      'odysseus analyze (review pass): Mistral response was truncated (finishReason: length) - increase REVIEWER_MAX_OUTPUT_TOKENS',
    );
  }

  const content = choice.message?.content;
  if (typeof content !== 'string') {
    throw new Error(
      'odysseus analyze (review pass): Mistral response content was not a plain string (unexpected shape)',
    );
  }

  const output = reviewerPassOutputSchema.parse(JSON.parse(content));
  return { output };
}
