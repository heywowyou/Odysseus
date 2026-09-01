import { z } from 'zod';
import type { FindingsProvenance } from '../normalize/findings-provenance.js';
import {
  JOURNEY_DECISIONS,
  JOURNEY_IDS,
  MAX_CUSTOM_COVER_QUESTION_LENGTH,
  MAX_STAKEHOLDER_NAME_LENGTH,
  MAX_TRIGGER_OTHER_NOTE_LENGTH,
  REPORT_SITUATIONS,
  REPORT_STAKEHOLDER_ROLES,
  REPORT_TRIGGERS,
  type JourneyDecisionKind,
  type JourneyId,
  type ReportSituation,
  type ReportStakeholderRole,
  type ReportTrigger,
} from './vocabulary.js';

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

export interface JourneyDecision {
  journeyId: JourneyId;
  decision: JourneyDecisionKind;
}

/** Reference to one persisted immutable French/English analysis pair. */
export interface AnalysisPairRef {
  frAnalysisId: string;
  enAnalysisId: string;
  findingsProvenance: FindingsProvenance;
}

/**
 * Candidate state, discriminated so invalid combinations are
 * unrepresentable. `generating` is deliberately not persistable: it lives
 * only in the interface process while a regeneration request is in flight,
 * so a server restart can never strand a stuck generating candidate.
 */
export type WritingCandidateState =
  | { status: 'ready'; pair: AnalysisPairRef; createdAt: string }
  | { status: 'failed'; reason: string; createdAt: string }
  | { status: 'selected'; pair: AnalysisPairRef; approvedAt: string };

export interface WritingSelection {
  selected?: AnalysisPairRef;
  candidate?: WritingCandidateState;
}

export interface ReportPreparation {
  context: {
    situation?: ReportSituation;
    trigger?: ReportTrigger;
    triggerOther?: LocalizedOptionalText;
  };
  customCoverQuestion?: LocalizedOptionalText;
  stakeholders: Partial<Record<ReportStakeholderRole, string>>;
  journeyDecisions: readonly JourneyDecision[];
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
    context: {},
    stakeholders: {},
    journeyDecisions: [],
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

const triggerOtherSchema = z
  .object({
    fr: boundedText(MAX_TRIGGER_OTHER_NOTE_LENGTH).nullable().optional(),
    en: boundedText(MAX_TRIGGER_OTHER_NOTE_LENGTH).nullable().optional(),
  })
  .strict();

export const reportSituationSchema = z.enum(REPORT_SITUATIONS);
export const reportTriggerSchema = z.enum(REPORT_TRIGGERS);
export const journeyIdSchema = z.enum(JOURNEY_IDS);
export const journeyDecisionKindSchema = z.enum(JOURNEY_DECISIONS);
export const reportStakeholderRoleSchema = z.enum(REPORT_STAKEHOLDER_ROLES);

/**
 * The bounded operator inputs, and the only body a preparation patch
 * accepts. Unknown keys are rejected (strict), vocabulary values outside
 * the closed sets are rejected, and overlong text is rejected rather than
 * clamped. Absent means unchanged; null means clear.
 */
export const reportPreparationPatchSchema = z
  .object({
    context: z
      .object({
        situation: reportSituationSchema.nullable().optional(),
        trigger: reportTriggerSchema.nullable().optional(),
        triggerOther: triggerOtherSchema.nullable().optional(),
      })
      .strict()
      .optional(),
    customCoverQuestion: localizedOptionalTextSchema.nullable().optional(),
    stakeholders: z
      .object({
        management: boundedText(MAX_STAKEHOLDER_NAME_LENGTH).nullable().optional(),
        technical: boundedText(MAX_STAKEHOLDER_NAME_LENGTH).nullable().optional(),
        communications: boundedText(MAX_STAKEHOLDER_NAME_LENGTH).nullable().optional(),
        legal: boundedText(MAX_STAKEHOLDER_NAME_LENGTH).nullable().optional(),
      })
      .strict()
      .optional(),
    journeyDecisions: z
      .array(
        z
          .object({
            journeyId: journeyIdSchema,
            decision: journeyDecisionKindSchema,
          })
          .strict(),
      )
      .max(JOURNEY_IDS.length)
      .optional(),
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

function applyJourneyDecisions(
  current: readonly JourneyDecision[],
  patch: ReportPreparationPatch['journeyDecisions'],
): JourneyDecision[] {
  if (!patch) return [...current];
  // Later decisions for the same journey win; catalogue order is preserved.
  const merged = new Map<JourneyId, JourneyDecisionKind>(
    current.map((d) => [d.journeyId, d.decision]),
  );
  for (const { journeyId, decision } of patch) merged.set(journeyId, decision);
  return [...merged.entries()].map(([journeyId, decision]) => ({ journeyId, decision }));
}

/**
 * Apply a validated patch to the operator-owned inputs. Workflow metadata
 * (acknowledgement, writing selection) passes through untouched here; the
 * acknowledgement is pruned by `pruneStaleAcknowledgement` once the service
 * has recomputed the warning digest for the new inputs.
 */
export function applyPreparationPatch(
  current: ReportPreparation,
  patch: ReportPreparationPatch,
  now: string,
): ReportPreparation {
  // Optional chaining throughout: a preparation read back from persistence
  // can lack keys whose subdocuments were empty when stored.
  const situation =
    patch.context?.situation === undefined
      ? current.context?.situation
      : (patch.context.situation ?? undefined);
  const trigger =
    patch.context?.trigger === undefined
      ? current.context?.trigger
      : (patch.context.trigger ?? undefined);
  const triggerOther = applyLocalizedText(
    current.context?.triggerOther,
    patch.context?.triggerOther,
  );
  const customCoverQuestion = applyLocalizedText(
    current.customCoverQuestion,
    patch.customCoverQuestion,
  );

  const stakeholders: Partial<Record<ReportStakeholderRole, string>> = {
    ...(current.stakeholders ?? {}),
  };
  for (const role of REPORT_STAKEHOLDER_ROLES) {
    const value = patch.stakeholders?.[role];
    if (value === undefined) continue;
    if (value === null) delete stakeholders[role];
    else stakeholders[role] = value;
  }

  return {
    context: {
      ...(situation !== undefined ? { situation } : {}),
      ...(trigger !== undefined ? { trigger } : {}),
      ...(triggerOther !== undefined ? { triggerOther } : {}),
    },
    ...(customCoverQuestion !== undefined ? { customCoverQuestion } : {}),
    stakeholders,
    journeyDecisions: applyJourneyDecisions(current.journeyDecisions ?? [], patch.journeyDecisions),
    ...(current.warningAcknowledgement
      ? { warningAcknowledgement: current.warningAcknowledgement }
      : {}),
    ...(current.writingSelection ? { writingSelection: current.writingSelection } : {}),
    updatedAt: now,
  };
}

/**
 * Drop the warning acknowledgement when it no longer matches the digest of
 * the current inputs. Confirmation is remembered only while the
 * warning-relevant input has not changed.
 */
export function pruneStaleAcknowledgement(
  preparation: ReportPreparation,
  currentDigest: string,
): ReportPreparation {
  const acknowledgement = preparation.warningAcknowledgement;
  if (!acknowledgement || acknowledgement.digest === currentDigest) return preparation;
  const { warningAcknowledgement: _dropped, ...rest } = preparation;
  return { ...rest };
}
