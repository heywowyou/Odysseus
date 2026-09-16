import { describe, expect, it } from 'vitest';
import {
  NAP_PHONE_MISMATCH_RULE_ID,
  NAP_POSTAL_CODE_MISMATCH_RULE_ID,
  normalizeNapConsistency,
  type NapConsistencyCheckInput,
} from './normalize-nap-consistency.js';

const pageUrl = 'https://example.com/contact';

function input(overrides: Partial<NapConsistencyCheckInput> = {}): NapConsistencyCheckInput {
  return {
    structuredPhones: ['+33102030405'],
    visiblePhones: ['+33199999999'],
    structuredPostalCodes: ['75001'],
    visiblePostalCodes: ['69002'],
    phoneMismatch: false,
    postalCodeMismatch: false,
    ...overrides,
  };
}

describe('normalizeNapConsistency', () => {
  it('emits nothing when neither value mismatches', () => {
    expect(normalizeNapConsistency(input(), pageUrl)).toEqual([]);
  });

  it.each([
    [{ phoneMismatch: true }, [NAP_PHONE_MISMATCH_RULE_ID]],
    [{ postalCodeMismatch: true }, [NAP_POSTAL_CODE_MISMATCH_RULE_ID]],
    [
      { phoneMismatch: true, postalCodeMismatch: true },
      [NAP_PHONE_MISMATCH_RULE_ID, NAP_POSTAL_CODE_MISMATCH_RULE_ID],
    ],
  ])('emits the findings the mismatch flags name (%o)', (overrides, ruleIds) => {
    const candidates = normalizeNapConsistency(input(overrides), pageUrl);
    expect(candidates.map((candidate) => candidate.ruleId)).toEqual(ruleIds);
    for (const candidate of candidates) {
      expect(candidate.category).toBe('geo');
      expect(candidate.severity).toBe('moderate');
      expect(candidate.wcagCriteria).toEqual([]);
      expect(candidate.element).toBeNull();
      expect(candidate.pageUrl).toBe(pageUrl);
    }
  });

  it('names both sides of each contradiction in the description and evidence', () => {
    const [phone, postal] = normalizeNapConsistency(
      input({ phoneMismatch: true, postalCodeMismatch: true }),
      pageUrl,
    );
    expect(phone?.description).toContain('+33102030405');
    expect(phone?.description).toContain('+33199999999');
    expect(phone?.rawEvidenceForPage).toEqual({
      structuredPhones: ['+33102030405'],
      visiblePhones: ['+33199999999'],
    });
    expect(postal?.description).toContain('75001');
    expect(postal?.description).toContain('69002');
    expect(postal?.rawEvidenceForPage).toEqual({
      structuredPostalCodes: ['75001'],
      visiblePostalCodes: ['69002'],
    });
  });
});
