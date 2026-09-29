import { normalizeAudit, type AuditManifest, type ManifestPageEntry } from '@odysseus/core';
import { describe, expect, it } from 'vitest';
import { buildNormalizeAuditInput } from './normalize-audit-input.js';

const HOME = 'https://hotel.example/';
const FRENCH_ROOT = 'https://hotel.example/fr/';

function manifestPage(url: string): ManifestPageEntry {
  return { url, status: 'visited', depth: url === FRENCH_ROOT ? 0 : 1 } as ManifestPageEntry;
}

describe('buildNormalizeAuditInput (issue #502)', () => {
  it('anchors site-level findings to the homepage when the start URL is another page', () => {
    const manifest = {
      crawl: { startUrl: FRENCH_ROOT, homepageUrl: HOME, robotsTxtFound: true },
      cruxFieldData: { available: true, cls: { p75: 0.3 } },
    } as unknown as Pick<AuditManifest, 'crawl' | 'relativeLinkNestingSummary' | 'cruxFieldData'>;

    const input = buildNormalizeAuditInput({
      auditId: 'audit-1',
      startedAt: new Date('2026-09-25T00:00:00.000Z'),
      manifest,
      manifestPages: [manifestPage(FRENCH_ROOT), manifestPage(HOME)],
      pages: [{ url: FRENCH_ROOT }, { url: HOME }],
    });

    expect(input.crawl?.homepageUrl).toBe(HOME);
    const cls = normalizeAudit(input).find((finding) => finding.ruleId === 'crux-cls-poor');
    expect(cls?.pageUrls).toEqual([HOME]);
  });

  it('passes the sitemap check the URLs that answered 404 or 410 or served an error page', () => {
    const manifest = {
      crawl: { startUrl: HOME, homepageUrl: HOME, robotsTxtFound: true },
    } as unknown as Pick<AuditManifest, 'crawl' | 'relativeLinkNestingSummary' | 'cruxFieldData'>;
    const gone = 'https://hotel.example/en/accommodation';
    const removed = 'https://hotel.example/en/legal';
    const template = 'https://hotel.example/chambres/ancienne';
    const overloaded = 'https://hotel.example/offres';
    const input = buildNormalizeAuditInput({
      auditId: 'audit-1',
      startedAt: new Date('2026-09-25T00:00:00.000Z'),
      manifest,
      manifestPages: [
        manifestPage(HOME),
        { url: gone, status: 'http-error-status', httpStatus: 404 } as ManifestPageEntry,
        { url: removed, status: 'http-error-status', httpStatus: 410 } as ManifestPageEntry,
        { url: template, status: 'soft-error-page' } as ManifestPageEntry,
        { url: overloaded, status: 'http-error-status', httpStatus: 503 } as ManifestPageEntry,
      ],
      pages: [
        {
          url: HOME,
          sitemapCheck: {
            pageUrl: HOME,
            found: true,
            isSitemapIndex: false,
            entries: [],
            crawledUrls: [HOME],
            discoveredUrls: [HOME],
          },
        },
      ],
    });

    expect(input.pages[0]?.sitemapCheck?.deadUrls).toEqual([gone, removed, template]);
  });
});
