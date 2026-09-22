import { describe, expect, it } from 'vitest';
import {
  extractCustomCandidates,
  isOverseasFrenchDomain,
  LCEN_MENTIONS_LEGALES_RULE_ID,
} from './normalize-custom.js';

describe('extractCustomCandidates (LCEN mentions-legales)', () => {
  it('emits nothing when a SIREN was found', () => {
    expect(
      extractCustomCandidates({
        pageUrl: 'https://example.com/mentions-legales',
        siren: '732829320',
      }),
    ).toEqual([]);
  });

  it('leaves LCEN absence on overseas domains for a manual jurisdiction check', () => {
    expect(isOverseasFrenchDomain('https://www.example.nc/mentions-legales')).toBe(true);
    expect(extractCustomCandidates({ pageUrl: 'https://www.example.nc/mentions-legales' })).toEqual(
      [],
    );
    expect(isOverseasFrenchDomain('https://example.fr/mentions-legales')).toBe(false);
  });

  it('emits nothing when only an RCS or TVA number was found', () => {
    expect(
      extractCustomCandidates({
        pageUrl: 'https://example.com/mentions-legales',
        rcs: 'Paris 732829320',
      }),
    ).toEqual([]);
    expect(
      extractCustomCandidates({
        pageUrl: 'https://example.com/mentions-legales',
        tva: 'FR12345678901',
      }),
    ).toEqual([]);
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

  it('names the checked page in the description (plan 036)', () => {
    const candidates = extractCustomCandidates({ pageUrl: 'https://example.com/mentions-legales' });
    expect(candidates[0]?.description).toContain('https://example.com/mentions-legales');
  });

  it('carries the full article 1-1 field-presence table, all null with zero widening (plan 036)', () => {
    const candidates = extractCustomCandidates({ pageUrl: 'https://example.com/mentions-legales' });
    const evidence = candidates[0]?.rawEvidenceForPage as {
      siren: string | null;
      rcs: string | null;
      tva: string | null;
      articleOneOneFields: { field: string; value: string | null }[];
      checkedPages: unknown;
    };
    expect(evidence.siren).toBeNull();
    expect(evidence.rcs).toBeNull();
    expect(evidence.tva).toBeNull();
    expect(evidence.articleOneOneFields).toHaveLength(17);
    expect(evidence.articleOneOneFields.every((entry) => entry.value === null)).toBe(true);
    expect(evidence.checkedPages).toBeNull();
  });

  it('carries the checked-page list in evidence when supplied (plan 036)', () => {
    const candidates = extractCustomCandidates({
      pageUrl: 'https://example.com/mentions-legales',
      checkedPages: {
        resolvedUrl: 'https://example.com/mentions-legales',
        homepageFallback: false,
        searchedUrls: ['https://example.com/', 'https://example.com/mentions-legales'],
      },
    });
    const evidence = candidates[0]?.rawEvidenceForPage as { checkedPages: unknown };
    expect(evidence.checkedPages).toEqual({
      resolvedUrl: 'https://example.com/mentions-legales',
      homepageFallback: false,
      searchedUrls: ['https://example.com/', 'https://example.com/mentions-legales'],
    });
  });
});
