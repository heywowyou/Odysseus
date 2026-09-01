import type { AuditManifest } from '../types/manifest.js';
import type { ReportLanguage } from '../types/llm-output.js';
import type { Finding } from '../types/findings.js';
import { resolveHookFamily } from './hook-family.js';
import {
  resolveConfirmedJourneys,
  suggestJourneys,
  type JourneyEvidence,
  type JourneyExclusionReason,
  type ResolvedJourney,
} from './journeys.js';
import type { ReportPreparation } from './preparation.js';
import { resolveEffectiveTurnover, type EffectiveTurnover } from './turnover.js';
import {
  HOOK_FAMILY_COPY,
  JOURNEY_COPY,
  JOURNEY_STEP_STATE_COPY,
  REPORT_STAKEHOLDER_ROLES,
  SITUATION_QUESTION_COPY,
  STAKEHOLDER_ROLE_COPY,
  resolveGenericDecisionQuestion,
  type BilingualCopy,
  type HookFamily,
  type JourneyId,
  type JourneyStepState,
  type ReportStakeholderRole,
} from './vocabulary.js';
import {
  computeMissingContextWarnings,
  buildWarningDigest,
  type MissingContextField,
  type WarningDigestInput,
} from './warning-digest.js';

/**
 * The preparation preview, plan 019 step 4: a bounded, render-ready view of
 * what personalization will do, per language, saying which values are
 * custom, automatic, or generic fallbacks and why. It contains final
 * strings and typed states only, never prompts and never persistence
 * documents. Rendering escapes these values; nothing here is HTML.
 */

export type PreviewValueSource = 'custom' | 'automatic' | 'fallback';

export interface PreviewQuestion {
  value: string;
  source: PreviewValueSource;
}

export interface PreviewHook {
  family: HookFamily;
  value: string;
  /** True when no findings evidence was available, so `mixed` copy is used
   *  as a fallback rather than as a measured conclusion. */
  evidenceUnavailable: boolean;
}

export interface PreviewStakeholder {
  role: ReportStakeholderRole;
  roleLabel: string;
  name: string;
}

export interface PreviewJourneyStep {
  stepId: string;
  label: string;
  description: string;
  state: JourneyStepState;
  stateLabel: string;
  notEvaluatedReason?: string;
}

export interface PreviewJourney {
  journeyId: string;
  label: string;
  description: string;
  steps: readonly PreviewJourneyStep[];
}

export interface PreviewExcludedJourney {
  journeyId: string;
  reason: JourneyExclusionReason;
}

export interface PreparationPreviewLanguage {
  language: ReportLanguage;
  coverQuestion: PreviewQuestion;
  hook: PreviewHook;
  stakeholders: readonly PreviewStakeholder[];
  journeys: readonly PreviewJourney[];
}

export interface ReportPreparationPreview {
  fr: PreparationPreviewLanguage;
  en: PreparationPreviewLanguage;
  /** Warning-relevant inputs currently missing; generation warns on these. */
  warnings: readonly MissingContextField[];
  warningDigest: string;
  excludedJourneys: readonly PreviewExcludedJourney[];
  /** Operator-only effective basis. Client report rendering receives no
   *  placeholder or estimate from this preparation preview. */
  turnover: EffectiveTurnover;
}

export interface BuildPreviewInput {
  preparation: ReportPreparation;
  /** The confirmed commercial name, when manual fields carry one. */
  commercialName?: string | undefined;
  /** On-disk artifacts; absent means journeys and the hook have no evidence. */
  manifest?: AuditManifest;
  findings?: readonly Finding[];
}

function localized(pick: ReportLanguage, copy: BilingualCopy): string {
  return copy[pick];
}

function resolveQuestion(pick: ReportLanguage, preparation: ReportPreparation): PreviewQuestion {
  const custom = preparation.customCoverQuestion?.[pick];
  if (custom) return { value: custom, source: 'custom' };
  const situation = preparation.context.situation;
  const situational = situation ? SITUATION_QUESTION_COPY[situation]?.[pick] : undefined;
  if (situational) return { value: situational, source: 'automatic' };
  return { value: resolveGenericDecisionQuestion(pick), source: 'fallback' };
}

function toPreviewJourney(pick: ReportLanguage, journey: ResolvedJourney): PreviewJourney {
  const copy = JOURNEY_COPY[journey.journeyId];
  return {
    journeyId: journey.journeyId,
    label: localized(pick, copy.label),
    description: localized(pick, copy.description),
    steps: journey.steps.map((step) => {
      const stepCopy = copy.steps.find((entry) => entry.stepId === step.stepId);
      if (!stepCopy) {
        throw new Error(`missing journey step copy: ${journey.journeyId}/${step.stepId}`);
      }
      return {
        stepId: step.stepId,
        label: localized(pick, stepCopy.label),
        description: localized(pick, stepCopy.description),
        state: step.state,
        stateLabel: localized(pick, JOURNEY_STEP_STATE_COPY[step.state]),
        ...(step.notEvaluatedReason ? { notEvaluatedReason: step.notEvaluatedReason } : {}),
      };
    }),
  };
}

function warningDigestInput(
  input: BuildPreviewInput,
  confirmedJourneyIds: readonly JourneyId[],
): WarningDigestInput {
  return {
    commercialName: input.commercialName,
    situation: input.preparation.context.situation,
    trigger: input.preparation.context.trigger,
    triggerOther: input.preparation.context.triggerOther,
    customCoverQuestion: input.preparation.customCoverQuestion,
    confirmedJourneyIds,
  };
}

export function buildReportPreparationPreview(input: BuildPreviewInput): ReportPreparationPreview {
  const { preparation } = input;
  const evidence: JourneyEvidence | null =
    input.manifest && input.findings
      ? { manifest: input.manifest, findings: input.findings }
      : null;

  const hookResolution = input.findings ? resolveHookFamily(input.findings) : null;
  const family: HookFamily = hookResolution?.family ?? 'mixed';
  const confirmed = resolveConfirmedJourneys(evidence, preparation.journeyDecisions);
  const suggestions = suggestJourneys(evidence);
  const excludedJourneys: PreviewExcludedJourney[] = suggestions
    .filter(
      (suggestion): suggestion is Extract<typeof suggestion, { available: false }> =>
        !suggestion.available,
    )
    .map((suggestion) => ({ journeyId: suggestion.journeyId, reason: suggestion.reason }));

  const confirmedJourneyIds: JourneyId[] = confirmed.confirmed.map((journey) => journey.journeyId);
  const digestInput = warningDigestInput(input, confirmedJourneyIds);
  const warningDigest = buildWarningDigest(digestInput);
  const warnings = computeMissingContextWarnings(digestInput);

  const stakeholders: readonly { role: ReportStakeholderRole; name: string }[] =
    REPORT_STAKEHOLDER_ROLES.flatMap((role) => {
      const name = preparation.stakeholders[role];
      return name ? [{ role, name }] : [];
    });

  const buildLanguage = (pick: ReportLanguage): PreparationPreviewLanguage => ({
    language: pick,
    coverQuestion: resolveQuestion(pick, preparation),
    hook: {
      family,
      value: localized(pick, HOOK_FAMILY_COPY[family]),
      evidenceUnavailable: evidence === null,
    },
    stakeholders: stakeholders.map((entry) => ({
      ...entry,
      roleLabel: localized(pick, STAKEHOLDER_ROLE_COPY[entry.role]),
    })),
    journeys: confirmed.confirmed.map((journey) => toPreviewJourney(pick, journey)),
  });

  return {
    fr: buildLanguage('fr'),
    en: buildLanguage('en'),
    warnings,
    warningDigest,
    excludedJourneys,
    turnover: resolveEffectiveTurnover(preparation.turnover ?? { useReplacement: false }),
  };
}
