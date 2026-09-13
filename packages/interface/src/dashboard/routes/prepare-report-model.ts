/**
 * Pure model for the Prepare report card (plan 019): everything the route
 * component renders or sends is computed here so it stays unit-testable
 * without a component tree, the same split as the other dashboard routes.
 */

import type {
  JourneyDecisionKind,
  JourneyVocab,
  ManualTurnoverSourceResponse,
  PreparationViewResponse,
} from './prepare-report-types';

/** One editable form value per operator input; '' means "not set", which
 *  the patch builder must never send for unchanged fields (an absent key
 *  leaves the stored value untouched, matching the server's merge
 *  semantics). */
export interface PreparationFormValues {
  /** '' means "not set"; only closed-vocabulary values from the selects
   *  ever reach the server, which validates them again with Zod. */
  situation: string;
  trigger: string;
  triggerOtherFr: string;
  triggerOtherEn: string;
  customQuestionFr: string;
  customQuestionEn: string;
  stakeholderManagement: string;
  stakeholderTechnical: string;
  stakeholderCommunications: string;
  stakeholderLegal: string;
  journeyDecisions: Partial<Record<JourneyVocab, JourneyDecisionKind>>;
  turnoverUseReplacement: boolean;
  turnoverKind: 'exact' | 'range';
  turnoverAmountEur: string;
  turnoverLowerEur: string;
  turnoverUpperEur: string;
  turnoverYear: string;
  turnoverSource: '' | ManualTurnoverSourceResponse;
  turnoverSourceNote: string;
}

export type TurnoverFormPreview =
  | {
      status: 'available';
      amountEur: number;
      rangeUpperEur?: number;
      year: number;
      provenance: 'detected' | 'replacement';
      inputKind: 'exact' | 'range';
    }
  | { status: 'omitted'; reason: 'missing-turnover' | 'missing-replacement' };

function positiveInteger(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function resolveTurnoverFormPreview(
  values: PreparationFormValues,
  detected: { amountEur: number; year: number; source: 'sirene-api' } | undefined,
): TurnoverFormPreview {
  if (!values.turnoverUseReplacement) {
    return detected
      ? {
          status: 'available',
          amountEur: detected.amountEur,
          year: detected.year,
          provenance: 'detected',
          inputKind: 'exact',
        }
      : { status: 'omitted', reason: 'missing-turnover' };
  }

  const year = positiveInteger(values.turnoverYear);
  const sourceIsComplete =
    values.turnoverSource !== '' &&
    (values.turnoverSource !== 'other-documented' || values.turnoverSourceNote.trim() !== '');
  if (year === undefined || !sourceIsComplete) {
    return { status: 'omitted', reason: 'missing-replacement' };
  }

  if (values.turnoverKind === 'range') {
    const lowerEur = positiveInteger(values.turnoverLowerEur);
    const upperEur = positiveInteger(values.turnoverUpperEur);
    if (lowerEur === undefined || upperEur === undefined || lowerEur > upperEur) {
      return { status: 'omitted', reason: 'missing-replacement' };
    }
    return {
      status: 'available',
      amountEur: lowerEur,
      rangeUpperEur: upperEur,
      year,
      provenance: 'replacement',
      inputKind: 'range',
    };
  }

  const amountEur = positiveInteger(values.turnoverAmountEur);
  return amountEur === undefined
    ? { status: 'omitted', reason: 'missing-replacement' }
    : {
        status: 'available',
        amountEur,
        year,
        provenance: 'replacement',
        inputKind: 'exact',
      };
}

export function formValuesFromView(view: PreparationViewResponse): PreparationFormValues {
  const { preparation } = view;
  const turnover = preparation.turnover ?? { useReplacement: false };
  const replacement = turnover.replacement;
  return {
    situation: preparation.context.situation ?? '',
    trigger: preparation.context.trigger ?? '',
    triggerOtherFr: preparation.context.triggerOther?.fr ?? '',
    triggerOtherEn: preparation.context.triggerOther?.en ?? '',
    customQuestionFr: preparation.customCoverQuestion?.fr ?? '',
    customQuestionEn: preparation.customCoverQuestion?.en ?? '',
    stakeholderManagement: preparation.stakeholders.management ?? '',
    stakeholderTechnical: preparation.stakeholders.technical ?? '',
    stakeholderCommunications: preparation.stakeholders.communications ?? '',
    stakeholderLegal: preparation.stakeholders.legal ?? '',
    journeyDecisions: Object.fromEntries(
      preparation.journeyDecisions.map((decision) => [decision.journeyId, decision.decision]),
    ),
    turnoverUseReplacement: turnover.useReplacement,
    turnoverKind: replacement?.kind ?? 'exact',
    turnoverAmountEur: replacement?.kind === 'exact' ? replacement.amountEur.toString() : '',
    turnoverLowerEur: replacement?.kind === 'range' ? replacement.lowerEur.toString() : '',
    turnoverUpperEur: replacement?.kind === 'range' ? replacement.upperEur.toString() : '',
    turnoverYear: replacement?.year.toString() ?? '',
    turnoverSource: replacement?.source ?? '',
    turnoverSourceNote: replacement?.sourceNote ?? '',
  };
}

/** Localized text patch semantics per language: '' and unchanged are
 *  absent, an actual value sets it, and a previously set value cleared to
 *  '' sends null (explicit clear). */
function localizedPatch(
  currentFr: string,
  currentEn: string,
  baselineFr: string,
  baselineEn: string,
): { fr?: string | null; en?: string | null } | undefined {
  const fr = localizedFieldPatch(currentFr, baselineFr);
  const en = localizedFieldPatch(currentEn, baselineEn);
  if (fr === undefined && en === undefined) return undefined;
  return {
    ...(fr !== undefined ? { fr } : {}),
    ...(en !== undefined ? { en } : {}),
  };
}

function localizedFieldPatch(current: string, baseline: string): string | null | undefined {
  if (current === baseline) return undefined;
  return current === '' ? null : current;
}

/** Builds the PATCH body from the form against the baseline the form was
 *  seeded from. Only changed keys appear; stakeholder names are trimmed,
 *  and a name cleared to '' sends null. An empty result means "nothing to
 *  save" and the caller skips the request. */
export function buildPreparationPatch(
  values: PreparationFormValues,
  baseline: PreparationFormValues,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  const context: Record<string, unknown> = {};
  if (values.situation !== baseline.situation) {
    context['situation'] = values.situation === '' ? null : values.situation;
  }
  if (values.trigger !== baseline.trigger) {
    context['trigger'] = values.trigger === '' ? null : values.trigger;
  }
  const triggerOtherPatch = localizedPatch(
    values.triggerOtherFr,
    values.triggerOtherEn,
    baseline.triggerOtherFr,
    baseline.triggerOtherEn,
  );
  if (triggerOtherPatch !== undefined) context['triggerOther'] = triggerOtherPatch;
  if (Object.keys(context).length > 0) patch['context'] = context;

  const questionPatch = localizedPatch(
    values.customQuestionFr,
    values.customQuestionEn,
    baseline.customQuestionFr,
    baseline.customQuestionEn,
  );
  if (questionPatch !== undefined) patch['customCoverQuestion'] = questionPatch;

  const stakeholders: Record<string, string | null> = {};
  for (const [key, current, baselineValue] of [
    ['management', values.stakeholderManagement, baseline.stakeholderManagement],
    ['technical', values.stakeholderTechnical, baseline.stakeholderTechnical],
    ['communications', values.stakeholderCommunications, baseline.stakeholderCommunications],
    ['legal', values.stakeholderLegal, baseline.stakeholderLegal],
  ] as const) {
    const trimmed = current.trim();
    if (trimmed !== baselineValue.trim()) {
      stakeholders[key] = trimmed === '' ? null : trimmed;
    }
  }
  if (Object.keys(stakeholders).length > 0) patch['stakeholders'] = stakeholders;

  const journeysChanged = (Object.keys(values.journeyDecisions) as JourneyVocab[]).some(
    (journeyId) => values.journeyDecisions[journeyId] !== baseline.journeyDecisions[journeyId],
  );
  if (journeysChanged) {
    patch['journeyDecisions'] = (Object.keys(values.journeyDecisions) as JourneyVocab[])
      .filter(
        (journeyId) => values.journeyDecisions[journeyId] !== baseline.journeyDecisions[journeyId],
      )
      .map((journeyId) => ({ journeyId, decision: values.journeyDecisions[journeyId] }));
  }

  const turnoverFieldsChanged =
    values.turnoverKind !== baseline.turnoverKind ||
    values.turnoverAmountEur !== baseline.turnoverAmountEur ||
    values.turnoverLowerEur !== baseline.turnoverLowerEur ||
    values.turnoverUpperEur !== baseline.turnoverUpperEur ||
    values.turnoverYear !== baseline.turnoverYear ||
    values.turnoverSource !== baseline.turnoverSource ||
    values.turnoverSourceNote !== baseline.turnoverSourceNote;
  const turnoverPatch: Record<string, unknown> = {};
  if (values.turnoverUseReplacement !== baseline.turnoverUseReplacement) {
    turnoverPatch['useReplacement'] = values.turnoverUseReplacement;
  }
  if (
    turnoverFieldsChanged &&
    values.turnoverKind === 'exact' &&
    values.turnoverAmountEur !== '' &&
    values.turnoverYear !== '' &&
    values.turnoverSource !== ''
  ) {
    turnoverPatch['replacement'] = {
      kind: 'exact',
      amountEur: Number(values.turnoverAmountEur),
      year: Number(values.turnoverYear),
      source: values.turnoverSource,
      ...(values.turnoverSource === 'other-documented' && values.turnoverSourceNote.trim() !== ''
        ? { sourceNote: values.turnoverSourceNote.trim() }
        : {}),
    };
  } else if (
    turnoverFieldsChanged &&
    values.turnoverKind === 'range' &&
    values.turnoverLowerEur !== '' &&
    values.turnoverUpperEur !== '' &&
    values.turnoverYear !== '' &&
    values.turnoverSource !== ''
  ) {
    turnoverPatch['replacement'] = {
      kind: 'range',
      lowerEur: Number(values.turnoverLowerEur),
      upperEur: Number(values.turnoverUpperEur),
      year: Number(values.turnoverYear),
      source: values.turnoverSource,
      ...(values.turnoverSource === 'other-documented' && values.turnoverSourceNote.trim() !== ''
        ? { sourceNote: values.turnoverSourceNote.trim() }
        : {}),
    };
  }
  if (turnoverFieldsChanged && !('replacement' in turnoverPatch)) {
    turnoverPatch['replacement'] = null;
  }
  if (Object.keys(turnoverPatch).length > 0) patch['turnover'] = turnoverPatch;

  return patch;
}

/** Whether the trigger is `other`, which reveals the bounded notes fields. */
export function showsTriggerOtherNotes(trigger: string): boolean {
  return trigger === 'other';
}

/** The typed exclusion reason for a suggestion row, already localized. */
export function exclusionLabel(
  suggestion: PreparationViewResponse['suggestions'][number],
  labels: {
    exclusionNoVisitedPages: string;
    exclusionNoTransactionalFlow: string;
    exclusionNoTransactionalPageVisited: string;
    exclusionEvidenceUnavailable: string;
  },
): string {
  if (suggestion.available) return '';
  switch (suggestion.reason) {
    case 'no-visited-pages':
      return labels.exclusionNoVisitedPages;
    case 'no-transactional-flow':
      return labels.exclusionNoTransactionalFlow;
    case 'no-transactional-page-visited':
      return labels.exclusionNoTransactionalPageVisited;
    case 'evidence-unavailable':
      return labels.exclusionEvidenceUnavailable;
  }
}
