import { describe, expect, it } from 'vitest';
import {
  extractFormErrorHandlingCandidates,
  FORM_ERROR_NOT_ASSOCIATED_RULE_ID,
  type FormErrorHandlingCheckInput,
} from './normalize-form-error-handling.js';

const PAGE_URL = 'https://example.com/';

function baseField(overrides: Partial<FormErrorHandlingCheckInput['forms'][number]['fields'][number]> = {}) {
  return {
    selector: 'input[name="email"]',
    visuallyChanged: true,
    ariaInvalidTrue: false,
    hasAssociatedErrorText: false,
    hasAlertRegionInForm: false,
    ...overrides,
  };
}

function inputWithFields(fields: FormErrorHandlingCheckInput['forms'][number]['fields']): FormErrorHandlingCheckInput {
  return { pageUrl: PAGE_URL, forms: [{ formSelector: '#newsletter', fields }] };
}

describe('form-error-not-associated', () => {
  it('fires when the field visibly changed but has no programmatic association', () => {
    const candidates = extractFormErrorHandlingCandidates(inputWithFields([baseField()]));
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.ruleId).toBe(FORM_ERROR_NOT_ASSOCIATED_RULE_ID);
    expect(candidates[0]?.category).toBe('accessibility');
    expect(candidates[0]?.severity).toBe('serious');
    expect(candidates[0]?.element?.selector).toBe('#newsletter input[name="email"]');
  });

  it('does not fire when aria-invalid="true" is set', () => {
    expect(
      extractFormErrorHandlingCandidates(inputWithFields([baseField({ ariaInvalidTrue: true })])),
    ).toEqual([]);
  });

  it('does not fire when aria-describedby points to real error text', () => {
    expect(
      extractFormErrorHandlingCandidates(inputWithFields([baseField({ hasAssociatedErrorText: true })])),
    ).toEqual([]);
  });

  it('does not fire when a role=alert / aria-live region exists in the form', () => {
    expect(
      extractFormErrorHandlingCandidates(inputWithFields([baseField({ hasAlertRegionInForm: true })])),
    ).toEqual([]);
  });

  it('does not fire when nothing visibly changed - no evidence an error was shown at all', () => {
    expect(
      extractFormErrorHandlingCandidates(inputWithFields([baseField({ visuallyChanged: false })])),
    ).toEqual([]);
  });

  it('handles multiple forms and multiple fields independently', () => {
    const input: FormErrorHandlingCheckInput = {
      pageUrl: PAGE_URL,
      forms: [
        { formSelector: '#a', fields: [baseField({ selector: 'input[name="x"]' })] },
        {
          formSelector: '#b',
          fields: [
            baseField({ selector: 'input[name="y"]', ariaInvalidTrue: true }),
            baseField({ selector: 'input[name="z"]' }),
          ],
        },
      ],
    };
    const candidates = extractFormErrorHandlingCandidates(input);
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.element?.selector)).toEqual(['#a input[name="x"]', '#b input[name="z"]']);
  });
});
