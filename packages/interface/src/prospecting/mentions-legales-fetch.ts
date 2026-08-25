/**
 * Orchestrates the "one or two requests" cheap stage of
 * docs/prospect-qualification.md section 5: homepage, then (if found) the
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
 * batches of sites (docs/prospect-qualification.md's own batching), so
 * skipping the check here would be a real politeness gap even though the
 * scanner's own crawler always applied it - non-negotiable rule 5 in
 * CLAUDE.md governs this fetch just as much as a full audit's crawl.
 */

import type { OriginLock } from '@odysseus/scanner';
import { findMentionsLegalesUrl, fetchRobotsRules, isAllowedByRobots } from '@odysseus/scanner';
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
    const robotsRules = await fetchRobotsRules(origin, options.userAgent, options.timeoutMs);
    const effectiveDelayMs = Math.max(options.crawlDelayMs, robotsRules.crawlDelayMs ?? 0);

    if (!isAllowedByRobots(robotsRules, new URL(siteUrl).pathname)) {
      return { homepageText: null, mentionsLegalesUrl: null, mentionsLegalesText: null };
    }

    await sleep(effectiveDelayMs);
    const homepage = await fetchPageText(siteUrl, options.timeoutMs, options.userAgent);
    if (!homepage) {
      return { homepageText: null, mentionsLegalesUrl: null, mentionsLegalesText: null };
    }

    const mentionsLegalesUrl = findMentionsLegalesUrl(homepage.anchorUrls);
    if (!mentionsLegalesUrl || !isAllowedByRobots(robotsRules, new URL(mentionsLegalesUrl).pathname)) {
      return { homepageText: homepage.bodyText, mentionsLegalesUrl: null, mentionsLegalesText: null };
    }

    // Politeness applies to both requests, not only the first - per
    // docs/prospect-qualification.md section 5, "two requests is not an
    // excuse to skip identification."
    await sleep(effectiveDelayMs);
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
