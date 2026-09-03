import OpenAI from 'openai';
import { getOpenAiApiKey, getOpenAiBaseUrl } from '../config.js';
import { OPENAI_MODEL, OPENAI_TEMPERATURE, MAX_OUTPUT_TOKENS } from '../constants.js';
import { buildOutreachSystemPrompt, buildOutreachUserPrompt } from './outreach-prompt.js';
import type { OutreachProseInput } from './outreach-input.js';
import {
  OUTREACH_TOUCH1_OUTPUT_JSON_SCHEMA,
  OUTREACH_TOUCH2_OUTPUT_JSON_SCHEMA,
  OUTREACH_TOUCH3_OUTPUT_JSON_SCHEMA,
} from './outreach-output-schema.js';
import {
  outreachTouch1OutputSchema,
  outreachTouch2OutputSchema,
  outreachTouch3OutputSchema,
  type OutreachProseOutput,
} from './outreach-schema.js';

function createClient(): OpenAI {
  return new OpenAI({ apiKey: getOpenAiApiKey(), baseURL: getOpenAiBaseUrl() });
}

export interface RawOutreachCallResult {
  output: OutreachProseOutput;
}

/**
 * Single call to OpenAI for one outreach touch. Same posture as
 * callOpenAiForStructure/callOpenAiForWriting in client.ts: response_format
 * is a shape hint only, the real validation authority is the explicit
 * schema.parse() below. Dispatches on input.touch to the matching
 * schema/JSON-mirror pair rather than sending a single discriminated-union
 * response format - see outreach-schema.ts's doc comment for why a union
 * response format is not used here.
 *
 * previousRejection is undefined on the first attempt and carries the guard's
 * failure reason thereafter, so a retry is a correction rather than a
 * rerun of the identical conversation (issue #12).
 */
export async function callOpenAiForOutreach(
  input: OutreachProseInput,
  previousRejection?: string,
): Promise<RawOutreachCallResult> {
  const client = createClient();

  const jsonSchema =
    input.touch === 1
      ? OUTREACH_TOUCH1_OUTPUT_JSON_SCHEMA
      : input.touch === 2
        ? OUTREACH_TOUCH2_OUTPUT_JSON_SCHEMA
        : OUTREACH_TOUCH3_OUTPUT_JSON_SCHEMA;

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    max_completion_tokens: MAX_OUTPUT_TOKENS,
    temperature: OPENAI_TEMPERATURE,
    reasoning_effort: 'none',
    messages: [
      { role: 'system', content: buildOutreachSystemPrompt(input) },
      { role: 'user', content: buildOutreachUserPrompt(input, previousRejection) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: `outreach_touch${input.touch}_output`,
        schema: jsonSchema,
        strict: true,
      },
    },
  });

  const choice = response.choices?.[0];
  if (!choice) {
    throw new Error(
      `odysseus outreach (touch ${input.touch}): OpenAI response contained no choices`,
    );
  }

  if (choice.finish_reason === 'length') {
    throw new Error(
      `odysseus outreach (touch ${input.touch}): OpenAI response was truncated (finish_reason: length) - increase MAX_OUTPUT_TOKENS`,
    );
  }

  if (choice.message.refusal) {
    throw new Error(
      `odysseus outreach (touch ${input.touch}): OpenAI refused the request: ${choice.message.refusal}`,
    );
  }

  const content = choice.message.content;
  if (typeof content !== 'string') {
    throw new Error(
      `odysseus outreach (touch ${input.touch}): OpenAI response content was not a plain string (unexpected shape)`,
    );
  }

  const parsed: unknown = JSON.parse(content);

  const output =
    input.touch === 1
      ? outreachTouch1OutputSchema.parse(parsed)
      : input.touch === 2
        ? outreachTouch2OutputSchema.parse(parsed)
        : outreachTouch3OutputSchema.parse(parsed);

  return { output };
}
