import { describe, expect, it } from 'vitest';
import { buildWarningDigest, computeMissingContextWarnings } from './warning-digest.js';

const baseInput = {
  commercialName: 'Hôtel Belledonne',
  situation: 'corrections-underway' as const,
  trigger: 'legal-question' as const,
  triggerOther: { fr: 'Note fr' },
  customCoverQuestion: { fr: 'Question', en: 'Question' },
  confirmedJourneyIds: ['discovery-navigation' as const],
};

describe('buildWarningDigest', () => {
  it('is stable for identical inputs regardless of key order', () => {
    const first = buildWarningDigest(baseInput);
    const second = buildWarningDigest({ ...baseInput });
    expect(first).toBe(second);
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('changes when the commercial name changes', () => {
    expect(buildWarningDigest({ ...baseInput, commercialName: 'Autre' })).not.toBe(
      buildWarningDigest(baseInput),
    );
  });

  it('changes when the situation, trigger, or notes change', () => {
    const digest = buildWarningDigest(baseInput);
    expect(buildWarningDigest({ ...baseInput, situation: 'periodic-review' })).not.toBe(digest);
    expect(buildWarningDigest({ ...baseInput, trigger: 'redesign' })).not.toBe(digest);
    expect(buildWarningDigest({ ...baseInput, triggerOther: { fr: 'Autre note' } })).not.toBe(
      digest,
    );
  });

  it('changes when a custom question changes in one language only', () => {
    const digest = buildWarningDigest(baseInput);
    expect(
      buildWarningDigest({ ...baseInput, customCoverQuestion: { fr: 'Question', en: 'Changed' } }),
    ).not.toBe(digest);
  });

  it('changes when the resolved journey scope changes', () => {
    const digest = buildWarningDigest(baseInput);
    expect(buildWarningDigest({ ...baseInput, confirmedJourneyIds: [] })).not.toBe(digest);
    expect(
      buildWarningDigest({
        ...baseInput,
        confirmedJourneyIds: ['discovery-navigation', 'transaction-booking'],
      }),
    ).not.toBe(digest);
  });

  it('is order-insensitive over the journey scope', () => {
    expect(
      buildWarningDigest({
        ...baseInput,
        confirmedJourneyIds: ['transaction-booking', 'discovery-navigation'],
      }),
    ).toBe(
      buildWarningDigest({
        ...baseInput,
        confirmedJourneyIds: ['discovery-navigation', 'transaction-booking'],
      }),
    );
  });
});

describe('computeMissingContextWarnings', () => {
  it('warns about everything when nothing is set', () => {
    expect(computeMissingContextWarnings({ confirmedJourneyIds: [] })).toEqual([
      'commercial-name',
      'situation',
      'trigger',
      'journey-scope',
    ]);
  });

  it('warns about nothing when all warning-relevant inputs are set', () => {
    expect(computeMissingContextWarnings(baseInput)).toEqual([]);
  });

  it('treats a deliberate unknown situation as answered, not missing', () => {
    const warnings = computeMissingContextWarnings({ ...baseInput, situation: 'unknown' });
    expect(warnings).toEqual([]);
  });

  it('ignores stakeholder names entirely', () => {
    expect(computeMissingContextWarnings(baseInput)).toEqual(
      computeMissingContextWarnings(baseInput),
    );
  });
});
