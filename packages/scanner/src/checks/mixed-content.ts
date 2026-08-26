/**
 * Milestone 8: mixed-content raw-fact extraction. No new page load and no
 * request/response listener attached before navigation (the existing
 * onRenderedPage hook only runs after renderDiff's own goto() has already
 * completed, too late to catch requests with a listener). Instead reads
 * the Resource Timing API, which the browser keeps queryable after load
 * for every subresource already fetched - exactly the data this needs,
 * with nothing extra to set up beforehand.
 */

import type { Page } from 'playwright';

export interface MixedContentExtraction {
  pageUrl: string;
  isPageSecure: boolean;
  /** Deduplicated http:// subresource URLs found on a secure page.
   *  Always empty when the page itself is not served over https - an
   *  insecure page loading insecure resources is not mixed content. */
  insecureResourceUrls: string[];
}

export async function extractMixedContentResources(
  page: Page,
  pageUrl: string,
): Promise<MixedContentExtraction> {
  const isPageSecure = new URL(pageUrl).protocol === 'https:';
  if (!isPageSecure) {
    return { pageUrl, isPageSecure, insecureResourceUrls: [] };
  }

  const resourceUrls = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((entry) => entry.name),
  );

  const insecureResourceUrls = [
    ...new Set(resourceUrls.filter((url) => url.startsWith('http://'))),
  ];

  return { pageUrl, isPageSecure, insecureResourceUrls };
}
