import { describe, expect, it } from 'vitest';
import type { Finding, ObligationAssessment } from '@odysseus/core';
import { renderGlossary } from './glossary.js';
import { getStrings } from '../strings/i18n.js';

function buildFinding(category: Finding['category']): Finding {
  return {
    findingId: 'f1',
    auditId: 'a1',
    schemaVersion: 1,
    source: 'axe',
    ruleId: 'rule',
    category,
    severity: 'moderate',
    wcagCriteria: [],
    title: 't',
    description: 'd',
    pageUrls: ['https://example.com/'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: 'd1',
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  };
}

const eaaAssessment: ObligationAssessment = {
  status: 'in_scope',
  basis: [
    {
      regimeId: 'eaa-loi-2023-171',
      facts: [
        { kind: 'effectif-band', code: '22', label: '100 à 199 salariés' },
        { kind: 'transactional-flow', evidence: [] },
      ],
    },
  ],
};

const article47Assessment: ObligationAssessment = {
  status: 'in_scope',
  basis: [
    {
      regimeId: 'eaa-loi-2023-171',
      facts: [
        { kind: 'effectif-band', code: '22', label: '100 à 199 salariés' },
        { kind: 'no-transactional-flow' },
      ],
    },
    {
      regimeId: 'loi-2005-102-article-47',
      facts: [{ kind: 'turnover', amountEur: 260_000_000, thresholdEur: 250_000_000 }],
    },
  ],
};

// item 33: the glossary defined RGAA on every report (including EAA-route
// ones that never mention it, per item 19) and omitted every performance-
// metric abbreviation and GEO/SEO term the report does use.
describe('item 33: the glossary is scoped to the terms a given report actually uses', () => {
  it('always includes the severity vocabulary and Core Web Vitals abbreviations', () => {
    const html = renderGlossary(getStrings('fr'), 13, {
      findings: [],
      obligationAssessment: undefined,
      transactionalFlowEvaluated: false,
    });
    for (const term of ['Critique', 'Sérieux', 'Modéré', 'Mineur', 'LCP', 'FCP', 'TBT', 'CLS', 'Speed Index']) {
      expect(html).toContain(term);
    }
  });

  it('omits RGAA for an EAA-route client', () => {
    const html = renderGlossary(getStrings('fr'), 13, {
      findings: [],
      obligationAssessment: eaaAssessment,
      transactionalFlowEvaluated: true,
    });
    expect(html).not.toContain('RGAA');
  });

  it('includes RGAA for an article-47 client', () => {
    const html = renderGlossary(getStrings('fr'), 13, {
      findings: [],
      obligationAssessment: article47Assessment,
      transactionalFlowEvaluated: true,
    });
    expect(html).toContain('RGAA');
  });

  it('includes SEO only when the report has seo findings', () => {
    const withSeo = renderGlossary(getStrings('fr'), 13, {
      findings: [buildFinding('seo')],
      obligationAssessment: undefined,
      transactionalFlowEvaluated: false,
    });
    const withoutSeo = renderGlossary(getStrings('fr'), 13, {
      findings: [buildFinding('accessibility')],
      obligationAssessment: undefined,
      transactionalFlowEvaluated: false,
    });
    expect(withSeo).toContain('>SEO<');
    expect(withoutSeo).not.toContain('>SEO<');
  });

  it('includes GEO only when the report has geo findings', () => {
    const withGeo = renderGlossary(getStrings('fr'), 13, {
      findings: [buildFinding('geo')],
      obligationAssessment: undefined,
      transactionalFlowEvaluated: false,
    });
    const withoutGeo = renderGlossary(getStrings('fr'), 13, {
      findings: [buildFinding('accessibility')],
      obligationAssessment: undefined,
      transactionalFlowEvaluated: false,
    });
    expect(withGeo).toContain('>GEO<');
    expect(withoutGeo).not.toContain('>GEO<');
  });

  it('includes "parcours transactionnel" only when the transactional-flow question was evaluated', () => {
    const evaluated = renderGlossary(getStrings('fr'), 13, {
      findings: [],
      obligationAssessment: undefined,
      transactionalFlowEvaluated: true,
    });
    const notEvaluated = renderGlossary(getStrings('fr'), 13, {
      findings: [],
      obligationAssessment: undefined,
      transactionalFlowEvaluated: false,
    });
    expect(evaluated).toContain('Parcours transactionnel');
    expect(notEvaluated).not.toContain('Parcours transactionnel');
  });
});
