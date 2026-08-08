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

export function extractHreflangCandidates(pages: readonly HreflangPageInput[]): FindingCandidate[] {
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

  return candidates;
}
