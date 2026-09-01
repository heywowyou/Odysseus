/**
 * Pure model for the Prepare report card (plan 019): everything the route
 * component renders or sends is computed here so it stays unit-testable
 * without a component tree, the same split as the other dashboard routes.
 */

import type {
  JourneyDecisionKind,
  JourneyVocab,
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
}

export function formValuesFromView(view: PreparationViewResponse): PreparationFormValues {
  const { preparation } = view;
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

  return patch;
}

/**
 * True when any warning-relevant input changed since the stored warning
 * acknowledgement was recorded. Stakeholder names deliberately do not
 * count (they never enter the digest), so filling a name never invalidates
 * a confirmation.
 */
export function warningRelevantInputsChanged(
  values: PreparationFormValues,
  acknowledgedBaseline: PreparationFormValues,
): boolean {
  return (
    values.situation !== acknowledgedBaseline.situation ||
    values.trigger !== acknowledgedBaseline.trigger ||
    values.triggerOtherFr !== acknowledgedBaseline.triggerOtherFr ||
    values.triggerOtherEn !== acknowledgedBaseline.triggerOtherEn ||
    values.customQuestionFr !== acknowledgedBaseline.customQuestionFr ||
    values.customQuestionEn !== acknowledgedBaseline.customQuestionEn ||
    (Object.keys(values.journeyDecisions) as JourneyVocab[]).some(
      (journeyId) =>
        values.journeyDecisions[journeyId] !== acknowledgedBaseline.journeyDecisions[journeyId],
    )
  );
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
