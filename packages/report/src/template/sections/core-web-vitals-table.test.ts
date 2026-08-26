import { describe, expect, it } from 'vitest';
import type { AuditManifest } from '@odysseus/core';
import { hasMeasuredCoreWebVitals, renderCoreWebVitalsTable } from './core-web-vitals-table.js';
import { getStrings } from '../strings/i18n.js';
import { loadSasFernandeManifest } from '../../test-fixtures.js';

function buildMeasurement(numericValue: number, displayValue: string) {
  return { score: 0.9, numericValue, displayValue };
}

describe('renderCoreWebVitalsTable', () => {
  // report-feedback-la-corniche.md item 0.3 [REGRESSION of this test's own
  // prior expectation]: a table of 5 "Non mesuré" rows, thresholds, and a
  // worst-page footnote that has nothing to explain reads as real data to
  // a client - a real report shipped exactly this table (Lighthouse
  // failed on all 18 pages) with the cover still claiming Performance was
  // audited. Whether nothing was ever recorded (sas-fernande.fr's older
  // capture, before coreWebVitals existed) or Lighthouse genuinely failed
  // on every page of a fresh scan, the section now states plainly that
  // measurement did not complete instead of rendering the unmeasured
  // table at all.
  it('states plainly that measurement did not complete, instead of a table of "Non mesuré" rows, for the sas-fernande.fr capture (predates coreWebVitals)', async () => {
    const manifest = await loadSasFernandeManifest();
    expect(hasMeasuredCoreWebVitals(manifest)).toBe(false);

    const html = renderCoreWebVitalsTable(getStrings('en'), 9, 'en', manifest);

    expect(html).not.toContain('Not measured');
    expect(html).not.toContain('<table');
    expect(html).toContain('did not complete');
  });

  it('renders all 5 aggregated medians (doc §3 section 09), not a per-page table', () => {
    const manifest = {
      siteUrl: 'https://example.com/',
      pages: [
        {
          url: 'https://example.com/',
          pageDir: 'pages/root-aaa',
          depth: 0,
          status: 'visited',
          errors: {},
          coreWebVitals: {
            lcp: buildMeasurement(1800, '1.8 s'),
            cls: buildMeasurement(0, '0'),
            tbt: buildMeasurement(120, '120 ms'),
            fcp: buildMeasurement(900, '0.9 s'),
            speedIndex: buildMeasurement(2000, '2.0 s'),
          },
        },
      ],
    } as unknown as AuditManifest;

    const html = renderCoreWebVitalsTable(getStrings('en'), 9, 'en', manifest);
    expect(html).toContain('1.8 s');
    expect(html).toContain('120 ms');
    expect(html).toContain('0.9 s');
    expect(html).toContain('2 s');
    expect(html).not.toContain('example.com/'); // no per-page URL column
  });

  // 2026-08-22, La Corniche report review: a real report stated medians
  // were "aggregated across 27 pages" (every *visited* page) while only
  // 25 pages actually returned a Core Web Vitals measurement - the other
  // 2 timed out, correctly disclosed elsewhere in the report (section
  // 11's methodology) but silently contradicted here.
  it('states the count of pages with an actual measurement, not every visited page, in the intro sentence', () => {
    const measuredPage = (n: number) => ({
      url: `https://example.com/${n}`,
      pageDir: `pages/p-${n}`,
      depth: 0,
      status: 'visited',
      errors: {},
      coreWebVitals: {
        lcp: buildMeasurement(1000, '1.0 s'),
        cls: buildMeasurement(0, '0'),
        tbt: buildMeasurement(0, '0 ms'),
        fcp: buildMeasurement(0, '0 s'),
        speedIndex: buildMeasurement(0, '0 s'),
      },
    });
    const visitedButUnmeasuredPage = (n: number) => ({
      url: `https://example.com/timeout-${n}`,
      pageDir: `pages/p-timeout-${n}`,
      depth: 0,
      status: 'visited',
      errors: {},
      // No coreWebVitals key at all - the page loaded but Lighthouse
      // timed out on it, same shape as a real runLighthouseIsolated
      // timeout.
    });

    const manifest = {
      siteUrl: 'https://example.com/',
      pages: [
        measuredPage(1),
        measuredPage(2),
        visitedButUnmeasuredPage(3),
        visitedButUnmeasuredPage(4),
      ],
    } as unknown as AuditManifest;

    const html = renderCoreWebVitalsTable(getStrings('en'), 9, 'en', manifest);

    expect(html).toContain('Median values aggregated across 2 pages');
    expect(html).not.toContain('aggregated across 4 pages');
  });

  it('computes the median across pages, not the mean, so one outlier page cannot drag the aggregate', () => {
    const page = (lcp: number) => ({
      url: `https://example.com/${lcp}`,
      pageDir: `pages/p-${lcp}`,
      depth: 0,
      status: 'visited',
      errors: {},
      coreWebVitals: {
        lcp: buildMeasurement(lcp, `${lcp} ms`),
        cls: buildMeasurement(0, '0'),
        tbt: buildMeasurement(0, '0 ms'),
        fcp: buildMeasurement(0, '0 s'),
        speedIndex: buildMeasurement(0, '0 s'),
      },
    });
    const manifest = {
      siteUrl: 'https://example.com/',
      pages: [page(1000), page(2000), page(46000)],
    } as unknown as AuditManifest;

    const html = renderCoreWebVitalsTable(getStrings('en'), 9, 'en', manifest);
    // Median LCP is 2000ms = 2.0s, not the mean (~16.3s).
    expect(html).toContain('2 s');
    expect(html).not.toContain('16.3 s');
  });

  it('rates the aggregated median against the standard Core Web Vitals thresholds (A7/R6)', () => {
    const manifest = {
      siteUrl: 'https://example.com/',
      pages: [
        {
          url: 'https://example.com/',
          pageDir: 'pages/root-aaa',
          depth: 0,
          status: 'visited',
          errors: {},
          // 46s LCP, matching the real haaitza homepage - must read as
          // "poor" with context, not a bare unexplained number (A7).
          coreWebVitals: {
            lcp: buildMeasurement(46356, '46.4 s'),
            cls: buildMeasurement(0, '0'),
            tbt: buildMeasurement(150, '150 ms'),
            fcp: buildMeasurement(900, '0.9 s'),
            speedIndex: buildMeasurement(2000, '2.0 s'),
          },
        },
      ],
    } as unknown as AuditManifest;

    const html = renderCoreWebVitalsTable(getStrings('en'), 9, 'en', manifest);

    expect(html).toContain('poor');
    expect(html).toContain('good');
  });

  // item 1.7/B2: a finding's severity is driven by its worst page
  // (severity.ts's maxSeverity dedupe rule), not the median this table
  // otherwise shows - a real Palais Gallien report showed a "Critique" TBT
  // finding sitting next to this table's median-based "a ameliorer"
  // status, which read as a contradiction. Showing the worst page's own
  // value resolves it without added prose.
  it('item 1.7/B2: shows the worst page alongside the median so an outlier page explains a higher finding severity', () => {
    const page = (tbt: number) => ({
      url: `https://example.com/${tbt}`,
      pageDir: `pages/p-${tbt}`,
      depth: 0,
      status: 'visited',
      errors: {},
      coreWebVitals: {
        lcp: buildMeasurement(1800, '1.8 s'),
        cls: buildMeasurement(0, '0'),
        tbt: buildMeasurement(tbt, `${tbt} ms`),
        fcp: buildMeasurement(900, '0.9 s'),
        speedIndex: buildMeasurement(2000, '2.0 s'),
      },
    });
    // Median TBT across these pages is 500ms ("needs improvement" per
    // CORE_WEB_VITAL_THRESHOLDS: good=200, needsImprovement=600), but one
    // outlier page is at 3900ms, genuinely "poor" - exactly the shape that
    // produces a "Critique" finding next to an "a ameliorer" median.
    const manifest = {
      siteUrl: 'https://example.com/',
      pages: [page(500), page(480), page(3900)],
    } as unknown as AuditManifest;

    const html = renderCoreWebVitalsTable(getStrings('fr'), 9, 'fr', manifest);
    expect(html).toContain('500 ms'); // median, in the value column
    expect(html).toContain('3 900 ms'); // worst page, in its own column (fr narrow no-break space)
    expect(html).toContain('Pire page');
  });

  it('item 1.7/B2: shows "same as median" for a metric with no outlier page', () => {
    const manifest = {
      siteUrl: 'https://example.com/',
      pages: [
        {
          url: 'https://example.com/',
          pageDir: 'pages/root-aaa',
          depth: 0,
          status: 'visited',
          errors: {},
          coreWebVitals: {
            lcp: buildMeasurement(1800, '1.8 s'),
            cls: buildMeasurement(0, '0'),
            tbt: buildMeasurement(120, '120 ms'),
            fcp: buildMeasurement(900, '0.9 s'),
            speedIndex: buildMeasurement(2000, '2.0 s'),
          },
        },
      ],
    } as unknown as AuditManifest;

    const html = renderCoreWebVitalsTable(getStrings('en'), 9, 'en', manifest);
    expect(html).toContain('Same as median');
  });

  // item 12: a genuinely healthy, non-zero CLS (e.g. the real median 0.0035
  // measured on hotel-palais-gallien-bordeaux.com) used to round to "0" at
  // 2 decimal places, indistinguishable from a capture failure.
  it('item 12: a small non-zero CLS median renders distinguishably from a literal 0, not rounded away', () => {
    const manifest = {
      siteUrl: 'https://example.com/',
      pages: [
        {
          url: 'https://example.com/',
          pageDir: 'pages/root-aaa',
          depth: 0,
          status: 'visited',
          errors: {},
          coreWebVitals: {
            lcp: buildMeasurement(1800, '1.8 s'),
            cls: buildMeasurement(0.0035, '0.004'),
            tbt: buildMeasurement(120, '120 ms'),
            fcp: buildMeasurement(900, '0.9 s'),
            speedIndex: buildMeasurement(2000, '2.0 s'),
          },
        },
      ],
    } as unknown as AuditManifest;

    const html = renderCoreWebVitalsTable(getStrings('en'), 9, 'en', manifest);
    expect(html).toContain('0.004');
    expect(html).not.toMatch(/>0<\/div>/);
  });

  it('item 0.3: still renders the real table when at least one page has real data, even if others do not', () => {
    const manifest = {
      siteUrl: 'https://example.com/',
      pages: [
        {
          url: 'https://example.com/a',
          pageDir: 'pages/a',
          depth: 0,
          status: 'visited',
          errors: {},
          coreWebVitals: {
            lcp: buildMeasurement(1800, '1.8 s'),
            cls: buildMeasurement(0, '0'),
            tbt: buildMeasurement(120, '120 ms'),
            fcp: buildMeasurement(900, '0.9 s'),
            speedIndex: buildMeasurement(2000, '2.0 s'),
          },
        },
        {
          url: 'https://example.com/b',
          pageDir: 'pages/b',
          depth: 0,
          status: 'visited',
          errors: { lighthouse: 'runLighthouseIsolated: worker exited' },
        },
      ],
    } as unknown as AuditManifest;

    expect(hasMeasuredCoreWebVitals(manifest)).toBe(true);
    const html = renderCoreWebVitalsTable(getStrings('en'), 9, 'en', manifest);
    expect(html).toContain('1.8 s');
    expect(html).not.toContain('did not complete');
  });

  // Milestone 8.6: CrUX real-user field data, rendered as a second block
  // under the lab table rather than a new section.
  describe('real-user data (CrUX)', () => {
    const measuredManifestWith = (cruxFieldData: AuditManifest['cruxFieldData']) =>
      ({
        siteUrl: 'https://example.com/',
        cruxFieldData,
        pages: [
          {
            url: 'https://example.com/',
            pageDir: 'pages/root-aaa',
            depth: 0,
            status: 'visited',
            errors: {},
            coreWebVitals: {
              lcp: buildMeasurement(1800, '1.8 s'),
              cls: buildMeasurement(0, '0'),
              tbt: buildMeasurement(120, '120 ms'),
              fcp: buildMeasurement(900, '0.9 s'),
              speedIndex: buildMeasurement(2000, '2.0 s'),
            },
          },
        ],
      }) as unknown as AuditManifest;

    it('shows the no-data note, never as a pass, when CrUX has no public record for this origin', () => {
      const manifest = measuredManifestWith({ available: false });
      const html = renderCoreWebVitalsTable(getStrings('en'), 9, 'en', manifest);
      expect(html).toContain('No public Chrome UX Report data');
      expect(html).not.toContain('INP, responsiveness');
    });

    it('shows the same no-data note when CrUX was never queried (no manifest field at all, e.g. CRUX_API_KEY unset)', () => {
      const manifest = measuredManifestWith(undefined);
      const html = renderCoreWebVitalsTable(getStrings('en'), 9, 'en', manifest);
      expect(html).toContain('No public Chrome UX Report data');
    });

    it('renders real-user LCP, INP, and CLS with their own ratings when CrUX data is available', () => {
      const manifest = measuredManifestWith({
        available: true,
        lcp: { p75: 1200 },
        inp: { p75: 550 },
        cls: { p75: 0.3 },
      });
      const html = renderCoreWebVitalsTable(getStrings('en'), 9, 'en', manifest);
      expect(html).toContain('1.2 s'); // LCP good
      expect(html).toContain('550 ms'); // INP poor
      expect(html).toContain('0.3'); // CLS poor
      expect(html).toContain('Real-user data');
    });

    // 2026-08-22, La Corniche report review: a real report showed lab
    // LCP at 33.2s directly above real-user LCP at 4.1s with no
    // explanation, reading as a self-contradiction rather than two
    // deliberately different measurements.
    it('explains the lab-vs-real-user gap only when both a lab number and a real CrUX table actually render', () => {
      const manifest = measuredManifestWith({
        available: true,
        lcp: { p75: 1200 },
        inp: { p75: 550 },
        cls: { p75: 0.3 },
      });
      const html = renderCoreWebVitalsTable(getStrings('en'), 9, 'en', manifest);
      expect(html).toContain('A large gap between the values above and below is expected');
    });

    it('never shows the gap-explanation note when CrUX has no data to compare against', () => {
      const manifest = measuredManifestWith({ available: false });
      const html = renderCoreWebVitalsTable(getStrings('en'), 9, 'en', manifest);
      expect(html).not.toContain('A large gap between the values above and below is expected');
    });

    it('never shows the gap-explanation note when lab measurement did not complete at all, even if CrUX has data', async () => {
      const manifest = await loadSasFernandeManifest();
      const withCrux = {
        ...manifest,
        cruxFieldData: {
          available: true,
          lcp: { p75: 1200 },
          inp: { p75: 550 },
          cls: { p75: 0.3 },
        },
      } as AuditManifest;
      const html = renderCoreWebVitalsTable(getStrings('en'), 9, 'en', withCrux);
      expect(html).not.toContain('A large gap between the values above and below is expected');
    });

    it('still renders the real-user block even when lab measurement did not complete at all', async () => {
      const manifest = await loadSasFernandeManifest();
      const withCrux = { ...manifest, cruxFieldData: { available: false } } as AuditManifest;
      const html = renderCoreWebVitalsTable(getStrings('en'), 9, 'en', withCrux);
      expect(html).toContain('did not complete');
      expect(html).toContain('No public Chrome UX Report data');
    });
  });
});
