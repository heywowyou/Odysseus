import { describe, expect, it } from 'vitest';
import { buildWarningDigest, computeMissingContextWarnings } from './warning-digest.js';

const baseInput = {
  commercialName: 'Hôtel Belledonne',
  customCoverQuestion: { fr: 'Question', en: 'Question' },
};

describe('buildWarningDigest', () => {
  it('is stable for identical inputs regardless of key order', () => {
    const first = buildWarningDigest(baseInput);
    const second = buildWarningDigest({
      customCoverQuestion: baseInput.customCoverQuestion,
      commercialName: baseInput.commercialName,
    });
    expect(first).toBe(second);
    expect(first).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('changes when the commercial name changes', () => {
    expect(buildWarningDigest({ ...baseInput, commercialName: 'Autre' })).not.toBe(
      buildWarningDigest(baseInput),
    );
  });

  it('changes when a custom question changes in one language only', () => {
    const digest = buildWarningDigest(baseInput);
    expect(
      buildWarningDigest({ ...baseInput, customCoverQuestion: { fr: 'Question', en: 'Changed' } }),
    ).not.toBe(digest);
  });
});

describe('computeMissingContextWarnings', () => {
  it('warns about the commercial name when it is not set', () => {
    expect(computeMissingContextWarnings({})).toEqual(['commercial-name']);
  });

  it('warns about nothing when the commercial name is set', () => {
    expect(computeMissingContextWarnings(baseInput)).toEqual([]);
  });
});
