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

// Issue #324: the pass-by-pass breakdown opened the metadata sheet, the
// statistics, the performance page and the annex verbatim. It now lives in
// the methodology section alone, and the metadata sheet carries one plain
// scope line.
describe('coverage disclosure placement (issue #324)', () => {
  it('prints the full breakdown in methodology only, and a plain line on the metadata sheet', async () => {
    const manifest = withCoverage(await loadSmallSiteManifest());
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('en');
    const strings = getStrings('en');
    const summaryNeedle = '11 URLs inventoried; content-sensitive results on 2 pages';

    const methodology = renderMethodology(strings, 11, manifest, 'en');
    expect(methodology).toContain(summaryNeedle);
    expect(methodology).toContain('7 additional continuation URLs');
    expect(methodology).toContain('8 coverage records unavailable');

    const metadata = renderMetadataSheet(strings, manifest, analysis, findings);
    expect(metadata).toContain('2 pages analysed out of 11 addresses found');
    expect(metadata).not.toContain('content-sensitive');

    for (const html of [
      metadata,
      renderStatistics(strings, 3, 'en', findings, manifest),
      renderCoreWebVitalsTable(strings, 9, 'en', manifest),
      renderFindingsAppendix(strings, 12, 'en', findings, manifest, 'general'),
    ]) {
      expect(html).not.toContain(summaryNeedle);
    }
  });

  it('writes the plain scope line in French', async () => {
    const manifest = withCoverage(await loadSmallSiteManifest());
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');
    const html = renderMetadataSheet(getStrings('fr'), manifest, analysis, findings);

    expect(html).toContain('2 pages analysées sur 11 adresses trouvées');
    expect(html).not.toContain('URL inventoriées');
  });

  it('renders the French breakdown in methodology without inventing family reach', async () => {
    const manifest = withCoverage(await loadSmallSiteManifest());
    const html = renderMethodology(getStrings('fr'), 11, manifest, 'fr');

    expect(html).toContain('11 URL inventoriées');
    expect(html).toContain('7 URL de continuation');
    expect(html).not.toContain('affecte toutes les pages de cette famille');
  });
});
