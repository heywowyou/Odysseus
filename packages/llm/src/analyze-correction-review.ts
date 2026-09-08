import { callOpenAiForCorrectionReview } from './client.js';
import { OPENAI_MODEL, OPENAI_TEMPERATURE } from './constants.js';
import {
  describeCorrectionFieldMismatch,
  type CorrectionReviewInput,
  type CorrectionReviewOutput,
} from './correction-review-schema.js';

export type CorrectionReviewOutcome =
  | { status: 'ok'; output: CorrectionReviewOutput; model: string; temperature: number }
  | { status: 'skipped'; reason: string; model: string; temperature: number };

/** One advisory call, no retry. Any provider, parse, or correlation failure
 * is an observable skipped artifact, never a failure or retry of writing. */
export async function analyzeCorrectionReview(
  input: CorrectionReviewInput,
): Promise<CorrectionReviewOutcome> {
  try {
    const { output } = await callOpenAiForCorrectionReview(input);
    const mismatch = describeCorrectionFieldMismatch(input, output);
    if (mismatch !== undefined) {
      return {
        status: 'skipped',
        reason: mismatch,
        model: OPENAI_MODEL,
        temperature: OPENAI_TEMPERATURE,
      };
    }
    return { status: 'ok', output, model: OPENAI_MODEL, temperature: OPENAI_TEMPERATURE };
  } catch (error) {
    return {
      status: 'skipped',
      reason: error instanceof Error ? error.message : String(error),
      model: OPENAI_MODEL,
      temperature: OPENAI_TEMPERATURE,
    };
  }
}
