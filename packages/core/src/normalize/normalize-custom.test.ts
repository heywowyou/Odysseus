import { describe, expect, it } from 'vitest';
import { extractCustomCandidates, LCEN_MENTIONS_LEGALES_RULE_ID } from './normalize-custom.js';

describe('extractCustomCandidates (LCEN mentions-legales)', () => {
  it('emits nothing when a SIREN was found', () => {
    expect(extractCustomCandidates({ pageUrl: 'https://example.com/mentions-legales', siren: '732829320' })).toEqual(
      [],
    );
  });

  it('emits nothing when only an RCS or TVA number was found', () => {
    expect(extractCustomCandidates({ pageUrl: 'https://example.com/mentions-legales', rcs: 'Paris 732829320' })).toEqual(
      [],
    );
    expect(extractCustomCandidates({ pageUrl: 'https://example.com/mentions-legales', tva: 'FR12345678901' })).toEqual(
      [],
    );
  });

  it('emits one page-scoped candidate when none of siren/rcs/tva are found', () => {
    const candidates = extractCustomCandidates({ pageUrl: 'https://example.com/mentions-legales' });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.source).toBe('custom');
    expect(candidates[0]?.ruleId).toBe(LCEN_MENTIONS_LEGALES_RULE_ID);
    expect(candidates[0]?.category).toBe('seo');
    expect(candidates[0]?.severity).toBe('serious');
    expect(candidates[0]?.element).toBeNull();
  });
});
