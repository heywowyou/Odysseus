import { z } from 'zod';
import type { WritingInput, WritingPassOutput } from './writing-schema.js';

const MAX_REVIEW_REASON_CHARS = 400;

/** One prose field's review verdict. `reason` is required for every
 *  verdict, not just 'unsupported': the reviewer is evidence-bound by
 *  construction, so a 'supported' must name the input fact that supports
 *  the claims and an 'unsupported' must quote the claim and state that no
 *  input contains it. A verdict with no reason is worth nothing when a
 *  human audits the shadow stream. Reasons are internal operator-facing
 *  artifacts, written in English regardless of the report language so the
 *  stream is uniformly greppable. */
const fieldReviewSchema = z
  .object({
    verdict: z.enum(['supported', 'unsupported', 'unsure']),
    reason: z.string().min(1).max(MAX_REVIEW_REASON_CHARS),
  })
  .strict();

/** Reviews the same prose surface the deterministic guards scan:
 *  businessImpact and recommendedActions per theme, plus
 *  executiveSummary and notes. Theme titles are excluded for the same
 *  reason as the guards: short labels whose claims surface in the
 *  reviewed fields anyway. Echoes themeKey verbatim, one review object
 *  per theme, same correlation contract as the writing pass (section 9). */
export const reviewerThemeSchema = z
  .object({
    themeKey: z.string().min(1),
    businessImpact: fieldReviewSchema,
    recommendedActions: z.array(fieldReviewSchema).min(1).max(3),
  })
  .strict();

export const reviewerPassOutputSchema = z
  .object({
    themes: z.array(reviewerThemeSchema).min(1).max(20),
    executiveSummary: fieldReviewSchema,
    notes: fieldReviewSchema,
  })
  .strict();

export type FieldReview = z.infer<typeof fieldReviewSchema>;
export type ReviewerPassOutput = z.infer<typeof reviewerPassOutputSchema>;

/** The reviewer sees exactly what the writer saw (WritingInput, the same
 *  object passed to analyzeWriting) plus exactly what the writer wrote.
 *  Nothing else: judging support against anything the writer never had
 *  would condemn prose for facts the writer could not have known were
 *  wrong, the mirror image of the invented-finding problem. */
export interface ReviewerInput {
  writingInput: WritingInput;
  written: WritingPassOutput;
}
