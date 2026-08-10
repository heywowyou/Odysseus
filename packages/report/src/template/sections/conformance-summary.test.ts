import { describe, expect, it } from 'vitest';
import type { Finding, ObligationAssessment } from '@odysseus/core';
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
});

describe('renderConformanceSummary applicability hedge, gated on obligation status', () => {
  it('shows the hedge when no obligationAssessment is passed at all', async () => {
    const findings = await loadSasFernandeFindings();
    const html = renderConformanceSummary(getStrings('fr'), findings, 'fr');
    expect(html).toContain("sans se prononcer sur l&#39;applicabilité");
  });

  it('shows the hedge when the status is undetermined', async () => {
    const findings = await loadSasFernandeFindings();
    const assessment: ObligationAssessment = {
      status: 'undetermined',
      basis: [{ regimeId: 'eaa-loi-2023-171', facts: [{ kind: 'siren-missing' }] }],
    };
    const html = renderConformanceSummary(getStrings('fr'), findings, 'fr', assessment);
    expect(html).toContain("sans se prononcer sur l&#39;applicabilité");
  });

  it('hides the hedge when the status is in_scope, since section 9 states a specific determination', async () => {
    const findings = await loadSasFernandeFindings();
    const assessment: ObligationAssessment = {
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
    const html = renderConformanceSummary(getStrings('fr'), findings, 'fr', assessment);
    expect(html).not.toContain('applicabilité');
  });

  it('hides the hedge when the status is out_of_scope', async () => {
    const findings = await loadSasFernandeFindings();
    const assessment: ObligationAssessment = {
      status: 'out_of_scope',
      basis: [
        { regimeId: 'eaa-loi-2023-171', facts: [{ kind: 'sme-exemption', effectifCode: '02', turnoverEur: 500_000 }] },
      ],
    };
    const html = renderConformanceSummary(getStrings('fr'), findings, 'fr', assessment);
    expect(html).not.toContain('applicabilité');
  });

  it('hides the hedge when the status is likely_in_scope', async () => {
    const findings = await loadSasFernandeFindings();
    const assessment: ObligationAssessment = {
      status: 'likely_in_scope',
      basis: [
        {
          regimeId: 'eaa-loi-2023-171',
          facts: [
            { kind: 'effectif-band', code: '22', label: '100 à 199 salariés' },
            { kind: 'transactional-flow-unknown' },
          ],
        },
      ],
    };
    const html = renderConformanceSummary(getStrings('fr'), findings, 'fr', assessment);
    expect(html).not.toContain('applicabilité');
  });
});

describe('renderConformanceSummary with no WCAG failures', () => {
  it('renders the empty state rather than a blank table', () => {
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
    expect(html).not.toContain('<table>');
  });
});
