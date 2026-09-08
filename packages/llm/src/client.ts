import OpenAI from 'openai';
import { getOpenAiApiKey, getOpenAiBaseUrl } from './config.js';
import {
  OPENAI_MODEL,
  OPENAI_TEMPERATURE,
  WRITING_OPENAI_TEMPERATURE,
  MAX_OUTPUT_TOKENS,
  REVIEWER_MAX_OUTPUT_TOKENS,
  CORRECTION_REVIEW_MAX_OUTPUT_TOKENS,
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
import { buildWritingOutputJsonSchema } from './writing-output-schema.js';
import { buildWritingSystemPrompt, buildWritingUserPrompt } from './writing-prompt.js';
import {
  reviewerPassOutputSchema,
  type ReviewerInput,
  type ReviewerPassOutput,
} from './reviewer-schema.js';
import { REVIEWER_OUTPUT_JSON_SCHEMA } from './reviewer-output-schema.js';
import { buildReviewerSystemPrompt, buildReviewerUserPrompt } from './reviewer-prompt.js';
import {
  correctionReviewOutputSchema,
  eligibleCorrectionFields,
  type CorrectionReviewInput,
  type CorrectionReviewOutput,
} from './correction-review-schema.js';
import { buildCorrectionReviewOutputJsonSchema } from './correction-review-output-schema.js';
import {
  buildCorrectionReviewSystemPrompt,
  buildCorrectionReviewUserPrompt,
} from './correction-review-prompt.js';
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

/** Token usage as reported by the provider for one call. Populated when
 *  the response carries usage; the production analysis path ignores it -
 *  it exists so the plan 029 lever E measurement script can compare cost
 *  across reasoning_effort settings without a second request shape. */
export interface WritingCallUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Tokens spent on reasoning above the visible completion, when the
   *  provider breaks them out; the whole point of lever E's comparison. */
  reasoningTokens?: number;
}

/** The reasoning_effort values the API accepts for the configured model.
 *  Production runs every pass at 'none' (trade-off 67); the raised values
 *  exist for plan 029 lever E's measurement script and are never set by
 *  the production path. */
export type ReasoningEffort = 'none' | 'low' | 'medium' | 'high';

export interface RawWritingCallResult {
  output: WritingPassOutput;
  usage?: WritingCallUsage;
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

/** Turn the provider's theme map back into the array shape the rest of the
 *  codebase reads, in the order the themes were shown to the model.
 *
 *  Issue #36: the provider is asked for an object keyed by theme key so a
 *  duplicate, missing, or invented key is unrepresentable rather than caught
 *  after the fact. That makes the response shape deliberately different from
 *  writingPassOutputSchema's, and this is the one place that difference is
 *  bridged. Theme order is now the input's order rather than whatever order
 *  the model happened to emit.
 *
 *  Nothing here validates: writingPassOutputSchema.parse() below still owns
 *  that, on the array this produces. A response missing a key simply produces
 *  an entry Zod then rejects, exactly as before. */
function toThemeArray(themeKeys: readonly string[], themes: unknown): unknown {
  if (typeof themes !== 'object' || themes === null || Array.isArray(themes)) return themes;
  const byKey = themes as Record<string, unknown>;
  return themeKeys
    .filter((themeKey) => themeKey in byKey)
    .map((themeKey) => {
      const theme = byKey[themeKey];
      return typeof theme === 'object' && theme !== null && !Array.isArray(theme)
        ? { themeKey, ...(theme as Record<string, unknown>) }
        : theme;
    });
}

/** Single call to OpenAI for the writing pass. Same posture as
 *  callOpenAiForStructure, against writingPassOutputSchema and a
 *  per-call schema from buildWritingOutputJsonSchema instead. The schema is
 *  built from input.themes rather than from a second list, so it constrains
 *  exactly the theme keys the prompt shows and there is no parallel source of
 *  truth to drift (issue #36).
 *
 *  previousRejection is undefined on the first attempt and carries the
 *  guard's failure reason thereafter, appended to the user prompt so a
 *  retry is a correction rather than a rerun of the identical conversation
 *  (issue #21, same fix shape as callOpenAiForOutreach for issue #12). */
export async function callOpenAiForWriting(
  input: WritingInput,
  usedFallbackContext: boolean,
  previousRejection?: string,
  /** Plan 029 lever E measurement only; production keeps the trade-off 67
   *  default of 'none', so every existing caller is unchanged. */
  reasoningEffort: ReasoningEffort = 'none',
): Promise<RawWritingCallResult> {
  const client = createClient();
  const themeKeys = input.themes.map((theme) => theme.themeKey);

  const response = await withProviderRetryAfterHint(() =>
    client.chat.completions.create({
      model: OPENAI_MODEL,
      max_completion_tokens: MAX_OUTPUT_TOKENS,
      temperature: WRITING_OPENAI_TEMPERATURE,
      reasoning_effort: reasoningEffort,
      messages: [
        {
          role: 'system',
          content: buildWritingSystemPrompt(
            input.language,
            usedFallbackContext,
            input.dominantPerformanceMetric,
            input.providerPhrase,
            input.siteContext,
          ),
        },
        { role: 'user', content: buildWritingUserPrompt(input, previousRejection) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'writing_pass_output',
          schema: buildWritingOutputJsonSchema(themeKeys),
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

  const parsed: unknown = JSON.parse(content);
  // A non-object response is handed to Zod untouched, so its rejection reads
  // as the schema violation it is rather than as a transform failure.
  const raw = parsed as Record<string, unknown>;
  const output = writingPassOutputSchema.parse(
    typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? { ...raw, themes: toThemeArray(themeKeys, raw.themes) }
      : parsed,
  );
  const usage = response.usage;
  return {
    output,
    ...(usage
      ? {
          usage: {
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
            ...(usage.completion_tokens_details?.reasoning_tokens !== undefined
              ? { reasoningTokens: usage.completion_tokens_details.reasoning_tokens }
              : {}),
          },
        }
      : {}),
  };
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

export interface RawCorrectionReviewCallResult {
  output: CorrectionReviewOutput;
}

/** A separate, one-shot structured call for advisory correction proposals.
 * Unlike writing, it deliberately has no retry path and never returns a
 * replacement to the report pipeline: analyzeCorrectionReview converts every
 * failure to a skipped artifact for later operator measurement. */
export async function callOpenAiForCorrectionReview(
  input: CorrectionReviewInput,
): Promise<RawCorrectionReviewCallResult> {
  const client = createClient();
  const response = await withProviderRetryAfterHint(() =>
    client.chat.completions.create({
      model: OPENAI_MODEL,
      max_completion_tokens: CORRECTION_REVIEW_MAX_OUTPUT_TOKENS,
      temperature: OPENAI_TEMPERATURE,
      reasoning_effort: 'none',
      messages: [
        { role: 'system', content: buildCorrectionReviewSystemPrompt() },
        { role: 'user', content: buildCorrectionReviewUserPrompt(input) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'correction_review_output',
          schema: buildCorrectionReviewOutputJsonSchema(eligibleCorrectionFields(input)),
          strict: true,
        },
      },
    }),
  );
  const choice = response.choices?.[0];
  if (!choice) {
    throw new Error('odysseus analyze (correction review): OpenAI response contained no choices');
  }
  if (choice.finish_reason === 'length') {
    throw new Error(
      'odysseus analyze (correction review): OpenAI response was truncated (finish_reason: length)',
    );
  }
  if (choice.message.refusal) {
    throw new Error(
      `odysseus analyze (correction review): OpenAI refused the request: ${choice.message.refusal}`,
    );
  }
  const content = choice.message.content;
  if (typeof content !== 'string') {
    throw new Error(
      'odysseus analyze (correction review): OpenAI response content was not a plain string (unexpected shape)',
    );
  }
  return { output: correctionReviewOutputSchema.parse(JSON.parse(content)) };
}
