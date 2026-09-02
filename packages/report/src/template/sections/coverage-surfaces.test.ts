import { describe, expect, it } from 'vitest';
import type { AuditManifest, AuditPassOutcome } from '@odysseus/core';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../../test-fixtures.js';
import { getStrings } from '../strings/i18n.js';
import { renderCoreWebVitalsTable } from './core-web-vitals-table.js';
import { renderFindingsAppendix } from './findings-appendix.js';
import { renderMetadataSheet } from './metadata-sheet.js';
import { renderMethodology } from './methodology.js';
import { renderStatistics } from './statistics.js';

function withCoverage(manifest: AuditManifest): AuditManifest {
  const outcomes: readonly [AuditPassOutcome, AuditPassOutcome][] = [
    ['completed', 'completed'],
    ['partial', 'failed'],
    ['failed', 'not-planned'],
  ];
  return {
    ...manifest,
    pages: manifest.pages.map((page, index) => {
      const outcomesForPage = outcomes[index];
      if (!outcomesForPage) return page;
      const [contentOutcome, lighthouseOutcome] = outcomesForPage;
      return {
        ...page,
        analysisCoverage: {
          plannerVersion: 'v1',
          role: 'content',
          confidence: 'high',
          reasonCodes: [],
          passes: {
            rendered: { outcome: contentOutcome },
            axe: { outcome: contentOutcome },
            extended: { outcome: contentOutcome },
            lighthouse: { outcome: lighthouseOutcome },
          },
        },
      };
    }),
    continuationGuardSummary: {
      guardVersion: 'v1',
      familyMaxEnqueued: 3,
      families: [],
      additionalFamiliesOmittedCount: 0,
      totalOmittedUrlCount: 7,
    },
  };
}

describe('current coverage reaches every report scope surface', () => {
  it('uses the shared pass-specific summary in English', async () => {
    const manifest = withCoverage(await loadSmallSiteManifest());
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('en');
    const strings = getStrings('en');
    const summaryNeedle = '11 URLs inventoried; content-sensitive results on 2 pages';
    const surfaces = [
      renderMetadataSheet(strings, manifest, analysis, findings),
      renderStatistics(strings, 3, 'en', findings, manifest),
      renderCoreWebVitalsTable(strings, 9, 'en', manifest),
      renderMethodology(strings, 11, manifest, 'en'),
      renderFindingsAppendix(strings, 12, 'en', findings, manifest, 'general'),
    ];

    for (const html of surfaces) expect(html).toContain(summaryNeedle);
    expect(surfaces[3]).toContain('7 additional continuation URLs');
    expect(surfaces[4]).toContain('8 coverage record unavailable');
  });

  it('renders the shared summary in French without inventing family reach', async () => {
    const manifest = withCoverage(await loadSmallSiteManifest());
    const findings = await loadSmallSiteFindings();
    const strings = getStrings('fr');
    const html = renderFindingsAppendix(strings, 12, 'fr', findings, manifest, 'general');

    expect(html).toContain('11 URL inventoriées');
    expect(html).toContain('7 URL de continuation');
    expect(html).not.toContain('affecte toutes les pages de cette famille');
  });
});
