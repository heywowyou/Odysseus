import { describe, expect, it } from 'vitest';
import type { Finding } from '@odysseus/core';
import { renderConformanceSummary } from './conformance-summary.js';
import { getStrings } from '../strings/i18n.js';
import { loadSasFernandeFindings } from '../../test-fixtures.js';

describe('renderConformanceSummary against the real sas-fernande.fr findings', () => {
  it('renders one row per WCAG criterion, with its official name resolved', async () => {
    const findings = await loadSasFernandeFindings();
    const html = renderConformanceSummary(getStrings('fr'), 7, findings, 'fr');

    expect(html).toContain('1.4.3');
    expect(html).toContain('Contraste minimum');
  });

  /** report.reference.html's scope-note paragraph is fixed, unconditional
   *  copy (CLAUDE.md rule 6): this criteria list never rules on legal
   *  applicability, regardless of whether section 11's methodology
   *  chapter states a specific obligation determination elsewhere.
   *
   *  item 23 [REGRESSION]: the wording changed from a blanket "we don't
   *  know if this applies to you" (which flatly contradicted a confirmed
   *  status shown elsewhere in the same document) to a note scoped to the
   *  criteria list itself - see render-html.test.ts's item-23 describe
   *  block for the assertion that the old phrase never recurs. */
  it('always states this criteria list alone does not conclude legal obligation', async () => {
    const findings = await loadSasFernandeFindings();
    const html = renderConformanceSummary(getStrings('fr'), 7, findings, 'fr');
    // item 3.14: rephrased as a positive statement of what the table is
    // ("décrit des écarts... indépendamment de toute question
    // d'obligation légale") rather than the old defensive "does not
    // contradict section 2" framing, which read as the report arguing
    // with itself in front of the client.
    expect(html).toContain("indépendamment de toute question d&#39;obligation légale");
  });
});

describe('item 1.9: the heuristic block is structurally distinct from the real failures table', () => {
  it('renders the heuristic table with no WCAG criterion column, unlike the real failures table above it', () => {
    const findings: Finding[] = [
      {
        findingId: 'f1',
        auditId: 'a',
        schemaVersion: 1,
        source: 'axe',
        ruleId: 'color-contrast',
        category: 'accessibility',
        severity: 'serious',
        wcagCriteria: ['1.4.3'],
        title: 'Elements must meet minimum color contrast ratio thresholds',
        description: 'desc',
        pageUrls: ['https://example.com/'],
        occurrences: 1,
        elements: [],
        rawEvidence: {},
        dedupeKey: 'd1',
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
      {
        findingId: 'f2',
        auditId: 'a',
        schemaVersion: 1,
        source: 'custom',
        ruleId: 'alt-text-quality-heuristic',
        category: 'accessibility',
        severity: 'moderate',
        wcagCriteria: ['1.1.1'],
        title: 'Alt text quality heuristic',
        description: 'desc',
        pageUrls: ['https://example.com/'],
        occurrences: 1,
        elements: [],
        rawEvidence: {},
        dedupeKey: 'd2',
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
    ];

    const html = renderConformanceSummary(getStrings('fr'), 7, findings, 'fr');
    // The real table (5 columns) still carries its criterion column.
    expect(html).toContain('grid-template-columns:100px 1fr 90px 100px 100px');
    // The heuristic table (4 columns) drops the criterion column entirely.
    expect(html).toContain('grid-template-columns:1fr 90px 100px 100px');
    expect(html).toContain('Signaux à vérifier');
  });
});

// item 1.2 (La Corniche pass): the criteria table's occurrence column
// summed to 911 while the accessibility-occurrences tile elsewhere said
// 703, a 208-occurrence gap (exactly the link-name occurrence count,
// double-counted across two criterion rows by design) an agency had to
// puzzle out unaided.
describe('item 1.2: a footnote explains when the occurrence column double-counts a finding', () => {
  function buildFinding(overrides: Partial<Finding> & Pick<Finding, 'findingId' | 'ruleId' | 'wcagCriteria'>): Finding {
    return {
      auditId: 'a',
      schemaVersion: 1,
      source: 'axe',
      category: 'accessibility',
      severity: 'serious',
      title: 't',
      description: 'd',
      pageUrls: ['https://example.com/'],
      occurrences: 1,
      elements: [],
      rawEvidence: {},
      dedupeKey: overrides.findingId,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      ...overrides,
    };
  }

  it('renders the note when a finding maps to more than one WCAG criterion', () => {
    const findings = [buildFinding({ findingId: 'f1', ruleId: 'link-name', wcagCriteria: ['2.4.4', '4.1.2'] })];
    const html = renderConformanceSummary(getStrings('fr'), 7, findings, 'fr');
    expect(html).toContain('compté dans chaque ligne concernée');
  });

  it('does not render the note when every finding maps to exactly one criterion', () => {
    const findings = [buildFinding({ findingId: 'f1', ruleId: 'color-contrast', wcagCriteria: ['1.4.3'] })];
    const html = renderConformanceSummary(getStrings('fr'), 7, findings, 'fr');
    expect(html).not.toContain('compté dans chaque ligne concernée');
  });

  it('does not render the note for a multi-criterion heuristic finding (only real failures count)', () => {
    const findings = [
      buildFinding({
        findingId: 'f1',
        ruleId: 'alt-text-quality-heuristic',
        wcagCriteria: ['1.1.1', '1.4.5'],
        source: 'custom',
        severity: 'moderate',
      }),
    ];
    const html = renderConformanceSummary(getStrings('fr'), 7, findings, 'fr');
    expect(html).not.toContain('compté dans chaque ligne concernée');
  });
});

describe('renderConformanceSummary with no WCAG failures', () => {
  it('renders the empty state rather than a blank grid', () => {
    const findings: Finding[] = [
      {
        findingId: 'f1',
        auditId: 'a',
        schemaVersion: 1,
        source: 'lighthouse',
        ruleId: 'meta-description',
        category: 'seo',
        severity: 'moderate',
        wcagCriteria: [],
        title: 'Missing meta description',
        description: 'desc',
        pageUrls: ['https://example.com/'],
        occurrences: 1,
        elements: [],
        rawEvidence: {},
        dedupeKey: 'd1',
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
    ];

    const html = renderConformanceSummary(getStrings('en'), 7, findings, 'en');

    expect(html).toContain('No WCAG 2.2 level AA criteria failing were detected on this site.');
    expect(html).not.toContain('row-atomic');
  });
});
