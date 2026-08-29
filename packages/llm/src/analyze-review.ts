import { callMistralForReview } from './client.js';
import { MISTRAL_MODEL, MISTRAL_TEMPERATURE } from './constants.js';
import type { ReviewerInput, ReviewerPassOutput } from './reviewer-schema.js';

/** Shadow-mode reviewer outcome. `skipped` means no review was produced:
 *  API failure, malformed body, or a themeKey correlation mismatch. The
 *  caller logs one line and continues; nothing here ever throws, so the
 *  reviewer can never block or fail an analysis. One attempt, no retry
 *  loop: this pass produces data for a human decision, not a client
 *  deliverable, and burning extra calls to force a verdict would
 *  contradict the reason it is shadow-mode in the first place. */
export type ReviewOutcome =
  | { status: 'ok'; output: ReviewerPassOutput; model: string; temperature: number }
  | { status: 'skipped'; reason: string };

/** Hand-duplicates findThemeKeyMismatches' set logic against the
 *  reviewer's own shape, the same duplicate-near-a-boundary precedent as
 *  structure-guards.ts: the original is typed for WritingPassOutput and
 *  this package does not reshape it for a second caller. */
function describeThemeKeyMismatch(input: ReviewerInput, output: ReviewerPassOutput): string | null {
  const expected = input.written.themes.map((theme) => theme.themeKey).sort();
  const actual = output.themes.map((theme) => theme.themeKey).sort();
  const missing = expected.filter((key) => !actual.includes(key));
  const extra = actual.filter((key) => !expected.includes(key));
  const duplicate = actual.filter((key, i) => actual.indexOf(key) !== i);
  if (missing.length === 0 && extra.length === 0 && duplicate.length === 0) return null;
  return `theme key mismatch - missing: [${missing.join(', ')}], extra: [${extra.join(', ')}], duplicate: [${duplicate.join(', ')}]`;
}

export async function analyzeReview(input: ReviewerInput): Promise<ReviewOutcome> {
  try {
    const result = await callMistralForReview(input);
    const mismatch = describeThemeKeyMismatch(input, result.output);
    if (mismatch) {
      return { status: 'skipped', reason: mismatch };
    }
    return {
      status: 'ok',
      output: result.output,
      model: MISTRAL_MODEL,
      temperature: MISTRAL_TEMPERATURE,
    };
  } catch (error) {
    return {
      status: 'skipped',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/** One line per unsupported verdict, for the operator-facing warning the
 *  analysis stage prints and for scanning the persisted review file.
 *  Field labels reuse the deterministic guards' naming convention so a
 *  line here points at the same place a guard rejection would. */
export function summarizeUnsupportedReviews(output: ReviewerPassOutput): string[] {
  const lines: string[] = [];
  const add = (field: string, verdict: { reason: string }): void => {
    lines.push(`${field}: ${verdict.reason}`);
  };

  if (output.executiveSummary.verdict === 'unsupported') {
    add('executiveSummary', output.executiveSummary);
  }
  if (output.notes.verdict === 'unsupported') {
    add('notes', output.notes);
  }
  for (const theme of output.themes) {
    if (theme.businessImpact.verdict === 'unsupported') {
      add(`themes(${theme.themeKey}).businessImpact`, theme.businessImpact);
    }
    theme.recommendedActions.forEach((review, i) => {
      if (review.verdict === 'unsupported') {
        add(`themes(${theme.themeKey}).recommendedActions[${i}]`, review);
      }
    });
  }
  return lines;
}
