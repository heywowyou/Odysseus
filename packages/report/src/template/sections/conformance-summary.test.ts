import { describe, expect, it } from 'vitest';
import type { Finding } from '@odysseus/core';
import { renderConformanceSummary } from './conformance-summary.js';
import { getStrings } from '../strings/i18n.js';
import { loadSasFernandeFindings } from '../../test-fixtures.js';

describe('renderConformanceSummary against the real sas-fernande.fr findings', () => {
  it('renders one row per WCAG criterion, with its official name resolved', async () => {
    const findings = await loadSasFernandeFindings();
    const html = renderConformanceSummary(getStrings('fr'), findings, 'fr');

    expect(html).toContain('1.4.3');
    expect(html).toContain('Contraste minimum');
  });

  /** report.reference.html's scope-note paragraph is fixed, unconditional
   *  copy (CLAUDE.md rule 6): this criteria list never rules on legal
   *  applicability, regardless of whether section 11's methodology
   *  chapter states a specific obligation determination elsewhere. */
  it('always states the criteria list does not rule on legal applicability', async () => {
    const findings = await loadSasFernandeFindings();
    const html = renderConformanceSummary(getStrings('fr'), findings, 'fr');
    expect(html).toContain('sans se prononcer sur leur applicabilité légale précise');
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

    const html = renderConformanceSummary(getStrings('en'), findings, 'en');

    expect(html).toContain('No WCAG 2.2 level AA criteria failing were detected on this site.');
    expect(html).not.toContain('row-atomic');
  });
});
