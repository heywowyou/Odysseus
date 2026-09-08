/**
 * Milestone 8: hreflang reciprocity. Like normalize-crawl.ts, this needs
 * every page's data at once rather than one page's own content, so it is
 * called once per audit from the normalize orchestrator, not per page.
 *
 * Lighthouse's own hreflang audit (seo category, not excluded) already
 * checks a single page's hreflang tags for presence and basic validity -
 * confirmed against a real haaitza.com Lighthouse result during the
 * milestone 8 build session. What it cannot check is reciprocity: page A
 * declaring an alternate at page B means nothing to a search engine
 * unless B also declares one back to A, and that requires knowing both
 * pages' hreflang sets at once, which a single-page audit never has.
 *
 * Only checked among pages this audit actually crawled. A hreflang
 * target outside crawl scope (a different subdomain, a page beyond
 * maxPages) is not fetched to verify it - that would mean an
 * uninvited request to a URL this audit was never asked to crawl, the
 * same reasoning CLAUDE.md's crawling-politeness rules already apply
 * elsewhere. Such links are simply not checked, not assumed broken.
 */

import type { FindingCandidate } from './candidate.js';
import { severityFromCustom } from './severity.js';

export const HREFLANG_NO_RETURN_LINK_RULE_ID = 'hreflang-no-return-link';
export const HREFLANG_MISSING_RULE_ID = 'hreflang-missing';

/** A first path segment that is a language code, optionally with a region
 *  suffix ("/fr/...", "/pt-pt/..."). Mirrors scanner's
 *  isLanguageHomepagePath deliberately by value, not by import:
 *  packages/core must not depend on packages/scanner, the same standing
 *  reason manifest.ts duplicates CrawledPageStatus. */
const LANGUAGE_PATH_PREFIX = /^\/([a-z]{2}(?:-[a-z]{2})?)(?:\/|$)/i;

export function languagePrefixOf(url: string): string | undefined {
  try {
    return new URL(url).pathname.match(LANGUAGE_PATH_PREFIX)?.[1]?.toLowerCase();
  } catch {
    return undefined;
  }
}

export interface HreflangPageInput {
  url: string;
  hreflangLinks: Array<{ lang: string; href: string }>;
}

function normalizeUrl(href: string, base: string): string {
  try {
    const url = new URL(href, base);
    url.hash = '';
    return url.href.replace(/\/$/, '');
  } catch {
    return href;
  }
}

export function extractHreflangCandidates(
  pages: readonly HreflangPageInput[],
  siteLevelPageUrl?: string,
): FindingCandidate[] {
  const candidates: FindingCandidate[] = [];
  const pagesByUrl = new Map(pages.map((page) => [normalizeUrl(page.url, page.url), page]));

  for (const page of pages) {
    const sourceUrl = normalizeUrl(page.url, page.url);

    for (const link of page.hreflangLinks) {
      const targetUrl = normalizeUrl(link.href, page.url);
      if (targetUrl === sourceUrl) continue; // a self-referencing hreflang tag needs no return link

      const targetPage = pagesByUrl.get(targetUrl);
      if (!targetPage) continue; // outside crawl scope - not verifiable without an uninvited fetch

      const targetLinksBack = targetPage.hreflangLinks.some(
        (targetLink) => normalizeUrl(targetLink.href, targetPage.url) === sourceUrl,
      );
      if (targetLinksBack) continue;

      candidates.push({
        source: 'custom',
        ruleId: HREFLANG_NO_RETURN_LINK_RULE_ID,
        category: 'seo',
        severity: severityFromCustom(HREFLANG_NO_RETURN_LINK_RULE_ID),
        wcagCriteria: [],
        title: 'hreflang link has no return link',
        description: `This page declares hreflang="${link.lang}" pointing to ${link.href}, but that page does not declare a matching hreflang link back to this one. Search engines can ignore hreflang annotations that are not reciprocated.`,
        pageUrl: page.url,
        // Distinguishes each (source, target-language) pair the same
        // way broken-internal-link's derived selector does, so two
        // different missing return links on one page do not collapse
        // into a single finding under the dedupe key's empty-selector
        // default.
        element: {
          pageUrl: page.url,
          selector: `link[rel="alternate"][hreflang="${link.lang}"]`,
          snippet: `hreflang="${link.lang}" href="${link.href}"`,
        },
        rawEvidenceForPage: { lang: link.lang, targetUrl: link.href },
      });
    }
  }

  const missing = detectMissingHreflang(pages, siteLevelPageUrl);
  if (missing) candidates.push(missing);

  return candidates;
}

/**
 * B1.4 (2026-08-24, Domaine Lagnonu). `hreflang-missing` had a severity
 * mapping (severity.ts) and remediation copy
 * (reference-stats/recommendation-templates.ts) since milestone 8, and no
 * emitter anywhere in the codebase - so a real trilingual site publishing
 * zero hreflang on all 43 pages received no finding about it. Same class
 * of gap as trade-off 28's LCEN regime: complete, unread, unrendered.
 *
 * Fires only on TOTAL absence across a site that demonstrably serves more
 * than one language, evidenced by its own URL structure (two or more
 * distinct language path prefixes among crawled pages). Partial or
 * non-reciprocal hreflang is already the reciprocity check's job above,
 * and Lighthouse's own hreflang audit covers single-page validity.
 *
 * The multilingual signal is the site's own URLs, never an inference from
 * page content or a guess that /en/x translates /x - trade-off 24
 * rejected exactly that prefix-guessing for translation clustering, and
 * the same reasoning applies here. A monolingual site produces no prefixes
 * and therefore no finding, which is the common case.
 *
 * Site-level, attributed to the shallowest crawled page, following the
 * llms-txt/sitemap precedent for a fact that is true of the site rather
 * than of one page.
 */
function detectMissingHreflang(
  pages: readonly HreflangPageInput[],
  siteLevelPageUrl?: string,
): FindingCandidate | undefined {
  if (pages.length === 0) return undefined;
  if (pages.some((page) => page.hreflangLinks.length > 0)) return undefined;

  const prefixes = new Set<string>();
  for (const page of pages) {
    const prefix = languagePrefixOf(page.url);
    if (prefix) prefixes.add(prefix);
  }
  if (prefixes.size < 2) return undefined;

  const languages = [...prefixes].sort();
  // Attributed to the site-level anchor resolveSiteLevelAnchorUrl picked
  // (normalize.ts): the start URL when it was itself content-checked, else
  // the content-checked page closest to the homepage (issue #101). The raw
  // start URL alone could be a page no scanner ever ran on, and pages[0]
  // is whatever the crawl happened to reach first - on a real trilingual
  // site it once anchored this finding to an English activities page.
  const anchorUrl = siteLevelPageUrl ?? pages[0]!.url;

  return {
    source: 'custom',
    ruleId: HREFLANG_MISSING_RULE_ID,
    category: 'seo',
    severity: severityFromCustom(HREFLANG_MISSING_RULE_ID),
    wcagCriteria: [],
    title: 'No hreflang annotations on a multilingual site',
    description: `This site serves content under ${languages.length} language paths (${languages.join(', ')}), but no page declares an hreflang annotation. Search engines then have no declared relationship between the language versions of a page, and may show the wrong language to a visitor or treat the versions as competing duplicates.`,
    pageUrl: anchorUrl,
    element: {
      pageUrl: anchorUrl,
      selector: 'head',
      snippet: 'no <link rel="alternate" hreflang="..."> found on any crawled page',
    },
    rawEvidenceForPage: { languagePrefixes: languages, pagesChecked: pages.length },
  };
}
