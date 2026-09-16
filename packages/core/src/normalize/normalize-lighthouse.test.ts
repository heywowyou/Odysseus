import { describe, expect, it } from 'vitest';
import {
  extractCoreWebVitals,
  extractLighthouseCandidates,
  extractLighthouseExcludedCategoryScores,
} from './normalize-lighthouse.js';
import { buildLighthouseAudit, buildLighthouseResultInput } from './fixtures.js';
import { MAX_LIGHTHOUSE_DETAILS_ITEMS } from './constants.js';
import type { CruxMetricKey } from './normalize-crux.js';

describe('extractLighthouseCandidates', () => {
  it('emits a page-scoped candidate for a failing weighted audit with no node details', () => {
    const lhr = buildLighthouseResultInput({
      categories: { performance: { score: 0.3, auditRefs: [{ id: 'lcp', weight: 25 }] } },
      audits: { lcp: buildLighthouseAudit({ score: 0.3, scoreDisplayMode: 'numeric' }) },
    });

    const candidates = extractLighthouseCandidates(lhr, 'https://example.com/');
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.element).toBeNull();
    expect(candidates[0]?.category).toBe('performance');
    expect(candidates[0]?.source).toBe('lighthouse');
  });

  it('skips audits scoring at or above the emission threshold', () => {
    const lhr = buildLighthouseResultInput({
      categories: { performance: { score: 0.95, auditRefs: [{ id: 'lcp', weight: 25 }] } },
      audits: { lcp: buildLighthouseAudit({ score: 0.95 }) },
    });
    expect(extractLighthouseCandidates(lhr, 'https://example.com/')).toEqual([]);
  });

  it('skips audits with a null score', () => {
    const lhr = buildLighthouseResultInput({
      categories: { performance: { score: null, auditRefs: [{ id: 'lcp', weight: 25 }] } },
      audits: { lcp: buildLighthouseAudit({ score: null }) },
    });
    expect(extractLighthouseCandidates(lhr, 'https://example.com/')).toEqual([]);
  });

  it.each(['informative', 'notApplicable', 'manual', 'error'])(
    'skips audits with scoreDisplayMode %s',
    (scoreDisplayMode) => {
      const lhr = buildLighthouseResultInput({
        categories: { performance: { score: 0.3, auditRefs: [{ id: 'lcp', weight: 25 }] } },
        audits: { lcp: buildLighthouseAudit({ score: 0.3, scoreDisplayMode }) },
      });
      expect(extractLighthouseCandidates(lhr, 'https://example.com/')).toEqual([]);
    },
  );

  it('never emits candidates from the accessibility category', () => {
    const lhr = buildLighthouseResultInput({
      categories: {
        accessibility: { score: 0.2, auditRefs: [{ id: 'color-contrast', weight: 10 }] },
      },
      audits: { 'color-contrast': buildLighthouseAudit({ score: 0.2 }) },
    });
    expect(extractLighthouseCandidates(lhr, 'https://example.com/')).toEqual([]);
  });

  it('never emits candidates from the best-practices category', () => {
    const lhr = buildLighthouseResultInput({
      categories: {
        'best-practices': { score: 0.2, auditRefs: [{ id: 'deprecations', weight: 10 }] },
      },
      audits: { deprecations: buildLighthouseAudit({ score: 0.2 }) },
    });
    expect(extractLighthouseCandidates(lhr, 'https://example.com/')).toEqual([]);
  });

  it('skips image-alt under seo because it duplicates an axe rule', () => {
    const lhr = buildLighthouseResultInput({
      categories: { seo: { score: 0.3, auditRefs: [{ id: 'image-alt', weight: 10 }] } },
      audits: { 'image-alt': buildLighthouseAudit({ score: 0.3 }) },
    });
    expect(extractLighthouseCandidates(lhr, 'https://example.com/')).toEqual([]);
  });

  it('caps severity at moderate for weight < 3', () => {
    const lhr = buildLighthouseResultInput({
      categories: { performance: { score: 0.4, auditRefs: [{ id: 'x', weight: 1 }] } },
      audits: { x: buildLighthouseAudit({ score: 0.4 }) }, // score<0.5 -> failure 'critical'
    });
    const candidates = extractLighthouseCandidates(lhr, 'https://example.com/');
    expect(candidates[0]?.severity).toBe('moderate');
  });

  it('caps severity at serious for weight < 10', () => {
    const lhr = buildLighthouseResultInput({
      categories: { performance: { score: 0.4, auditRefs: [{ id: 'x', weight: 5 }] } },
      audits: { x: buildLighthouseAudit({ score: 0.4 }) },
    });
    const candidates = extractLighthouseCandidates(lhr, 'https://example.com/');
    expect(candidates[0]?.severity).toBe('serious');
  });

  it('leaves severity uncapped for weight >= 10', () => {
    const lhr = buildLighthouseResultInput({
      categories: { performance: { score: 0.2, auditRefs: [{ id: 'x', weight: 25 }] } },
      audits: { x: buildLighthouseAudit({ score: 0.2 }) },
    });
    const candidates = extractLighthouseCandidates(lhr, 'https://example.com/');
    expect(candidates[0]?.severity).toBe('critical');
  });

  it('demotes weight-0 diagnostic audits to minor regardless of score', () => {
    const lhr = buildLighthouseResultInput({
      categories: { performance: { score: 0.1, auditRefs: [{ id: 'x', weight: 0 }] } },
      audits: { x: buildLighthouseAudit({ score: 0.1 }) },
    });
    const candidates = extractLighthouseCandidates(lhr, 'https://example.com/');
    expect(candidates[0]?.severity).toBe('minor');
  });

  // item 9: severityFromLighthouse's score-based severity used to be the
  // only input to a Core Web Vital finding's severity, completely
  // disconnected from the bon/à améliorer/insuffisant status the report's
  // Core Web Vitals table separately computes from the same metric's raw
  // ms value (packages/report's core-web-vitals-table.ts). A real report
  // showed exactly this: TBT 560ms graded "à améliorer" (mid) by that
  // table while the underlying finding carried "Critique" (critical).
  describe("item 9: Core Web Vital severity is capped by the metric's own raw-value rating", () => {
    it('caps a "critical" TBT finding down to "serious" when the raw value is only "mid" (560ms, matching the reported case)', () => {
      const lhr = buildLighthouseResultInput({
        categories: {
          performance: { score: 0.3, auditRefs: [{ id: 'total-blocking-time', weight: 25 }] },
        },
        audits: { 'total-blocking-time': buildLighthouseAudit({ score: 0.3, numericValue: 560 }) },
      });
      const candidates = extractLighthouseCandidates(lhr, 'https://example.com/');
      expect(candidates[0]?.severity).toBe('serious');
    });

    it('leaves a "critical" TBT finding uncapped when the raw value is genuinely "poor" (700ms)', () => {
      const lhr = buildLighthouseResultInput({
        categories: {
          performance: { score: 0.3, auditRefs: [{ id: 'total-blocking-time', weight: 25 }] },
        },
        audits: { 'total-blocking-time': buildLighthouseAudit({ score: 0.3, numericValue: 700 }) },
      });
      const candidates = extractLighthouseCandidates(lhr, 'https://example.com/');
      expect(candidates[0]?.severity).toBe('critical');
    });

    it('caps a "critical" LCP finding down to "serious" when the raw value is only "good" (2000ms)', () => {
      const lhr = buildLighthouseResultInput({
        categories: {
          performance: { score: 0.2, auditRefs: [{ id: 'largest-contentful-paint', weight: 25 }] },
        },
        audits: {
          'largest-contentful-paint': buildLighthouseAudit({ score: 0.2, numericValue: 2000 }),
        },
      });
      const candidates = extractLighthouseCandidates(lhr, 'https://example.com/');
      expect(candidates[0]?.severity).toBe('serious');
    });

    it('does not cap non-Core-Web-Vital audits, even at the same score/weight', () => {
      const lhr = buildLighthouseResultInput({
        categories: {
          performance: { score: 0.2, auditRefs: [{ id: 'render-blocking-resources', weight: 25 }] },
        },
        audits: {
          'render-blocking-resources': buildLighthouseAudit({ score: 0.2, numericValue: 560 }),
        },
      });
      const candidates = extractLighthouseCandidates(lhr, 'https://example.com/');
      expect(candidates[0]?.severity).toBe('critical');
    });

    it('does not cap a Core Web Vital finding whose severity was already at or below "serious"', () => {
      const lhr = buildLighthouseResultInput({
        categories: {
          performance: { score: 0.4, auditRefs: [{ id: 'total-blocking-time', weight: 5 }] },
        },
        audits: { 'total-blocking-time': buildLighthouseAudit({ score: 0.4, numericValue: 560 }) },
      });
      const candidates = extractLighthouseCandidates(lhr, 'https://example.com/');
      // weight 5 already caps severityFromLighthouse's own output at
      // 'serious' before this fix's rating-based cap even applies.
      expect(candidates[0]?.severity).toBe('serious');
    });
  });

  describe('issue #300: good field data caps the lab audits that measure the same thing', () => {
    const goodLcp = new Set<CruxMetricKey>(['lcp']);

    it('caps a critical lab LCP finding to "moderate" when real visitors experience LCP as good', () => {
      // The Haaitza case: every one of 140 crawled pages carried a
      // critical Lighthouse performance finding while CrUX reported LCP at
      // 2.4s and CLS at 0.04, which emptied the critical-pages KPI of any
      // meaning.
      const lhr = buildLighthouseResultInput({
        categories: {
          performance: { score: 0.2, auditRefs: [{ id: 'largest-contentful-paint', weight: 25 }] },
        },
        audits: {
          'largest-contentful-paint': buildLighthouseAudit({ score: 0.2, numericValue: 6000 }),
        },
      });
      const candidates = extractLighthouseCandidates(
        lhr,
        'https://example.com/',
        undefined,
        goodLcp,
      );
      expect(candidates[0]?.severity).toBe('moderate');
    });

    it('caps the diagnostic audits that belong to a good field metric, not only the metric audit', () => {
      const lhr = buildLighthouseResultInput({
        categories: {
          performance: { score: 0.2, auditRefs: [{ id: 'speed-index', weight: 25 }] },
        },
        audits: { 'speed-index': buildLighthouseAudit({ score: 0.2, numericValue: 9000 }) },
      });
      const candidates = extractLighthouseCandidates(
        lhr,
        'https://example.com/',
        undefined,
        goodLcp,
      );
      expect(candidates[0]?.severity).toBe('moderate');
    });

    it('leaves a lab metric alone when the field data for that metric is not good', () => {
      const lhr = buildLighthouseResultInput({
        categories: {
          performance: { score: 0.2, auditRefs: [{ id: 'cumulative-layout-shift', weight: 25 }] },
        },
        audits: {
          'cumulative-layout-shift': buildLighthouseAudit({ score: 0.2, numericValue: 0.4 }),
        },
      });
      const candidates = extractLighthouseCandidates(
        lhr,
        'https://example.com/',
        undefined,
        goodLcp,
      );
      expect(candidates[0]?.severity).toBe('critical');
    });

    it('leaves advice that stands on its own merits uncapped, whatever the field data says', () => {
      const lhr = buildLighthouseResultInput({
        categories: {
          performance: { score: 0.2, auditRefs: [{ id: 'render-blocking-resources', weight: 25 }] },
        },
        audits: {
          'render-blocking-resources': buildLighthouseAudit({ score: 0.2, numericValue: 6000 }),
        },
      });
      const candidates = extractLighthouseCandidates(
        lhr,
        'https://example.com/',
        undefined,
        new Set<CruxMetricKey>(['lcp', 'cls', 'inp']),
      );
      expect(candidates[0]?.severity).toBe('critical');
    });

    it('changes nothing for a site with no CrUX record', () => {
      const lhr = buildLighthouseResultInput({
        categories: {
          performance: { score: 0.2, auditRefs: [{ id: 'largest-contentful-paint', weight: 25 }] },
        },
        audits: {
          'largest-contentful-paint': buildLighthouseAudit({ score: 0.2, numericValue: 6000 }),
        },
      });
      expect(extractLighthouseCandidates(lhr, 'https://example.com/')[0]?.severity).toBe(
        'critical',
      );
    });
  });

  it('emits one element-scoped candidate per item carrying a node value', () => {
    const lhr = buildLighthouseResultInput({
      categories: { seo: { score: 0.3, auditRefs: [{ id: 'tap-targets', weight: 10 }] } },
      audits: {
        'tap-targets': buildLighthouseAudit({
          score: 0.3,
          details: {
            type: 'table',
            items: [
              { tapTarget: { type: 'node', selector: '.a', snippet: '<a>a</a>' } },
              { tapTarget: { type: 'node', selector: '.b', snippet: '<a>b</a>' } },
            ],
          },
        }),
      },
    });

    const candidates = extractLighthouseCandidates(lhr, 'https://example.com/');
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.element?.selector)).toEqual(['.a', '.b']);
    expect(candidates[0]?.category).toBe('seo');
  });

  it('truncates page-scoped details.items and records truncation', () => {
    const items = Array.from({ length: MAX_LIGHTHOUSE_DETAILS_ITEMS + 5 }, (_, i) => ({
      url: `https://example.com/${i}`,
    }));
    const lhr = buildLighthouseResultInput({
      categories: { performance: { score: 0.2, auditRefs: [{ id: 'x', weight: 10 }] } },
      audits: { x: buildLighthouseAudit({ score: 0.2, details: { type: 'table', items } }) },
    });

    const candidates = extractLighthouseCandidates(lhr, 'https://example.com/');
    const details = candidates[0]?.rawEvidenceForPage['details'] as {
      items: unknown[];
      truncated: boolean;
      totalItems: number;
    };
    expect(details.items).toHaveLength(MAX_LIGHTHOUSE_DETAILS_ITEMS);
    expect(details.truncated).toBe(true);
    expect(details.totalItems).toBe(MAX_LIGHTHOUSE_DETAILS_ITEMS + 5);
  });

  it('carries numericValue and displayValue through to rawEvidenceForPage', () => {
    const lhr = buildLighthouseResultInput({
      categories: { performance: { score: 0.3, auditRefs: [{ id: 'lcp', weight: 25 }] } },
      audits: {
        lcp: buildLighthouseAudit({ score: 0.3, numericValue: 4100, displayValue: '4.1 s' }),
      },
    });
    const candidates = extractLighthouseCandidates(lhr, 'https://example.com/');
    expect(candidates[0]?.rawEvidenceForPage['numericValue']).toBe(4100);
    expect(candidates[0]?.rawEvidenceForPage['displayValue']).toBe('4.1 s');
  });

  it('never stores the full LHR in rawEvidenceForPage, only the single audit', () => {
    const lhr = buildLighthouseResultInput({
      categories: { performance: { score: 0.2, auditRefs: [{ id: 'x', weight: 10 }] } },
      audits: { x: buildLighthouseAudit({ score: 0.2 }) },
    });
    const candidates = extractLighthouseCandidates(lhr, 'https://example.com/');
    expect(Object.keys(candidates[0]?.rawEvidenceForPage ?? {})).not.toContain('categories');
    expect(Object.keys(candidates[0]?.rawEvidenceForPage ?? {})).not.toContain('audits');
  });
});

describe('extractLighthouseExcludedCategoryScores', () => {
  it('reads accessibility and best-practices scores, null when absent', () => {
    const lhr = buildLighthouseResultInput({
      categories: { accessibility: { score: 0.77, auditRefs: [] } },
    });
    const scores = extractLighthouseExcludedCategoryScores(lhr);
    expect(scores.accessibility).toBe(0.77);
  });

  it('returns null for a missing category rather than throwing', () => {
    const lhr = buildLighthouseResultInput({ categories: {} });
    expect(extractLighthouseExcludedCategoryScores(lhr)).toEqual({
      accessibility: null,
      bestPractices: null,
    });
  });
});

describe('extractCoreWebVitals', () => {
  it('extracts LCP, CLS, TBT, FCP, and Speed Index unconditionally, even when every audit scores above the emission threshold', () => {
    const lhr = buildLighthouseResultInput({
      audits: {
        'largest-contentful-paint': buildLighthouseAudit({
          score: 0.99,
          numericValue: 1200,
          displayValue: '1.2 s',
        }),
        'cumulative-layout-shift': buildLighthouseAudit({
          score: 1,
          numericValue: 0.02,
          displayValue: '0.02',
        }),
        'total-blocking-time': buildLighthouseAudit({
          score: 1,
          numericValue: 10,
          displayValue: '10 ms',
        }),
        'first-contentful-paint': buildLighthouseAudit({
          score: 0.95,
          numericValue: 900,
          displayValue: '0.9 s',
        }),
        'speed-index': buildLighthouseAudit({
          score: 0.9,
          numericValue: 1500,
          displayValue: '1.5 s',
        }),
      },
    });

    const cwv = extractCoreWebVitals(lhr);

    expect(cwv.lcp).toEqual({ score: 0.99, numericValue: 1200, displayValue: '1.2 s' });
    expect(cwv.cls).toEqual({ score: 1, numericValue: 0.02, displayValue: '0.02' });
    expect(cwv.tbt).toEqual({ score: 1, numericValue: 10, displayValue: '10 ms' });
    expect(cwv.fcp).toEqual({ score: 0.95, numericValue: 900, displayValue: '0.9 s' });
    expect(cwv.speedIndex).toEqual({ score: 0.9, numericValue: 1500, displayValue: '1.5 s' });
  });

  it('extracts a failing metric the same way as a passing one, since this path does not gate on score', () => {
    const lhr = buildLighthouseResultInput({
      audits: {
        'largest-contentful-paint': buildLighthouseAudit({
          score: 0,
          numericValue: 31000,
          displayValue: '31.0 s',
        }),
        'cumulative-layout-shift': buildLighthouseAudit({
          score: 0.9,
          numericValue: 0.09,
          displayValue: '0.09',
        }),
        'total-blocking-time': buildLighthouseAudit({
          score: 0.03,
          numericValue: 2800,
          displayValue: '2,800 ms',
        }),
      },
    });

    const cwv = extractCoreWebVitals(lhr);
    expect(cwv.lcp.numericValue).toBe(31000);
  });

  it('falls back to nulls per metric when an audit id is absent, rather than throwing', () => {
    const lhr = buildLighthouseResultInput({
      audits: {
        'largest-contentful-paint': buildLighthouseAudit({
          numericValue: 2000,
          displayValue: '2.0 s',
        }),
        // cumulative-layout-shift and total-blocking-time deliberately omitted
      },
    });

    const cwv = extractCoreWebVitals(lhr);
    expect(cwv.lcp.numericValue).toBe(2000);
    expect(cwv.cls).toEqual({ score: null, numericValue: null, displayValue: null });
    expect(cwv.tbt).toEqual({ score: null, numericValue: null, displayValue: null });
    expect(cwv.fcp).toEqual({ score: null, numericValue: null, displayValue: null });
    expect(cwv.speedIndex).toEqual({ score: null, numericValue: null, displayValue: null });
  });

  it('never produces an inp field: navigation-mode Lighthouse has no INP audit to read', () => {
    const cwv = extractCoreWebVitals(buildLighthouseResultInput());
    expect(cwv).not.toHaveProperty('inp');
  });
});
