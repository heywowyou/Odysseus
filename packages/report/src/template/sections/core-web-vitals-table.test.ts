import { describe, expect, it } from 'vitest';
import type { AuditManifest } from '@odysseus/core';
import {
  hasMeasuredCoreWebVitals,
  divergentLabLcp,
  renderCoreWebVitalsTable,
  truncatePagePath,
  worstForMetric,
} from './core-web-vitals-table.js';
import { getStrings } from '../strings/i18n.js';
import { loadSmallSiteManifest } from '../../test-fixtures.js';

function buildMeasurement(numericValue: number, displayValue: string) {
  return { score: 0.9, numericValue, displayValue };
}

describe('renderCoreWebVitalsTable', () => {
  // report-feedback-large-rule-families.md item 0.3 [REGRESSION of this test's own
  // prior expectation]: a table of 5 "Non mesuré" rows, thresholds, and a
  // worst-page footnote that has nothing to explain reads as real data to
  // a client - a real report shipped exactly this table (Lighthouse
  // failed on all 18 pages) with the cover still claiming Performance was
  // audited. Whether nothing was ever recorded (small-site.test's older
  // capture, before coreWebVitals existed) or Lighthouse genuinely failed
  // on every page of a fresh scan, the section now states plainly that
  // measurement did not complete instead of rendering the unmeasured
  // table at all.
  it('states plainly that measurement did not complete, instead of a table of "Non mesuré" rows, for the small-site.test capture (predates coreWebVitals)', async () => {
    const manifest = await loadSmallSiteManifest();
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

  // 2026-08-22, Large Rule Families report review: a real report stated medians
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

  it('leaves a redirect out of the count, the medians and the worst page, since its target is already measured', () => {
    const page = (url: string, status: string, lcpMs: number) => ({
      url,
      pageDir: `pages/${url.length}`,
      depth: 0,
      status,
      errors: {},
      coreWebVitals: {
        lcp: buildMeasurement(lcpMs, ''),
        cls: buildMeasurement(0, '0'),
        tbt: buildMeasurement(0, '0 ms'),
        fcp: buildMeasurement(0, '0 s'),
        speedIndex: buildMeasurement(0, '0 s'),
      },
    });
    const manifest = {
      siteUrl: 'https://example.com/',
      pages: [
        page('https://example.com/fr/', 'visited', 2000),
        page('https://example.com/fr/chambres', 'visited', 3000),
        page('https://example.com/fr', 'redirect-interstitial', 9000),
      ],
    } as unknown as AuditManifest;

    const html = renderCoreWebVitalsTable(getStrings('fr'), 9, 'fr', manifest);

    expect(html).toContain('agrégées sur 2 pages.');
    expect(html).toContain('2,5 s');
    expect(html).not.toContain('9 s');
  });

  it('leaves challenge pages, error templates and off-site stubs out of the medians', () => {
    const page = (url: string, status: string, lcpMs: number) => ({
      url,
      pageDir: `pages/${url.length}`,
      depth: 1,
      status,
      errors: {},
      coreWebVitals: {
        lcp: buildMeasurement(lcpMs, ''),
        cls: buildMeasurement(0, '0'),
        tbt: buildMeasurement(0, '0 ms'),
        fcp: buildMeasurement(0, '0 s'),
        speedIndex: buildMeasurement(0, '0 s'),
      },
    });
    const manifest = {
      siteUrl: 'https://example.com/',
      pages: [
        page('https://example.com/', 'visited', 2000),
        page('https://example.com/chambres', 'visited', 3000),
        page('https://example.com/es/room', 'blocked', 27000),
        page('https://example.com/erreur-404', 'soft-error-page', 21000),
        page('https://example.com/book', 'skipped-external-redirect', 19000),
      ],
    } as unknown as AuditManifest;

    const html = renderCoreWebVitalsTable(getStrings('fr'), 9, 'fr', manifest);

    expect(html).toContain('agrégées sur 2 pages.');
    expect(html).toContain('2,5 s');
    expect(html).not.toMatch(/(19|21|27) s/);
  });

  // Issue #28: a single measured page used to print "aggregated across 1 pages".
  it('agrees the intro sentence for a single measured page, in both languages', () => {
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

    const htmlEn = renderCoreWebVitalsTable(getStrings('en'), 9, 'en', manifest);
    expect(htmlEn).toContain('aggregated across 1 page.');
    expect(htmlEn).not.toContain('aggregated across 1 pages');

    const htmlFr = renderCoreWebVitalsTable(getStrings('fr'), 9, 'fr', manifest);
    expect(htmlFr).toContain('agrégées sur 1 page.');
    expect(htmlFr).not.toContain('agrégées sur 1 pages');
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
          // 46s LCP, matching the real multi-page homepage - must read as
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
    expect(html).toContain('3 900 ms'); // worst page, in its own column (fr no-break space)
    expect(html).toContain('href="https://example.com/3900"');
    expect(html).toContain('>/3900<');
    expect(html).toContain('Pire page');
  });

  it('breaks equal worst-value ties by URL', () => {
    const pages = [
      { url: 'https://example.com/z', coreWebVitals: { lcp: buildMeasurement(3000, '3 s') } },
      { url: 'https://example.com/a', coreWebVitals: { lcp: buildMeasurement(3000, '3 s') } },
    ] as unknown as AuditManifest['pages'];
    expect(worstForMetric(pages, 'lcp')).toEqual({
      value: 3000,
      pageUrl: 'https://example.com/a',
    });
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
      expect(html).toContain('Median value');
      expect(html.split('75th percentile').length - 1).toBe(1);
    });

    // 2026-08-22, Large Rule Families report review: a real report showed lab
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
      expect(html).toContain(
        'A large gap between these real-user values and the lab measurements further down is expected',
      );
    });

    // Issue #334: a real report printed a 20.9 s lab LCP median as the
    // site's typical page while visitors' own p75 was 2.4 s, rated good.
    it('flags a lab LCP median far above a good real-user LCP instead of presenting it plainly', () => {
      const manifest = measuredManifestWith({ available: true, lcp: { p75: 400 } });
      expect(divergentLabLcp(manifest)).toEqual({ labMedianMs: 1800, fieldP75Ms: 400 });
      const fr = renderCoreWebVitalsTable(getStrings('fr'), 9, 'fr', manifest);
      expect(fr).toContain('data-lab-lcp-divergence');
      expect(fr).toContain('1,8 s *');
      const en = renderCoreWebVitalsTable(getStrings('en'), 9, 'en', manifest);
      expect(en).toContain('more than four times the value measured for your real visitors');
    });

    it('does not flag an ordinary lab-versus-field gap, or a slow real-user LCP', () => {
      expect(divergentLabLcp(measuredManifestWith({ available: true, lcp: { p75: 1200 } }))).toBe(
        null,
      );
      const slowField = measuredManifestWith({ available: true, lcp: { p75: 5000 } });
      expect(divergentLabLcp(slowField)).toBe(null);
      expect(renderCoreWebVitalsTable(getStrings('fr'), 9, 'fr', slowField)).not.toContain(
        'data-lab-lcp-divergence',
      );
    });

    // Issue #104: the field-data intro pointed at "the lab measurements
    // above" while the lab table renders below the field table on the same
    // page, in every report and both languages. A positional word in a
    // fixed template is wrong whenever the sections reorder, so the intro
    // names the lab source instead of pointing at it.
    it('names the Lighthouse lab source instead of pointing at it by position, in both languages (issue #104)', () => {
      const manifest = measuredManifestWith({
        available: true,
        lcp: { p75: 1200 },
        inp: { p75: 550 },
        cls: { p75: 0.3 },
      });
      const en = renderCoreWebVitalsTable(getStrings('en'), 9, 'en', manifest);
      expect(en).toContain('in addition to the Lighthouse lab measurements');
      expect(en).not.toContain('measurements above');
      const fr = renderCoreWebVitalsTable(getStrings('fr'), 9, 'fr', manifest);
      expect(fr).toContain('mesures de laboratoire Lighthouse');
      expect(fr).not.toContain('mesures de laboratoire ci-dessus');
      // Issue #320: both tables sit below the gap note, so it no longer
      // points "above and below".
      expect(fr).toContain('les mesures de laboratoire présentées plus bas');
      expect(fr).not.toContain('ci-dessus et ci-dessous');
    });

    it('leads with field data and keeps the simulated lab values as the diagnostic below it', () => {
      const manifest = measuredManifestWith({
        available: true,
        lcp: { p75: 2427 },
        inp: { p75: 234 },
        cls: { p75: 0.36 },
      });
      const html = renderCoreWebVitalsTable(getStrings('en'), 9, 'en', manifest);
      expect(html.indexOf('Real-user data')).toBeLessThan(html.indexOf('Median values aggregated'));
      expect(html).toContain('2.4 s');
      expect(html).toContain('1.8 s');
    });

    it('labels the Lighthouse note and table after the real-user table, in both languages', () => {
      const manifest = measuredManifestWith({
        available: true,
        lcp: { p75: 2427 },
        inp: { p75: 234 },
        cls: { p75: 0.36 },
      });
      for (const language of ['en', 'fr'] as const) {
        const strings = getStrings(language);
        const html = renderCoreWebVitalsTable(strings, 9, language, manifest);
        const labNote = strings.coreWebVitals.labIntroTemplate.replace('{pages}', '1 page');

        expect(html.indexOf(strings.coreWebVitals.realUserValueColumnLabel)).toBeLessThan(
          html.indexOf(strings.coreWebVitals.labHeading),
        );
        expect(html.indexOf(strings.coreWebVitals.labHeading)).toBeLessThan(html.indexOf(labNote));
        expect(html.indexOf(labNote)).toBeLessThan(
          html.indexOf(
            strings.coreWebVitals.valueColumnLabel,
            html.indexOf(labNote) + labNote.length,
          ),
        );
      }
    });

    it('never shows the gap-explanation note when CrUX has no data to compare against', () => {
      const manifest = measuredManifestWith({ available: false });
      const html = renderCoreWebVitalsTable(getStrings('en'), 9, 'en', manifest);
      expect(html).not.toContain(
        'A large gap between these real-user values and the lab measurements further down is expected',
      );
    });

    it('never shows the gap-explanation note when lab measurement did not complete at all, even if CrUX has data', async () => {
      const manifest = await loadSmallSiteManifest();
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
      expect(html).not.toContain(
        'A large gap between these real-user values and the lab measurements further down is expected',
      );
    });

    it('still renders the real-user block even when lab measurement did not complete at all', async () => {
      const manifest = await loadSmallSiteManifest();
      const withCrux = { ...manifest, cruxFieldData: { available: false } } as AuditManifest;
      const html = renderCoreWebVitalsTable(getStrings('en'), 9, 'en', withCrux);
      expect(html).toContain('did not complete');
      expect(html).toContain('No public Chrome UX Report data');
    });
  });
});

describe('truncatePagePath (issue #320)', () => {
  it('keeps a path that fits the worst-page column whole', () => {
    expect(truncatePagePath('/en/rooms-and-suites')).toBe('/en/rooms-and-suites');
  });

  it('cuts the middle of a longer path, keeping its start and its end', () => {
    const out = truncatePagePath('/pt-pt/os-restaurantes/menu-de-degustacao');
    expect(out).toHaveLength(24);
    expect(out.startsWith('/pt-pt/')).toBe(true);
    expect(out.endsWith('degustacao')).toBe(true);
    expect(out).toContain('…');
  });
});
