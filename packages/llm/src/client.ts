import OpenAI from 'openai';
import { getOpenAiApiKey, getOpenAiBaseUrl } from './config.js';
import {
  OPENAI_MODEL,
  OPENAI_TEMPERATURE,
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
import { appendProviderRetryAfterHint, extractProviderRetryAfterMs } from './rate-limit-pacing.js';

function createClient(): OpenAI {
  return new OpenAI({ apiKey: getOpenAiApiKey(), baseURL: getOpenAiBaseUrl() });
}

/** Re-throw a provider 429 with the wait it asked for appended to the
 *  message (issue #30): the analyze retry loops pace off the failure text
 *  and never see the error object, where the Retry-After header alone
 *  lives. Any other error, including a 429 with no readable Retry-After,
 *  passes through untouched.
 *
 *  Exported for outreach-client.ts (issue #31): the outreach loop is the
 *  same defect class on a different call site, not a copy of this logic. */
export async function withProviderRetryAfterHint<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    const retryAfterMs = extractProviderRetryAfterMs(error);
    if (retryAfterMs === undefined || !(error instanceof Error)) throw error;
    throw new Error(appendProviderRetryAfterHint(error.message, retryAfterMs), { cause: error });
  }
}

export interface RawStructureCallResult {
  output: StructurePassOutput;
}

export interface RawWritingCallResult {
  output: WritingPassOutput;
}

/** Single call to OpenAI for the structure pass. Returns a
 *  schema-validated StructurePassOutput. Throws on transport/API errors, a
 *  truncated response, or a malformed/schema-invalid body - all three
 *  propagate to analyzeStructure's retry loop like any other failed
 *  attempt. A provider refusal is also a failed attempt and follows the same
 *  retry path as malformed output.
 *
 *  Uses response_format with the explicit schema mirror in
 *  structure-output-schema.ts as a shape hint, then runs an explicit, visible
 *  structurePassOutputSchema.parse() on the response text - not implicit
 *  trust in the API's shape constraint - because CLAUDE.md's "all LLM
 *  output is validated with Zod" rule is a non-negotiable business rule
 *  and must be an obvious, auditable line in this code. */
export async function callOpenAiForStructure(
  input: StructureInput,
  usedFallbackContext: boolean,
): Promise<RawStructureCallResult> {
  const client = createClient();

  const response = await withProviderRetryAfterHint(() =>
    client.chat.completions.create({
      model: OPENAI_MODEL,
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      temperature: OPENAI_TEMPERATURE,
      reasoning_effort: 'none',
      messages: [
        { role: 'system', content: buildStructureSystemPrompt(usedFallbackContext) },
        { role: 'user', content: buildStructureUserPrompt(input) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'structure_pass_output',
          schema: STRUCTURE_OUTPUT_JSON_SCHEMA,
          strict: true,
        },
      },
    }),
  );

  const choice = response.choices?.[0];
  if (!choice) {
    throw new Error('odysseus analyze (structure pass): OpenAI response contained no choices');
  }

  if (choice.finish_reason === 'length') {
    throw new Error(
      'odysseus analyze (structure pass): OpenAI response was truncated (finish_reason: length) - increase MAX_OUTPUT_TOKENS',
    );
  }

  if (choice.message.refusal) {
    throw new Error(
      `odysseus analyze (structure pass): OpenAI refused the request: ${choice.message.refusal}`,
    );
  }

  const content = choice.message.content;
  if (typeof content !== 'string') {
    throw new Error(
      'odysseus analyze (structure pass): OpenAI response content was not a plain string (unexpected shape)',
    );
  }

  const output = structurePassOutputSchema.parse(JSON.parse(content));
  return { output };
}

/** Single call to OpenAI for the writing pass. Same posture as
 *  callOpenAiForStructure, against writingPassOutputSchema and
 *  WRITING_OUTPUT_JSON_SCHEMA instead.
 *
 *  previousRejection is undefined on the first attempt and carries the
 *  guard's failure reason thereafter, appended to the user prompt so a
 *  retry is a correction rather than a rerun of the identical conversation
 *  (issue #21, same fix shape as callOpenAiForOutreach for issue #12). */
export async function callOpenAiForWriting(
  input: WritingInput,
  usedFallbackContext: boolean,
  previousRejection?: string,
): Promise<RawWritingCallResult> {
  const client = createClient();

  const response = await withProviderRetryAfterHint(() =>
    client.chat.completions.create({
      model: OPENAI_MODEL,
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      temperature: OPENAI_TEMPERATURE,
      reasoning_effort: 'none',
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
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'writing_pass_output',
          schema: WRITING_OUTPUT_JSON_SCHEMA,
          strict: true,
        },
      },
    }),
  );

  const choice = response.choices?.[0];
  if (!choice) {
    throw new Error('odysseus analyze (writing pass): OpenAI response contained no choices');
  }

  if (choice.finish_reason === 'length') {
    throw new Error(
      'odysseus analyze (writing pass): OpenAI response was truncated (finish_reason: length) - increase MAX_OUTPUT_TOKENS',
    );
  }

  if (choice.message.refusal) {
    throw new Error(
      `odysseus analyze (writing pass): OpenAI refused the request: ${choice.message.refusal}`,
    );
  }

  const content = choice.message.content;
  if (typeof content !== 'string') {
    throw new Error(
      'odysseus analyze (writing pass): OpenAI response content was not a plain string (unexpected shape)',
    );
  }

  const output = writingPassOutputSchema.parse(JSON.parse(content));
  return { output };
}

export interface RawReviewerCallResult {
  output: ReviewerPassOutput;
}

/** Single call to OpenAI for the shadow reviewer pass. Same posture as
 *  callOpenAiForWriting, against reviewerPassOutputSchema and
 *  REVIEWER_OUTPUT_JSON_SCHEMA instead, with the reviewer's own token
 *  budget. The reviewer is shadow-mode: any error this throws is caught
 *  by analyzeReview, which skips the review and never blocks the
 *  analysis, so unlike the two production passes nothing here feeds a
 *  retry loop. */
export async function callOpenAiForReview(input: ReviewerInput): Promise<RawReviewerCallResult> {
  const client = createClient();

  const response = await withProviderRetryAfterHint(() =>
    client.chat.completions.create({
      model: OPENAI_MODEL,
      max_completion_tokens: REVIEWER_MAX_OUTPUT_TOKENS,
      temperature: OPENAI_TEMPERATURE,
      reasoning_effort: 'none',
      messages: [
        { role: 'system', content: buildReviewerSystemPrompt() },
        { role: 'user', content: buildReviewerUserPrompt(input) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'reviewer_pass_output',
          schema: REVIEWER_OUTPUT_JSON_SCHEMA,
          strict: true,
        },
      },
    }),
  );

  const choice = response.choices?.[0];
  if (!choice) {
    throw new Error('odysseus analyze (review pass): OpenAI response contained no choices');
  }

  if (choice.finish_reason === 'length') {
    throw new Error(
      'odysseus analyze (review pass): OpenAI response was truncated (finish_reason: length) - increase REVIEWER_MAX_OUTPUT_TOKENS',
    );
  }

  if (choice.message.refusal) {
    throw new Error(
      `odysseus analyze (review pass): OpenAI refused the request: ${choice.message.refusal}`,
    );
  }

  const content = choice.message.content;
  if (typeof content !== 'string') {
    throw new Error(
      'odysseus analyze (review pass): OpenAI response content was not a plain string (unexpected shape)',
    );
  }

  const output = reviewerPassOutputSchema.parse(JSON.parse(content));
  return { output };
}
