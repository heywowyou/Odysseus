import { describe, expect, it } from 'vitest';
import { CUSTOM_CHECK_SEVERITY } from './normalize/severity.js';
import { CUSTOM_RULE_CONFIRMATION, isUnconfirmedRule } from './rule-confirmation.js';

describe('custom rule confirmation registry', () => {
  it('takes a side on every custom rule, so a new one cannot ship unclassified', () => {
    expect(Object.keys(CUSTOM_RULE_CONFIRMATION).sort()).toEqual(
      Object.keys(CUSTOM_CHECK_SEVERITY).sort(),
    );
  });

  it('states a basis for every entry', () => {
    for (const [ruleId, entry] of Object.entries(CUSTOM_RULE_CONFIRMATION)) {
      expect(entry.basis.length, ruleId).toBeGreaterThan(30);
    }
  });

  it('never reads a vendor rule as unconfirmed', () => {
    expect(isUnconfirmedRule('color-contrast')).toBe(false);
    expect(isUnconfirmedRule('largest-contentful-paint')).toBe(false);
  });

  it('keeps focus-order-mismatch unconfirmed until a real finding is read after J3', () => {
    expect(isUnconfirmedRule('focus-order-mismatch')).toBe(true);
    expect(isUnconfirmedRule('keyboard-trap')).toBe(false);
  });
});
