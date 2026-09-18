import { describe, expect, it } from 'vitest';
import type { Finding, ReportOnlyInputs } from '@odysseus/core';
import { buildReportFactRegistry } from './fact-registry.js';
import { resolveEvidenceBoundContent } from './evidence-bound-content.js';
import { buildFinding, buildPayload, buildSnapshot } from './test-fixtures.js';

const inputs: ReportOnlyInputs = {
  preparation: {
    fr: {
      language: 'fr',
      coverQuestion: { value: 'Question', source: 'fallback' },
      hook: { family: 'accessibility', value: 'Accroche', evidenceUnavailable: false },
    },
    en: {
      language: 'en',
      coverQuestion: { value: 'Question', source: 'fallback' },
      hook: { family: 'accessibility', value: 'Hook', evidenceUnavailable: false },
    },
  },
  manualFields: {
    nomCommercial: { value: 'Hôtel Fixture', source: 'operator', updatedAt: new Date(0) },
  } as ReportOnlyInputs['manualFields'] & object,
};

function finding(overrides: Partial<Finding> & Pick<Finding, 'findingId'>): Finding {
  return {
    ...buildFinding({
      findingId: overrides.findingId,
      category: 'performance',
      severity: 'serious',
    }),
    ...overrides,
  };
}

// Shapes copied from a saved real audit's normalized findings.
const lcpLab = finding({
  findingId: 'f006',
  source: 'lighthouse',
  ruleId: 'largest-contentful-paint',
  pageUrls: ['https://site.test/', 'https://site.test/a', 'https://site.test/b'],
  occurrences: 3,
  rawEvidence: {
    perPage: {
      'https://site.test/': { numericValue: 4107.795, displayValue: '4.1 s' },
      'https://site.test/a': { numericValue: 2759.5046, displayValue: '2.8 s' },
      'https://site.test/b': { numericValue: 3001, displayValue: '3.0 s' },
    },
  },
});
const cruxLcp = finding({
  findingId: 'f010',
  source: 'custom',
  ruleId: 'crux-lcp-poor',
  pageUrls: ['https://site.test/'],
  rawEvidence: {
    perPage: { 'https://site.test/': { metric: 'largest_contentful_paint', p75: 4226 } },
  },
});
const trackers = finding({
  findingId: 'f017',
  source: 'custom',
  category: 'privacy',
  ruleId: 'tracker-request-before-consent',
  rawEvidence: {
    perPage: { 'https://site.test/': { hosts: ['www.googletagmanager.com'], vendors: ['GTM'] } },
  },
});
const statement = finding({
  findingId: 'f029',
  source: 'custom',
  category: 'accessibility',
  ruleId: 'accessibility-statement-missing',
  rawEvidence: { perPage: { 'https://site.test/': { pagesSearched: 38 } } },
});
const contrast = finding({
  findingId: 'f015',
  source: 'axe',
  category: 'accessibility',
  ruleId: 'color-contrast',
  wcagCriteria: ['1.4.3'],
  occurrences: 76,
});
const unknownLab = finding({
  findingId: 'f099',
  source: 'lighthouse',
  ruleId: 'some-new-insight',
  rawEvidence: { perPage: { 'https://site.test/': { numericValue: 12 } } },
});

const payload = buildPayload([lcpLab, cruxLcp, trackers, statement, contrast, unknownLab]);
const registry = buildReportFactRegistry(payload, buildSnapshot(payload), inputs);
const fact = (id: string) => registry.facts.find((item) => item.factId === id);

describe('buildReportFactRegistry exposes every exact token a writer needs', () => {
  it('binds Lighthouse lab medians and worst pages in their metric unit, labelled as lab data', () => {
    expect(fact('finding.f006.lab.median')).toMatchObject({
      value: 3001,
      display: { fr: '3,0 s', en: '3.0 s' },
    });
    expect(fact('finding.f006.lab.worst')?.display).toEqual({ fr: '4,1 s', en: '4.1 s' });
    expect(fact('finding.f006.lab.pagesMeasured')?.value).toBe(3);
    expect(fact('finding.f006.lab.median')?.label).toMatch(/not field data/);
  });

  it('binds the CrUX p75 as field data with a grouped millisecond display', () => {
    const p75 = fact('finding.f010.field.p75');
    expect(p75?.value).toBe(4226);
    expect(p75?.display.en).toBe('4,226 ms');
    expect(p75?.display.fr).toMatch(/^4\s226 ms$/u);
    expect(p75?.label).toMatch(/CrUX field data/);
  });

  it('binds single-record custom counts and list sizes, and occurrence/page counts for every finding', () => {
    expect(fact('finding.f029.pagesSearched')?.value).toBe(38);
    expect(fact('finding.f017.vendorsCount')?.value).toBe(1);
    expect(fact('finding.f015.occurrences')?.value).toBe(76);
    expect(fact('finding.f006.pages')?.value).toBe(3);
  });

  it('never guesses a unit for an unmapped lab audit', () => {
    expect(registry.facts.some((item) => item.factId.startsWith('finding.f099.lab.'))).toBe(false);
  });

  it('declares WCAG criteria, standards and code-owned legal citations as reference facts', () => {
    expect(fact('wcag.1.4.3')).toMatchObject({ kind: 'reference', display: { fr: '1.4.3' } });
    expect(fact('wcag.1.4.3')?.sourceRefs).toEqual(['f015']);
    expect(fact('standard.en301549')?.kind).toBe('reference');
    expect(fact('legal.loi-2005-102-article-47.citation')?.display.fr).toBe(
      'loi n° 2005-102 du 11 février 2005, article 47',
    );
  });

  it('binds severity/category totals and the operator-entered trading name', () => {
    expect(fact('findings.severity.serious')?.value).toBe(6);
    expect(fact('findings.category.accessibility')?.value).toBe(2);
    expect(fact('client.commercialName')?.display.fr).toBe('Hôtel Fixture');
  });

  it('is deterministic and keeps fact ids unique', () => {
    const again = buildReportFactRegistry(payload, buildSnapshot(payload), inputs);
    expect(again).toEqual(registry);
    const ids = registry.facts.map((item) => item.factId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('lets a writer state a criterion and a field percentile without typing a digit', () => {
    const sentence = resolveEvidenceBoundContent(
      {
        segments: [
          { kind: 'text', text: 'Le critère WCAG' },
          { kind: 'reference', referenceId: 'wcag.1.4.3' },
          { kind: 'text', text: 'échoue ; le LCP terrain au 75e centile atteint' },
          { kind: 'fact', factId: 'finding.f010.field.p75' },
          { kind: 'text', text: '.' },
        ],
      },
      registry,
      'en',
    );
    expect(sentence).toBe(
      'Le critère WCAG 1.4.3 échoue ; le LCP terrain au 75e centile atteint 4,226 ms.',
    );
  });
});
