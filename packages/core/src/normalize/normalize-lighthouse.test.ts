import { describe, expect, it } from 'vitest';
import {
  extractLighthouseCandidates,
  extractLighthouseExcludedCategoryScores,
} from './normalize-lighthouse.js';
import { buildLighthouseAudit, buildLighthouseResultInput } from './fixtures.js';
import { MAX_LIGHTHOUSE_DETAILS_ITEMS } from './constants.js';

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
