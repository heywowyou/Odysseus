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

/**
 * Plan 067: one selected writing version. French is canonical and required;
 * English is an optional attachment generated only on explicit request.
 *
 * The field names intentionally stay compatible with the historical
 * bilingual shape so old stored selections need no migration.
 */
export interface AnalysisSelectionRef {
  frAnalysisId: string;
  enAnalysisId?: string;
  findingsProvenance: FindingsProvenance;
}

/** @deprecated Historical name retained for source compatibility. */
export type AnalysisPairRef = AnalysisSelectionRef;

/**
 * One rejected writing attempt, kept so a failed run says which guards
 * rejected it and when, not only what the last message was.
 */
export interface WritingGuardRejection {
  attempt: number;
  totalAttempts: number;
  guards: readonly string[];
}

export type WritingCandidateState =
  | { status: 'ready'; pair: AnalysisSelectionRef; createdAt: string }
  | {
      status: 'failed';
      reason: string;
      createdAt: string;
      partialPair?: Partial<AnalysisSelectionRef> | undefined;
      guardRejections?: readonly WritingGuardRejection[] | undefined;
    }
  | { status: 'selected'; pair: AnalysisSelectionRef; approvedAt: string };

export interface WritingSelection {
  selected?: AnalysisSelectionRef;
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

export function emptyReportPreparation(): ReportPreparation {
  return {
    updatedAt: new Date().toISOString(),
  };
}

const boundedText = (max: number) => z.string().trim().min(1).max(max);

export const localizedOptionalTextSchema = z
  .object({
    fr: boundedText(MAX_CUSTOM_COVER_QUESTION_LENGTH).nullable().optional(),
    en: boundedText(MAX_CUSTOM_COVER_QUESTION_LENGTH).nullable().optional(),
  })
  .strict();

export const reportPreparationPatchSchema = z
  .object({
    customCoverQuestion: localizedOptionalTextSchema.nullable().optional(),
  })
  .strict();

export type ReportPreparationPatch = z.infer<typeof reportPreparationPatchSchema>;

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
