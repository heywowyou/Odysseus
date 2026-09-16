/**
 * Pure model for the Prepare report card (plan 019): everything the route
 * component renders or sends is computed here so it stays unit-testable
 * without a component tree, the same split as the other dashboard routes.
 */

import type { PreparationViewResponse } from './prepare-report-types';

/** One editable form value per operator input; '' means "not set", which
 *  the patch builder must never send for unchanged fields (an absent key
 *  leaves the stored value untouched, matching the server's merge
 *  semantics). */
export interface PreparationFormValues {
  customQuestionFr: string;
  customQuestionEn: string;
}

export function formValuesFromView(view: PreparationViewResponse): PreparationFormValues {
  const { preparation } = view;
  return {
    customQuestionFr: preparation.customCoverQuestion?.fr ?? '',
    customQuestionEn: preparation.customCoverQuestion?.en ?? '',
  };
}

function localizedFieldPatch(current: string, baseline: string): string | null | undefined {
  if (current === baseline) return undefined;
  return current === '' ? null : current;
}

/** Builds the PATCH body from the form against the baseline the form was
 *  seeded from. Per language: unchanged is absent, an actual value sets it,
 *  and a previously set value cleared to '' sends null (explicit clear). An
 *  empty result means "nothing to save" and the caller skips the request. */
export function buildPreparationPatch(
  values: PreparationFormValues,
  baseline: PreparationFormValues,
): Record<string, unknown> {
  const fr = localizedFieldPatch(values.customQuestionFr, baseline.customQuestionFr);
  const en = localizedFieldPatch(values.customQuestionEn, baseline.customQuestionEn);
  if (fr === undefined && en === undefined) return {};
  return {
    customCoverQuestion: {
      ...(fr !== undefined ? { fr } : {}),
      ...(en !== undefined ? { en } : {}),
    },
  };
}
