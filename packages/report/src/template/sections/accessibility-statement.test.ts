import { describe, expect, it } from 'vitest';
import type { AuditManualFields, Finding, ObligationAssessment } from '@odysseus/core';
import { isArticle47Regime, renderAccessibilityStatement } from './accessibility-statement.js';
import { getStrings } from '../strings/i18n.js';

const wcagFinding: Finding = {
  findingId: 'f001',
  auditId: 'a1',
  schemaVersion: 1,
  source: 'axe',
  ruleId: 'color-contrast',
  category: 'accessibility',
  severity: 'serious',
  wcagCriteria: ['1.4.3'],
  title: 'Insufficient contrast',
  description: 'd',
  pageUrls: ['https://example.com/'],
  occurrences: 1,
  elements: [],
  rawEvidence: {},
  dedupeKey: 'd1',
  firstSeenAt: new Date(),
  lastSeenAt: new Date(),
};

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

describe('item 19: the déclaration d\'accessibilité only renders for an article-47 resolution', () => {
  it('isArticle47Regime is false for an EAA-route assessment', () => {
    expect(isArticle47Regime(eaaAssessment)).toBe(false);
  });

  it('isArticle47Regime is true for an article-47 resolution', () => {
    expect(isArticle47Regime(article47Assessment)).toBe(true);
  });

  it('isArticle47Regime is false for undetermined/out_of_scope/absent', () => {
    expect(isArticle47Regime(undefined)).toBe(false);
    expect(isArticle47Regime({ status: 'undetermined', basis: [] })).toBe(false);
    expect(isArticle47Regime({ status: 'out_of_scope', basis: [] })).toBe(false);
  });

  it('renders nothing (empty string) for an EAA-route client, matching the reported Palais Gallien case', () => {
    const html = renderAccessibilityStatement(getStrings('fr'), 10, 'fr', [wcagFinding], eaaAssessment);
    expect(html).toBe('');
  });

  it('renders the section for an article-47 client', () => {
    const html = renderAccessibilityStatement(getStrings('fr'), 10, 'fr', [wcagFinding], article47Assessment);
    expect(html).not.toBe('');
    expect(html).toContain('section-10');
  });
});

describe('item 20: per-criterion status is binary conforme/non-conforme', () => {
  it('never renders the invalid blended "(partiellement)" string', () => {
    const html = renderAccessibilityStatement(getStrings('fr'), 10, 'fr', [wcagFinding], article47Assessment);
    expect(html).not.toContain('partiellement');
    expect(html).toContain('Non conforme');
  });
});

// 2026-08-22, La Corniche report review: "Non conforme" rendered in the
// neutral lavender accent colour, the same tone as ordinary emphasis
// text - not the red used everywhere else a critical/urgent state is
// shown (themes.ts's Conformité column, the severity ramp). Aligned to
// the same SEVERITY.critical red so the two sections agree.
describe('2026-08-22: "Non conforme" is coloured with the critical/red tone, not the neutral accent', () => {
  it('colours the Non conforme cell with #d97b82 (SEVERITY.critical)', () => {
    const html = renderAccessibilityStatement(getStrings('fr'), 10, 'fr', [wcagFinding], article47Assessment);
    expect(html).toMatch(/Non conforme<\/div>/);
    expect(html).toContain('color:#d97b82');
  });
});

describe('item 21: a scraped contact email never renders as a finished value', () => {
  it('renders a detected email with an explicit "to confirm" qualifier', () => {
    const manualFields: AuditManualFields = {
      declarationContactEmail: { value: 'direction@palais-gallien.com', provenance: 'detected' },
      updatedAt: new Date(),
    };
    const html = renderAccessibilityStatement(getStrings('fr'), 10, 'fr', [wcagFinding], article47Assessment, manualFields);
    expect(html).toContain('direction@palais-gallien.com');
    expect(html).toContain('à confirmer');
  });

  it('renders an operator-confirmed email as final, with no qualifier', () => {
    const manualFields: AuditManualFields = {
      declarationContactEmail: { value: 'accessibilite@palais-gallien.com', provenance: 'operator' },
      updatedAt: new Date(),
    };
    const html = renderAccessibilityStatement(getStrings('fr'), 10, 'fr', [wcagFinding], article47Assessment, manualFields);
    expect(html).toContain('accessibilite@palais-gallien.com');
    expect(html).not.toContain('à confirmer');
  });

  it('falls back to the generic placeholder when no email field was ever supplied', () => {
    const html = renderAccessibilityStatement(getStrings('fr'), 10, 'fr', [wcagFinding], article47Assessment);
    expect(html).toContain('à compléter par le client');
  });
});

describe('item 22: the declaration includes the six previously-missing fields', () => {
  it('includes all six field labels', () => {
    const html = renderAccessibilityStatement(getStrings('fr'), 10, 'fr', [wcagFinding], article47Assessment);
    const strings = getStrings('fr').accessibilityStatement;
    for (const label of [
      strings.firstPublicationDateLabel,
      strings.technologiesLabel,
      strings.testEnvironmentLabel,
      strings.nonAccessibleContentLabel,
      strings.feedbackProcedureLabel,
      strings.recoursePathLabel,
    ]) {
      expect(html).toContain(label);
    }
  });
});
