/**
 * Milestone 8 (extended accessibility pass): violation judgment for
 * form-error-not-associated. Same scanner-extracts/core-decides split as
 * every other custom check - see form-error-handling.ts for the safety
 * reasoning behind how the raw facts were gathered.
 *
 * Only fires when there is positive evidence an error was shown at all
 * (the field's own computed style changed after triggering validation)
 * but none of the three ways that change could be programmatically
 * exposed are present. A field that shows no visible change either is
 * not flagged - this could mean server-round-trip-only validation, a
 * validator that did not fire, or several other explanations this check
 * cannot distinguish between, and per this codebase's "prefer
 * undetermined over a confident wrong answer" principle, it does not
 * guess which.
 */

import type { FindingCandidate } from './candidate.js';
import { severityFromCustom } from './severity.js';

export const FORM_ERROR_NOT_ASSOCIATED_RULE_ID = 'form-error-not-associated';

export interface FormFieldCheckInput {
  selector: string;
  visuallyChanged: boolean;
  ariaInvalidTrue: boolean;
  hasAssociatedErrorText: boolean;
  hasAlertRegionInForm: boolean;
  /** Fails the browser's own constraint validation in a form without
   *  novalidate, so the browser announces the error itself. Absent on
   *  scans made before it was recorded. */
  nativelyInvalid?: boolean;
}

export interface FormCheckInput {
  formSelector: string;
  fields: FormFieldCheckInput[];
}

export interface FormErrorHandlingCheckInput {
  pageUrl: string;
  forms: FormCheckInput[];
}

export function extractFormErrorHandlingCandidates(
  input: FormErrorHandlingCheckInput,
): FindingCandidate[] {
  const candidates: FindingCandidate[] = [];

  for (const form of input.forms) {
    for (const field of form.fields) {
      // A native validation error is exposed and announced by the browser
      // itself: a newsletter field marked required showed a red border, and
      // the finding said screen readers were never told, which was false.
      const isProgrammaticallyAssociated =
        field.ariaInvalidTrue ||
        field.hasAssociatedErrorText ||
        field.hasAlertRegionInForm ||
        field.nativelyInvalid === true;
      if (!field.visuallyChanged || isProgrammaticallyAssociated) continue;

      candidates.push({
        source: 'custom',
        ruleId: FORM_ERROR_NOT_ASSOCIATED_RULE_ID,
        category: 'accessibility',
        severity: severityFromCustom(FORM_ERROR_NOT_ASSOCIATED_RULE_ID),
        wcagCriteria: ['3.3.1', '4.1.2'],
        title: 'Form validation error is only shown visually',
        description:
          'Submitting this required field empty visibly changed its appearance (e.g. a red border), but the field has no aria-invalid="true", no aria-describedby pointing to visible error text, and no role="alert" or aria-live region in the form. Screen reader users have no way to know the field failed validation or why.',
        pageUrl: input.pageUrl,
        element: {
          pageUrl: input.pageUrl,
          selector: `${form.formSelector} ${field.selector}`,
          snippet: '',
        },
        rawEvidenceForPage: {
          formSelector: form.formSelector,
          ariaInvalidTrue: field.ariaInvalidTrue,
          hasAssociatedErrorText: field.hasAssociatedErrorText,
          hasAlertRegionInForm: field.hasAlertRegionInForm,
        },
      });
    }
  }

  return candidates;
}
