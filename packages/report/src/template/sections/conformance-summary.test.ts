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
    expect(html).toContain("n&#39;implique pas, à elle seule, une conclusion sur l&#39;obligation légale");
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
