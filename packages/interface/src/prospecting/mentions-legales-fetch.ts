/**
 * Orchestrates the "one or two requests" cheap stage of
 * docs/rules/prospect-qualification.md section 5: homepage, then (if found) the
 * mentions-legales page, both plain HTTP, both behind the same
 * per-origin politeness the rest of the tool applies. Reuses
 * @odysseus/scanner's findMentionsLegalesUrl verbatim (not a
 * reimplementation) so this pipeline's notion of "the mentions-legales
 * page" can never disagree with the scanner's own.
 *
 * robots.txt is fetched and honored the same way crawl.ts does for the
 * audit crawler: a disallowed path is skipped instead of fetched, and the
 * declared Crawl-delay (if any) raises the floor on the delay between
 * requests. Prospect ingestion drives this against large unsolicited
 * batches of sites (docs/rules/prospect-qualification.md's own batching), so
 * skipping the check here would be a real politeness gap even though the
 * scanner's own crawler always applied it - non-negotiable rule 5 in
 * CLAUDE.md governs this fetch just as much as a full audit's crawl.
 */

import type { OriginLock } from '@odysseus/scanner';
import { findMentionsLegalesUrl, fetchRobotsRules, isAllowedByRobots } from '@odysseus/scanner';
import { fetchPageText } from './fetch-candidate-page.js';
import { sleep } from './sleep.js';

/** Why homepageText ended up null. Distinguishes a site that declined to
 *  be crawled (a legitimate, polite outcome) from one this fetch genuinely
 *  could not reach - milestone 9a never needed the difference (a prospect
 *  either has a readable SIREN or does not), but milestone 10's benchmark
 *  cohort measures yield against a small, high-profile list where the two
 *  read very differently. Null whenever homepageText is non-null. */
export type FetchFailureReason = 'robots-disallowed' | 'homepage-unreachable' | null;

export interface CandidateFetchResult {
  homepageText: string | null;
  /** The homepage's own resolved URL after any redirect chain, e.g. a
   *  bare apex landing on a locale subdomain. Null only when the homepage
   *  fetch itself failed. Milestone 10's benchmark cohort uses this to
   *  pin a storefront host at qualification time instead of hand-picking
   *  one in advance. */
  resolvedHomepageUrl: string | null;
  mentionsLegalesUrl: string | null;
  mentionsLegalesText: string | null;
  failureReason: FetchFailureReason;
}

export async function fetchMentionsLegalesData(
  siteUrl: string,
  originLock: OriginLock,
  options: { crawlDelayMs: number; userAgent: string; timeoutMs: number },
): Promise<CandidateFetchResult> {
  const origin = new URL(siteUrl).origin;
  const release = await originLock.acquire(origin);

  try {
    const robotsRules = await fetchRobotsRules(origin, options.userAgent, options.timeoutMs);
    const effectiveDelayMs = Math.max(options.crawlDelayMs, robotsRules.crawlDelayMs ?? 0);

    if (!isAllowedByRobots(robotsRules, new URL(siteUrl).pathname)) {
      return {
        homepageText: null,
        resolvedHomepageUrl: null,
        mentionsLegalesUrl: null,
        mentionsLegalesText: null,
        failureReason: 'robots-disallowed',
      };
    }

    await sleep(effectiveDelayMs);
    const homepage = await fetchPageText(siteUrl, options.timeoutMs, options.userAgent);
    if (!homepage) {
      return {
        homepageText: null,
        resolvedHomepageUrl: null,
        mentionsLegalesUrl: null,
        mentionsLegalesText: null,
        failureReason: 'homepage-unreachable',
      };
    }

    const mentionsLegalesUrl = findMentionsLegalesUrl(homepage.anchorUrls);
    if (
      !mentionsLegalesUrl ||
      !isAllowedByRobots(robotsRules, new URL(mentionsLegalesUrl).pathname)
    ) {
      return {
        homepageText: homepage.bodyText,
        resolvedHomepageUrl: homepage.url,
        mentionsLegalesUrl: null,
        mentionsLegalesText: null,
        failureReason: null,
      };
    }

    // Politeness applies to both requests, not only the first - per
    // docs/rules/prospect-qualification.md section 5, "two requests is not an
    // excuse to skip identification."
    await sleep(effectiveDelayMs);
    const mentionsLegales = await fetchPageText(
      mentionsLegalesUrl,
      options.timeoutMs,
      options.userAgent,
    );

    return {
      homepageText: homepage.bodyText,
      resolvedHomepageUrl: homepage.url,
      mentionsLegalesUrl,
      mentionsLegalesText: mentionsLegales?.bodyText ?? null,
      failureReason: null,
    };
  } finally {
    release();
  }
}
