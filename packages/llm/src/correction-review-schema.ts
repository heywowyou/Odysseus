import { z } from 'zod';
import type { WritingInput, WritingPassOutput } from './writing-schema.js';

const MAX_CORRECTION_REASON_CHARS = 500;

/** An address is deliberately a small closed grammar, not a prose label the
 * model can repurpose. Correlation below narrows the grammar to the exact
 * fields accepted from this particular writing pass. */
export const correctionFieldSchema = z
  .string()
  .regex(
    /^(?:executiveSummary|notes|themes\([A-Za-z0-9_-]+\)\.(?:businessImpact|recommendedActions\[\d+\]))$/u,
  );

export const correctionCheckSchema = z.enum([
  'unsupported-specific-claim',
  'unhedged-causality',
  'language-quality',
  'repetition',
  'translation-parity',
]);

const correctionProposalBase = {
  field: correctionFieldSchema,
  checks: z.array(correctionCheckSchema).max(5),
  reason: z.string().min(1).max(MAX_CORRECTION_REASON_CHARS),
};

/** A correction proposal is an advisory artifact, never an edit. The
 * discriminated shapes make a replacement impossible unless the model has
 * explicitly proposed a change, and forbid it otherwise. */
export const correctionProposalSchema = z.discriminatedUnion('verdict', [
  z.object({ ...correctionProposalBase, verdict: z.literal('keep') }).strict(),
  z
    .object({
      ...correctionProposalBase,
      verdict: z.literal('propose-change'),
      replacement: z.string().min(1),
    })
    .strict(),
  z.object({ ...correctionProposalBase, verdict: z.literal('unsure') }).strict(),
]);

export const correctionReviewOutputSchema = z
  .object({ proposals: z.array(correctionProposalSchema).min(1).max(122) })
  .strict();

export type CorrectionProposal = z.infer<typeof correctionProposalSchema>;
export type CorrectionReviewOutput = z.infer<typeof correctionReviewOutputSchema>;

/** The correction pass sees exactly the accepted writer input and output. It
 * intentionally has no slot for HTML, PDFs, screenshots, fetched URLs, or the
 * merged analysis that feeds the report renderer. */
export interface CorrectionReviewInput {
  writingInput: WritingInput;
  written: WritingPassOutput;
}

export function eligibleCorrectionFields(input: CorrectionReviewInput): string[] {
  return [
    'executiveSummary',
    'notes',
    ...input.written.themes.flatMap((theme) => [
      `themes(${theme.themeKey}).businessImpact`,
      ...theme.recommendedActions.map(
        (_, actionIndex) => `themes(${theme.themeKey}).recommendedActions[${actionIndex}]`,
      ),
    ]),
  ];
}

/** The provider may produce a syntactically valid field address that belongs
 * to another theme/action. Reject any missing, duplicate, or invented address
 * before this advisory data reaches an artifact. */
export function describeCorrectionFieldMismatch(
  input: CorrectionReviewInput,
  output: CorrectionReviewOutput,
): string | undefined {
  const expected = eligibleCorrectionFields(input).sort();
  const actual = output.proposals.map((proposal) => proposal.field).sort();
  const missing = expected.filter((field) => !actual.includes(field));
  const extra = actual.filter((field) => !expected.includes(field));
  const duplicate = actual.filter((field, index) => actual.indexOf(field) !== index);
  if (missing.length === 0 && extra.length === 0 && duplicate.length === 0) return undefined;
  return `correction review field correlation mismatch (missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}; duplicate: ${duplicate.join(', ') || 'none'})`;
}
