import { describe, expect, it } from 'vitest';
import {
  assertSufficientCrawlCoverage,
  assessCrawlCoverage,
  HostStoppedAnsweringError,
  isCrawlCoverageGateMessage,
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
      /8 of 10 inventoried URLs failed.*8 HTTP 503.*Slow the crawl, request an allowlist.*per-job crawl delay and scan concurrency options.*never speed it up/i,
    );
  });

  it('counts blocked challenge and rate-limit pages, but not robots exclusions', () => {
    const majorityBlocked = {
      pages: [
        ...Array.from({ length: 2 }, () => ({ status: 'visited' })),
        ...Array.from({ length: 8 }, () => ({ status: 'blocked', httpStatus: 429 })),
        { status: 'skipped-robots' },
      ],
    };
    const minorityBlocked = {
      pages: [
        ...Array.from({ length: 8 }, () => ({ status: 'visited' })),
        ...Array.from({ length: 2 }, () => ({ status: 'blocked', httpStatus: 403 })),
        { status: 'skipped-robots' },
      ],
    };

    expect(assessCrawlCoverage(majorityBlocked).failedUrlCount).toBe(8);
    expect(assessCrawlCoverage(majorityBlocked).reasonCodes).toEqual(['crawl-failure-share']);
    expect(assessCrawlCoverage(minorityBlocked).failedUrlCount).toBe(2);
    expect(assessCrawlCoverage(minorityBlocked).reasonCodes).toEqual([]);
  });

  // domaine-d-auriac, 2026-09-28: 140 of 290 inventoried URLs answered 404
  // while every sampled sitemap URL answered 200. Dead links are the site's
  // own fact; the audit that would report them must not be refused.
  it('leaves definite 404 and 410 answers out of the failure share', () => {
    const input = {
      pages: [
        ...pages(150, 130, 404),
        ...Array.from({ length: 10 }, () => ({ status: 'http-error-status', httpStatus: 410 })),
      ],
    };

    const assessment = assessCrawlCoverage(input);

    expect(assessment.deadUrlCount).toBe(140);
    expect(assessment.failedUrlCount).toBe(0);
    expect(assessment.reasonCodes).toEqual([]);
  });

  it('still counts real pushback beside dead links, over the pages that are not dead', () => {
    const input = {
      pages: [
        ...pages(60, 40, 404),
        ...Array.from({ length: 40 }, () => ({ status: 'blocked', httpStatus: 429 })),
      ],
    };

    const assessment = assessCrawlCoverage(input);

    expect(assessment.deadUrlCount).toBe(40);
    expect(assessment.failedUrlCount).toBe(40);
    expect(assessment.failureShare).toBe(0.4);
    expect(() => assertSufficientCrawlCoverage(input)).toThrow(
      /40 of 100 inventoried URLs failed \(40%\), not counting 40 URLs that answered a definite 404 or 410, including 40 HTTP 429/,
    );
  });

  it('counts 404s as failures when the site answers 404 to more URLs than it serves', () => {
    const input = { pages: pages(10, 90, 404) };

    const assessment = assessCrawlCoverage(input);

    expect(assessment.deadUrlCount).toBe(0);
    expect(assessment.failedUrlCount).toBe(90);
    expect(assessment.reasonCodes).toEqual(['crawl-failure-share']);
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

  // Alexander Park: the sitemap lists 7 English URLs that answer 404, and
  // the crawl deliberately skips the /en language homepage. Both were
  // reached, so the 14 scanned pages cover everything the site really has.
  it('leaves sitemap entries that answered 404 or were skipped by design out of the gap', () => {
    const input = {
      pages: pages(49, 7, 404),
      sitemapCoverage: {
        declaredPageCount: 22,
        eligiblePageCount: 22,
        scannedPageCount: 14,
        settledUnscannedPageCount: 8,
        filteredPageCount: 0,
        capOmittedPageCount: 0,
        failedSitemapCount: 0,
      },
    };

    expect(assessCrawlCoverage(input).reasonCodes).toEqual([]);
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

describe('host stopped answering stop', () => {
  it('says a slower crawl will not help, unlike the coverage gate', () => {
    const error = new HostStoppedAnsweringError({
      answeredNavigationCount: 32,
      refusedNavigationCount: 5,
      errorCode: 'ERR_EMPTY_RESPONSE',
    });

    expect(error.message).toContain(
      'after answering 32 pages, the site closed the next 5 requests without a response (ERR_EMPTY_RESPONSE)',
    );
    expect(error.message).toContain('a slower crawl will not help');
    expect(error.message).toContain('allowlist the crawler');
    expect(isCrawlCoverageGateMessage(error.message)).toBe(false);
  });

  it('describes a host that refused the crawl from its first request', () => {
    const error = new HostStoppedAnsweringError({
      answeredNavigationCount: 0,
      refusedNavigationCount: 5,
      errorCode: 'ERR_CONNECTION_REFUSED',
    });

    expect(error.message).toContain(
      "the site answered none of the crawl's requests: the first 5 requests were closed without a response (ERR_CONNECTION_REFUSED)",
    );
  });
});
