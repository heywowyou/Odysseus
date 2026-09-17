import { describe, expect, it } from 'vitest';
import { countCrawlExclusions } from './scan-site.js';

describe('countCrawlExclusions', () => {
  it('counts every navigated page that is not content-checked, by reason', () => {
    const statuses = [
      'visited',
      'visited',
      'discovered-not-scanned',
      'skipped-external-redirect',
      'skipped-non-html',
      'skipped-non-html',
      'http-error-status',
      'error',
      'skipped-robots',
    ] as const;
    expect(countCrawlExclusions(statuses.map((status) => ({ status })))).toEqual({
      discoveryOnly: 1,
      externalRedirect: 1,
      nonHtml: 2,
      httpError: 1,
      error: 1,
    });
  });
});
