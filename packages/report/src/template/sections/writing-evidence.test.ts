import { describe, expect, it } from 'vitest';
import type { AuditManifest, EvidenceLimitation, Finding } from '@odysseus/core';
import { remediationFor } from '../remediation/index.js';
import {
  buildTrustedRemediationsByTheme,
  buildWritingPerformanceEvidence,
} from './writing-evidence.js';

function measuredPage(
  url: string,
  lcp: number,
  cls: number,
  tbt = 100,
): AuditManifest['pages'][number] {
  return {
    url,
    depth: 0,
    status: 'visited',
    errors: {},
    coreWebVitals: {
      lcp: { score: null, numericValue: lcp, displayValue: null },
      cls: { score: null, numericValue: cls, displayValue: null },
      tbt: { score: null, numericValue: tbt, displayValue: null },
      fcp: { score: null, numericValue: 1000, displayValue: null },
      speedIndex: { score: null, numericValue: 1500, displayValue: null },
    },
  } as AuditManifest['pages'][number];
}

describe('Plan 067 writing evidence', () => {
  it('prevents the Villas Foch class: good real-user LCP cannot outrank weak field CLS because of anomalous lab LCP', () => {
    const manifest = {
      pages: [
        measuredPage('https://www.villasfoch.fr/', 20_000, 0.02),
        measuredPage('https://www.villasfoch.fr/chambres', 21_000, 0.03),
      ],
      cruxFieldData: {
        available: true,
        // Good field LCP: this is the key fact the old lab-only signal ignored.
        lcp: { p75: 2_400 },
        // Weak field CLS: this is the recommendation-worthy real-user metric.
        cls: { p75: 0.18 },
        inp: { p75: 180 },
      },
    } as AuditManifest;

    const evidence = buildWritingPerformanceEvidence(manifest);

    expect(evidence.suppressedLabRecommendations).toContain('lcp');
    expect(evidence.discordances).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: expect.objectContaining({ metric: 'lcp', source: 'field', rating: 'good' }),
          lab: expect.objectContaining({ metric: 'lcp', source: 'lab', rating: 'poor' }),
          labNonRepresentativeForRecommendations: true,
        }),
      ]),
    );
    expect(evidence.primaryConcern).toMatchObject({
      metric: 'cls',
      source: 'field',
      rating: 'mid',
    });
    expect(evidence.primaryConcern?.metric).not.toBe('lcp');
  });

  it('does not turn unavailable Lighthouse evidence into a measured priority', () => {
    const manifest = {
      pages: [measuredPage('https://example.com/', 9_000, 0.3, 800)],
      cruxFieldData: { available: false },
    } as AuditManifest;
    const limitation = {
      limitationId: 'limitation:evidence-diagnostic:performance-confidence-insufficient',
      code: 'performance-confidence-insufficient',
      summary: { fr: 'Mesure instable.', en: 'Unstable measurement.' },
      reportDestination: 'section-11',
      evidenceRefs: ['lighthouse|performance:https://example.com/#mobile'],
    } satisfies EvidenceLimitation;

    const evidence = buildWritingPerformanceEvidence(manifest, [limitation]);

    expect(evidence.observations).toEqual([]);
    expect(evidence.primaryConcern).toBeNull();
  });

  it('builds trusted theme guidance only from the approved remediation registry and keeps themes isolated', () => {
    const findings = [
      {
        findingId: 'f-contrast',
        ruleId: 'color-contrast',
        source: 'axe',
        category: 'accessibility',
      },
      {
        findingId: 'f-alt',
        ruleId: 'image-alt',
        source: 'axe',
        category: 'accessibility',
      },
      {
        findingId: 'f-unknown',
        ruleId: 'not-in-reviewed-registry',
        source: 'custom',
        category: 'seo',
      },
    ] as Finding[];
    const themes = [
      { themeKey: 't1', findingIds: ['f-contrast', 'f-unknown'] },
      { themeKey: 't2', findingIds: ['f-alt'] },
    ];

    const guidance = buildTrustedRemediationsByTheme(themes, findings, 'fr');

    expect(guidance.t1).toEqual([
      { ruleId: 'color-contrast', guidance: remediationFor('color-contrast', 'fr') },
    ]);
    expect(guidance.t2).toEqual([
      { ruleId: 'image-alt', guidance: remediationFor('image-alt', 'fr') },
    ]);
    expect(guidance.t1?.some((entry) => entry.ruleId === 'image-alt')).toBe(false);
    expect(guidance.t2?.some((entry) => entry.ruleId === 'color-contrast')).toBe(false);
    expect(JSON.stringify(guidance)).not.toContain('not-in-reviewed-registry');
  });
});
