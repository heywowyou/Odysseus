import { describe, expect, it } from 'vitest';
import type { AuditManifest } from '@odysseus/core';
import { renderCoreWebVitalsTable } from './core-web-vitals-table.js';
import { getStrings } from '../strings/i18n.js';
import { loadSasFernandeManifest } from '../../test-fixtures.js';

function buildMeasurement(numericValue: number, displayValue: string) {
  return { score: 0.9, numericValue, displayValue };
}

describe('renderCoreWebVitalsTable', () => {
  it('renders the "not measured" fallback for the sas-fernande.fr capture, which predates coreWebVitals', async () => {
    const manifest = await loadSasFernandeManifest();
    const html = renderCoreWebVitalsTable(getStrings('en'), 'en', manifest);

    expect(html).toContain('Not measured');
    expect(html).not.toContain('undefined');
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

    const html = renderCoreWebVitalsTable(getStrings('en'), 'en', manifest);
    expect(html).toContain('1.8 s');
    expect(html).toContain('120 ms');
    expect(html).toContain('0.9 s');
    expect(html).toContain('2 s');
    expect(html).not.toContain('example.com/'); // no per-page URL column
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

    const html = renderCoreWebVitalsTable(getStrings('en'), 'en', manifest);
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

    const html = renderCoreWebVitalsTable(getStrings('en'), 'en', manifest);

    expect(html).toContain('poor');
    expect(html).toContain('good');
  });
});
