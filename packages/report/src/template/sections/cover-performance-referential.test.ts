/**
 * report-feedback-la-corniche.md item 0.3: the cover's "RÉFÉRENTIEL
 * AUDITÉ" field always listed Performance among the audited categories
 * (item 3.8's own reasoning: "a clean category is still part of what was
 * checked"), which stopped being true the moment Lighthouse failed on
 * every page of a real scan - the cover claimed Performance while
 * section 09 printed nothing but "Non mesuré" rows. Performance now
 * drops from this line specifically when core-web-vitals-table.ts's
 * hasMeasuredCoreWebVitals is false.
 */
import { describe, expect, it } from 'vitest';
import type { AuditManifest } from '@odysseus/core';
import { renderCover } from './cover.js';
import { fr } from '../strings/fr.js';
import { loadSasFernandeAnalysis, loadSasFernandeManifest } from '../../test-fixtures.js';

function buildMeasurement(numericValue: number, displayValue: string) {
  return { score: 0.9, numericValue, displayValue };
}

describe('renderCover référentiel line reacts to whether performance was measured', () => {
  it('omits Performance when no page has any measured Core Web Vital (sas-fernande.fr predates coreWebVitals)', async () => {
    const manifest = await loadSasFernandeManifest();
    const analysis = await loadSasFernandeAnalysis('fr');
    const html = renderCover(fr, manifest, analysis);

    // item 2.5: compared against the real strings constants, not a
    // hardcoded literal - wcagReferentialValue uses a non-breaking space
    // after each "·" (see fr.ts's own comment) to stop the cover's narrow
    // value column wrapping right after the separator, so a literal
    // retyped here would silently mismatch on the invisible NBSP.
    expect(html).toContain(fr.cover.wcagReferentialValueNoPerformance);
    expect(html).not.toContain(fr.cover.wcagReferentialValue);
  });

  it('includes Performance when at least one page has real Core Web Vitals data', async () => {
    const manifest = await loadSasFernandeManifest();
    const analysis = await loadSasFernandeAnalysis('fr');
    const withVitals: AuditManifest = {
      ...manifest,
      pages: manifest.pages.map((page, i) =>
        i === 0
          ? {
              ...page,
              coreWebVitals: {
                lcp: buildMeasurement(1800, '1.8 s'),
                cls: buildMeasurement(0, '0'),
                tbt: buildMeasurement(120, '120 ms'),
                fcp: buildMeasurement(900, '0.9 s'),
                speedIndex: buildMeasurement(2000, '2.0 s'),
              },
            }
          : page,
      ),
    };
    const html = renderCover(fr, withVitals, analysis);

    expect(html).toContain(fr.cover.wcagReferentialValue);
  });
});
