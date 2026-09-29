import { describe, expect, it } from 'vitest';
import {
  assessCurrentPair,
  auditLifecycle,
  deliverablePair,
  findingsProvenanceMatches,
  mayDeliver,
  wholeCurrentPair,
  type DeliverabilityReport,
  type DeliverabilitySelection,
} from './deliverability.js';

const provenance = {
  findingsSchemaVersion: 1 as const,
  normalizationFingerprint: 'fingerprint-current',
  findingsDigest: 'digest-current',
};
const stale = { ...provenance, findingsDigest: 'digest-before' };

const selection: DeliverabilitySelection = {
  kind: 'selected',
  fr: { analysisId: 'analysis-fr', findingsProvenance: provenance },
  en: { analysisId: 'analysis-en', findingsProvenance: provenance },
};
const frenchOnly: DeliverabilitySelection = { kind: 'selected', fr: selection.fr };

function report(language: 'fr' | 'en', extra: Partial<DeliverabilityReport> = {}) {
  return {
    reportId: `report-${language}`,
    analysisId: `analysis-${language}`,
    findingsProvenance: provenance,
    pdfDigest: `sha256:${language}`,
    ...extra,
  };
}

const assess = (fr: DeliverabilityReport | null, en: DeliverabilityReport | null = null) =>
  assessCurrentPair({ auditFindings: provenance, selection, fr, en });

describe('findingsProvenanceMatches (issue #567)', () => {
  it('fails closed on a missing record or digest, even on both sides', () => {
    expect(findingsProvenanceMatches(provenance, { ...provenance })).toBe(true);
    expect(findingsProvenanceMatches(undefined, undefined)).toBe(false);
    expect(findingsProvenanceMatches({}, {})).toBe(false);
    expect(findingsProvenanceMatches(provenance, stale)).toBe(false);
  });
});

describe('assessCurrentPair (issue #567)', () => {
  it('is current when the selected pair and its reports carry the audit findings', () => {
    const verdict = assess(report('fr'), report('en'));
    expect(verdict).toMatchObject({ current: true, english: { state: 'current' } });
    expect(wholeCurrentPair(verdict)).toEqual({ fr: report('fr'), en: report('en') });
  });

  it('is never current without provenance on both sides', () => {
    expect(
      assessCurrentPair({ auditFindings: undefined, selection, fr: report('fr'), en: null }),
    ).toEqual({ current: false, reason: 'audit-unstamped' });
    const unstampedReport = { reportId: 'report-fr', analysisId: 'analysis-fr' };
    expect(assess(unstampedReport)).toEqual({ current: false, reason: 'report-stale' });
  });

  it('names why French is not current', () => {
    expect(assess(report('fr', { findingsProvenance: stale }))).toEqual({
      current: false,
      reason: 'report-stale',
    });
    expect(assess(report('fr', { analysisId: 'analysis-older' }))).toEqual({
      current: false,
      reason: 'report-not-selected',
    });
    expect(assess(null)).toEqual({ current: false, reason: 'missing-report' });
    expect(
      assessCurrentPair({
        auditFindings: provenance,
        selection: { kind: 'none' },
        fr: report('fr'),
        en: null,
      }),
    ).toEqual({ current: false, reason: 'no-selection' });
    expect(
      assessCurrentPair({
        auditFindings: provenance,
        selection: {
          kind: 'selected',
          fr: { analysisId: 'analysis-fr', findingsProvenance: stale },
        },
        fr: report('fr'),
        en: null,
      }),
    ).toEqual({ current: false, reason: 'selection-stale' });
  });

  it('keeps French current when a selected English report is not, but not the whole pair', () => {
    const verdict = assess(report('fr'), report('en', { findingsProvenance: stale }));
    expect(verdict).toMatchObject({
      current: true,
      english: { state: 'not-current', reason: 'report-stale' },
    });
    expect(wholeCurrentPair(verdict)).toBeUndefined();
  });

  it('ignores an English report the selection does not carry', () => {
    const verdict = assessCurrentPair({
      auditFindings: provenance,
      selection: frenchOnly,
      fr: report('fr'),
      en: report('en', { findingsProvenance: stale }),
    });
    expect(wholeCurrentPair(verdict)).toEqual({ fr: report('fr') });
  });
});

describe('deliverablePair (issue #567)', () => {
  it('is current but not deliverable when a PDF digest does not match', async () => {
    const verdict = assess(report('fr'), report('en'));
    await expect(deliverablePair(verdict, async () => true)).resolves.toEqual({
      fr: report('fr'),
      en: report('en'),
    });
    await expect(
      deliverablePair(verdict, async (_report, language) => language === 'fr'),
    ).resolves.toBeUndefined();
  });

  it('requires a report identity', async () => {
    const { reportId: _omitted, ...withoutId } = report('fr');
    const verdict = assess(withoutId, report('en'));
    await expect(deliverablePair(verdict, async () => true)).resolves.toBeUndefined();
  });
});

describe('auditLifecycle (issue #567)', () => {
  const approval = {
    fr: { reportId: 'report-fr', pdfDigest: 'sha256:fr' },
    en: { reportId: 'report-en', pdfDigest: 'sha256:en' },
  };
  const deliverable = { fr: report('fr'), en: report('en') };

  it('moves from scanned to approved', () => {
    const base = { auditFindings: provenance, approval: null };
    expect(auditLifecycle({ ...base, selection: { kind: 'none' }, deliverable: undefined })).toBe(
      'scanned',
    );
    expect(auditLifecycle({ ...base, selection, deliverable: undefined })).toBe('analysed');
    expect(auditLifecycle({ ...base, selection, deliverable })).toBe('rendered');
    expect(auditLifecycle({ ...base, selection, deliverable, approval })).toBe('approved');
  });
});

describe('mayDeliver (issue #567)', () => {
  const approval = {
    fr: { reportId: 'report-fr', pdfDigest: 'sha256:fr' },
    en: { reportId: 'report-en', pdfDigest: 'sha256:en' },
  };

  it('delivers an approved report of the selected pair', () => {
    expect(mayDeliver(assess(report('fr'), report('en')), approval, 'fr', 'dark')).toMatchObject({
      deliver: true,
    });
    expect(mayDeliver(assess(report('fr'), report('en')), approval, 'en', 'dark')).toMatchObject({
      deliver: true,
    });
  });

  it('refuses an approved report that is not from the selected analysis', () => {
    const verdict = assess(report('fr', { analysisId: 'analysis-older' }));
    expect(mayDeliver(verdict, approval, 'fr', 'dark')).toEqual({
      deliver: false,
      refusal: 'not-current',
    });
  });

  it('refuses English once the French report is no longer the approved one', () => {
    const verdict = assess(report('fr', { reportId: 'report-fr-2' }), report('en'));
    expect(mayDeliver(verdict, approval, 'fr', 'dark')).toEqual({
      deliver: false,
      refusal: 'not-approved',
    });
    expect(mayDeliver(verdict, approval, 'en', 'dark')).toEqual({
      deliver: false,
      refusal: 'not-approved',
    });
  });

  it('requires the light variant digest to be approved for a light delivery', () => {
    const verdict = assess(report('fr', { variants: { light: { pdfDigest: 'sha256:fr-l' } } }));
    expect(mayDeliver(verdict, approval, 'fr', 'light')).toEqual({
      deliver: false,
      refusal: 'not-approved',
    });
  });
});
