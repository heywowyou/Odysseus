/**
 * Orchestrates the "one or two requests" cheap stage of
 * docs/prospect-qualification.md section 5: homepage, then (if found) the
 * mentions-legales page, both plain HTTP, both behind the same
 * per-origin politeness the rest of the tool applies. Reuses
 * @odysseus/scanner's findMentionsLegalesUrl verbatim (not a
 * reimplementation) so this pipeline's notion of "the mentions-legales
 * page" can never disagree with the scanner's own.
 */

import type { OriginLock } from '@odysseus/scanner';
import { findMentionsLegalesUrl } from '@odysseus/scanner';
import { fetchPageText } from './fetch-candidate-page.js';
import { sleep } from './sleep.js';

export interface CandidateFetchResult {
  homepageText: string | null;
  mentionsLegalesUrl: string | null;
  mentionsLegalesText: string | null;
}

export async function fetchMentionsLegalesData(
  siteUrl: string,
  originLock: OriginLock,
  options: { crawlDelayMs: number; userAgent: string; timeoutMs: number },
): Promise<CandidateFetchResult> {
  const origin = new URL(siteUrl).origin;
  const release = await originLock.acquire(origin);

  try {
    await sleep(options.crawlDelayMs);
    const homepage = await fetchPageText(siteUrl, options.timeoutMs, options.userAgent);
    if (!homepage) {
      return { homepageText: null, mentionsLegalesUrl: null, mentionsLegalesText: null };
    }

    const mentionsLegalesUrl = findMentionsLegalesUrl(homepage.anchorUrls);
    if (!mentionsLegalesUrl) {
      return { homepageText: homepage.bodyText, mentionsLegalesUrl: null, mentionsLegalesText: null };
    }

    // Politeness applies to both requests, not only the first - per
    // docs/prospect-qualification.md section 5, "two requests is not an
    // excuse to skip identification."
    await sleep(options.crawlDelayMs);
    const mentionsLegales = await fetchPageText(mentionsLegalesUrl, options.timeoutMs, options.userAgent);

    return {
      homepageText: homepage.bodyText,
      mentionsLegalesUrl,
      mentionsLegalesText: mentionsLegales?.bodyText ?? null,
    };
  } finally {
    release();
  }
}
