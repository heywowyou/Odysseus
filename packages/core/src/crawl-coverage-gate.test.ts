import { describe, expect, it } from 'vitest';
import {
  assertSufficientCrawlCoverage,
  assessCrawlCoverage,
  MAX_CRAWL_FAILURE_SHARE,
} from './crawl-coverage-gate.js';

function pages(visitedCount: number, failedCount: number, httpStatus = 503) {
  return [
    ...Array.from({ length: visitedCount }, () => ({ status: 'visited' })),
    ...Array.from({ length: failedCount }, () => ({ status: 'http-error-status', httpStatus })),
  ];
}

describe('crawl coverage gate', () => {
  it('allows a failure share exactly at the threshold', () => {
    const input = { pages: pages(7, 3) };

    expect(assessCrawlCoverage(input).reasonCodes).toEqual([]);
    expect(() => assertSufficientCrawlCoverage(input)).not.toThrow();
  });

  it('stops a mass HTTP rejection with actionable inventory facts', () => {
    const input = { pages: pages(2, 8) };

    const assessment = assessCrawlCoverage(input);

    expect(assessment.failureShare).toBeGreaterThan(MAX_CRAWL_FAILURE_SHARE);
    expect(assessment.failedHttpStatusCounts).toEqual(new Map([[503, 8]]));
    expect(assessment.reasonCodes).toEqual(['crawl-failure-share']);
    expect(() => assertSufficientCrawlCoverage(input)).toThrow(
      /8 of 10 inventoried URLs failed.*8 HTTP 503.*Slow the crawl, request an allowlist/i,
    );
  });

  it('stops an unexplained large sitemap coverage gap even when URL errors are absent', () => {
    const input = {
      pages: pages(3, 0),
      sitemapCoverage: {
        declaredPageCount: 20,
        eligiblePageCount: 20,
        scannedPageCount: 3,
        filteredPageCount: 0,
        capOmittedPageCount: 0,
        failedSitemapCount: 0,
      },
    };

    expect(assessCrawlCoverage(input).reasonCodes).toEqual(['sitemap-coverage']);
    expect(() => assertSufficientCrawlCoverage(input)).toThrow(/sitemap also shows/i);
  });

  it('does not treat a sitemap gap explained by a crawl cap as a failure', () => {
    const input = {
      pages: pages(3, 0),
      sitemapCoverage: {
        declaredPageCount: 20,
        eligiblePageCount: 20,
        scannedPageCount: 3,
        filteredPageCount: 0,
        capOmittedPageCount: 17,
        failedSitemapCount: 0,
      },
    };

    expect(assessCrawlCoverage(input).reasonCodes).toEqual([]);
  });
});
