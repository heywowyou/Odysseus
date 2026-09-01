/**
 * report-feedback-large-rule-families.md item 0.3, carried onto the minimal
 * cover (plan 018 step 4): the cover's report-type line must not advertise
 * the Performance pillar when nothing was measured - a real report claimed
 * Performance on the cover while section 09 printed nothing but "Non mesuré"
 * rows. Performance drops from this line specifically when core-web-vitals-
 * table.ts's hasMeasuredCoreWebVitals is false; the other three categories
 * always render, a clean category is still part of what was checked
 * (item 3.8's own reasoning).
 */
import { describe, expect, it } from 'vitest';
import type { AuditManifest } from '@odysseus/core';
import { renderCover } from './cover.js';
import { fr } from '../strings/fr.js';
import { en } from '../strings/en.js';
import { loadSmallSiteAnalysis, loadSmallSiteManifest } from '../../test-fixtures.js';

function buildMeasurement(numericValue: number, displayValue: string) {
  return { score: 0.9, numericValue, displayValue };
}

async function manifestWithOneMeasuredPage(): Promise<AuditManifest> {
  const manifest = await loadSmallSiteManifest();
  return {
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
}

describe('renderCover report-type line reacts to whether performance was measured', () => {
  it('omits Performance when no page has any measured Core Web Vital, in French', async () => {
    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('fr');
    const html = renderCover(fr, manifest, analysis);

    // Compared against the real strings constants, not hardcoded literals -
    // reportType uses a no-break space after each separator (see fr.ts's
    // own comment), so a literal retyped here could silently mismatch on
    // the invisible NBSP.
    expect(html).toContain(fr.cover.reportTypeNoPerformance);
    expect(html).not.toContain(fr.cover.reportType);
  });

  it('lists all four categories when at least one page has real Core Web Vitals data, in French', async () => {
    const html = renderCover(
      fr,
      await manifestWithOneMeasuredPage(),
      await loadSmallSiteAnalysis('fr'),
    );

    expect(html).toContain(fr.cover.reportType);
  });

  it('omits Performance when nothing was measured, in English', async () => {
    const manifest = await loadSmallSiteManifest();
    const analysis = await loadSmallSiteAnalysis('en');
    const html = renderCover(en, manifest, analysis);

    expect(html).toContain(en.cover.reportTypeNoPerformance);
    expect(html).not.toContain(en.cover.reportType);
  });

  it('lists all four categories when performance was measured, in English', async () => {
    const html = renderCover(
      en,
      await manifestWithOneMeasuredPage(),
      await loadSmallSiteAnalysis('en'),
    );

    expect(html).toContain(en.cover.reportType);
  });
});
