import { z } from 'zod';
import type { FindingsProvenance } from '../normalize/findings-provenance.js';
import { MAX_CUSTOM_COVER_QUESTION_LENGTH } from './vocabulary.js';

/**
 * The report-preparation aggregate, plan 019 step 1 (trade-off 62). One
 * deep module owns this shape; store services own persistence, interface
 * handlers own transport, and neither reimplements preparation policy.
 *
 * `warningAcknowledgement` and `writingSelection` are workflow metadata the
 * operator only touches through dedicated service methods; the operator
 * patch schema below deliberately does not accept them.
 */

export interface LocalizedOptionalText {
  fr?: string;
  en?: string;
}

/** Reference to one persisted immutable French/English analysis pair. */
export interface AnalysisPairRef {
  frAnalysisId: string;
  enAnalysisId: string;
  findingsProvenance: FindingsProvenance;
}

/**
 * One rejected writing attempt, kept so a failed run says which guards
 * rejected it and when, not only what the last message was.
 *
 * Issue #409: a run that burned three attempts on three different guards left
 * the two earlier reasons nowhere the operator could reach without reading the
 * server's logs, so "which guards reject most often" had no answer but an
 * anecdote. Guard names only: the violating text is model prose about a
 * client's site and belongs in the analysis artifact, not in this aggregate.
 * The human-readable reasons stay on the candidate's `reason`.
 */
export interface WritingGuardRejection {
  /** 1-based, matching the attempt numbering the writing pass logs. */
  attempt: number;
  totalAttempts: number;
  guards: readonly string[];
}

/**
 * Candidate state, discriminated so invalid combinations are
 * unrepresentable. `generating` is deliberately not persistable: it lives
 * only in the interface process while a regeneration request is in flight,
 * so a server restart can never strand a stuck generating candidate.
 * A `failed` candidate may carry the partial analyses its run managed to
 * persist before failing (one language succeeding while the other hits a
 * provider error, for example); the selection fallback must never adopt
 * them, exactly as it must never adopt a ready pair.
 */
export type WritingCandidateState =
  | { status: 'ready'; pair: AnalysisPairRef; createdAt: string }
  | {
      status: 'failed';
      reason: string;
      createdAt: string;
      partialPair?: Partial<AnalysisPairRef> | undefined;
      guardRejections?: readonly WritingGuardRejection[] | undefined;
    }
  | { status: 'selected'; pair: AnalysisPairRef; approvedAt: string };

export interface WritingSelection {
  selected?: AnalysisPairRef;
  candidate?: WritingCandidateState;
}

export interface ReportPreparation {
  customCoverQuestion?: LocalizedOptionalText;
  warningAcknowledgement?: {
    digest: string;
    acknowledgedAt: string;
  };
  writingSelection?: WritingSelection;
  updatedAt: string;
}

/** A fresh aggregate with no operator input and no workflow metadata. */
export function emptyReportPreparation(): ReportPreparation {
  return {
    updatedAt: new Date().toISOString(),
  };
}

const boundedText = (max: number) => z.string().trim().min(1).max(max);

/** A localized optional text: each language independently present, bounded,
 *  or explicitly cleared with null. A missing language uses safe generic
 *  copy; it is never machine translated or copied from the other language. */
export const localizedOptionalTextSchema = z
  .object({
    fr: boundedText(MAX_CUSTOM_COVER_QUESTION_LENGTH).nullable().optional(),
    en: boundedText(MAX_CUSTOM_COVER_QUESTION_LENGTH).nullable().optional(),
  })
  .strict();

/**
 * The bounded operator inputs, and the only body a preparation patch
 * accepts. Unknown keys are rejected (strict) and overlong text is
 * rejected rather than clamped. Absent means unchanged; null means clear.
 */
export const reportPreparationPatchSchema = z
  .object({
    customCoverQuestion: localizedOptionalTextSchema.nullable().optional(),
  })
  .strict();

export type ReportPreparationPatch = z.infer<typeof reportPreparationPatchSchema>;

/**
 * Parse-and-normalize entry point for transport boundaries. Throws a Zod
 * error on any unknown option, oversized text, or malformed shape; callers
 * map that to their own bad-request response. Trimming is part of parsing,
 * so stored text is always trimmed.
 */
export function parseReportPreparationPatch(body: unknown): ReportPreparationPatch {
  return reportPreparationPatchSchema.parse(body);
}

function applyLocalizedText(
  current: LocalizedOptionalText | undefined,
  patch: { fr?: string | null | undefined; en?: string | null | undefined } | null | undefined,
): LocalizedOptionalText | undefined {
  if (patch === undefined) return current;
  if (patch === null) return undefined;
  const fr = patch.fr === undefined ? current?.fr : (patch.fr ?? undefined);
  const en = patch.en === undefined ? current?.en : (patch.en ?? undefined);
  if (fr === undefined && en === undefined) return undefined;
  return { ...(fr !== undefined ? { fr } : {}), ...(en !== undefined ? { en } : {}) };
}

/**
 * Apply a validated patch to the operator-owned inputs. Workflow metadata
 * (acknowledgement, writing selection) passes through untouched here.
 */
export function applyPreparationPatch(
  current: ReportPreparation,
  patch: ReportPreparationPatch,
  now: string,
): ReportPreparation {
  const customCoverQuestion = applyLocalizedText(
    current.customCoverQuestion,
    patch.customCoverQuestion,
  );

  return {
    ...(customCoverQuestion !== undefined ? { customCoverQuestion } : {}),
    ...(current.warningAcknowledgement
      ? { warningAcknowledgement: current.warningAcknowledgement }
      : {}),
    ...(current.writingSelection ? { writingSelection: current.writingSelection } : {}),
    updatedAt: now,
  };
}
