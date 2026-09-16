import { describe, expect, it } from 'vitest';
import { renderHtml } from './render-html.js';
import { auditDate, formatDate } from './html-utils.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../test-fixtures.js';
import { resolveRenderDiffEvidence } from '../screenshots.js';

/** A real Haaitza scan started at 22:16 UTC and finished after midnight,
 *  so the cover, the executive scope block and the checklist printed
 *  "15 septembre 2026" while the closing page said the scan completed on
 *  "16 septembre 2026". Two dates for one audit reads as a data error,
 *  which is the worst thing a page of legal-adjacent evidence can do.
 *
 *  The fixture manifest starts and finishes inside one day, so this test
 *  supplies its own straddling pair. The two instants are deliberately two
 *  days apart rather than minutes either side of midnight: `formatDate`
 *  renders in the host's local zone, and only a gap wider than any UTC
 *  offset guarantees two distinct calendar dates on every machine. */
describe('the audit date printed across a day-straddling scan', () => {
  it('prints the scan completion date everywhere and never the start date', async () => {
    const scanned = await loadSmallSiteManifest();
    const manifest = {
      ...scanned,
      startedAt: '2026-08-01T12:00:00.000Z',
      finishedAt: '2026-08-03T12:00:00.000Z',
    };
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);

    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages });

    expect(html).toContain(formatDate(auditDate(manifest), 'fr'));
    expect(html).not.toContain(formatDate(new Date(manifest.startedAt), 'fr'));
  });
});
