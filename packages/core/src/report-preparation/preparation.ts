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
import { MANUAL_TURNOVER_SOURCES, type ManualTurnover, type TurnoverChoice } from './turnover.js';

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
    }
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
  turnover: TurnoverChoice;
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
    turnover: { useReplacement: false },
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

export const MIN_TURNOVER_YEAR = 2000;
export const MAX_TURNOVER_YEAR = 2026;
export const MAX_TURNOVER_EUR = 1_000_000_000_000;
export const MAX_TURNOVER_SOURCE_NOTE_LENGTH = 120;

const turnoverAmountSchema = z.number().int().positive().max(MAX_TURNOVER_EUR);
const turnoverYearSchema = z.number().int().min(MIN_TURNOVER_YEAR).max(MAX_TURNOVER_YEAR);
const manualTurnoverSourceSchema = z.enum(MANUAL_TURNOVER_SOURCES);
const turnoverSourceNoteSchema = boundedText(MAX_TURNOVER_SOURCE_NOTE_LENGTH);

const manualTurnoverBase = {
  year: turnoverYearSchema,
  source: manualTurnoverSourceSchema,
  sourceNote: turnoverSourceNoteSchema.optional(),
};

const manualTurnoverSchema = z
  .discriminatedUnion('kind', [
    z
      .object({ kind: z.literal('exact'), amountEur: turnoverAmountSchema, ...manualTurnoverBase })
      .strict(),
    z
      .object({
        kind: z.literal('range'),
        lowerEur: turnoverAmountSchema,
        upperEur: turnoverAmountSchema,
        ...manualTurnoverBase,
      })
      .strict(),
  ])
  .superRefine((value, ctx) => {
    if (value.kind === 'range' && value.lowerEur > value.upperEur) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['upperEur'],
        message: 'turnover range upper bound must be at least the lower bound',
      });
    }
    if (value.source === 'other-documented' && !value.sourceNote) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceNote'],
        message: 'other documented turnover sources require a note',
      });
    }
  });

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
    turnover: z
      .object({
        useReplacement: z.boolean().optional(),
        replacement: manualTurnoverSchema.nullable().optional(),
      })
      .strict()
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
 * (acknowledgement, writing selection) passes through untouched here.
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

  const currentTurnover = current.turnover ?? { useReplacement: false };
  const replacement: ManualTurnover | undefined =
    patch.turnover?.replacement === undefined
      ? currentTurnover.replacement
      : (patch.turnover.replacement ?? undefined);
  const turnover: TurnoverChoice = {
    ...(currentTurnover.detected ? { detected: currentTurnover.detected } : {}),
    ...(replacement ? { replacement } : {}),
    useReplacement: patch.turnover?.useReplacement ?? currentTurnover.useReplacement,
  };

  return {
    context: {
      ...(situation !== undefined ? { situation } : {}),
      ...(trigger !== undefined ? { trigger } : {}),
      ...(triggerOther !== undefined ? { triggerOther } : {}),
    },
    ...(customCoverQuestion !== undefined ? { customCoverQuestion } : {}),
    stakeholders,
    journeyDecisions: applyJourneyDecisions(current.journeyDecisions ?? [], patch.journeyDecisions),
    turnover,
    ...(current.warningAcknowledgement
      ? { warningAcknowledgement: current.warningAcknowledgement }
      : {}),
    ...(current.writingSelection ? { writingSelection: current.writingSelection } : {}),
    updatedAt: now,
  };
}
