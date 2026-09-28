import type { ManifestPageEntry } from '../types/manifest.js';

/**
 * Plan 075 I1. With the audit browser presenting French (trade-off 115), a
 * site that redirects by browser language (WPML's browser-language
 * redirect) sends our browser from each English or Italian page to its
 * French translation. write-audit records those pages as
 * 'redirect-interstitial', and the sitemap rule then told Grand Hôtel des
 * Alpes its sitemap listed 114 redirected URLs, 74 of which were ordinary
 * translations that answer 200 to their own visitors.
 *
 * The evidence is the landing page's own declaration: when the page we
 * landed on lists the requested URL among its hreflang or language-switcher
 * alternates, the redirect only chose a language. A slug rename
 * (`/fr/chambres/x` to `/fr/rooms/x`) or a plugin object sent to the home
 * page is not listed as an alternate and stays a redirect. Measured on the
 * 22 latest VPS audits on 2026-09-28: 74 pages on grandhoteldesalpes, none
 * anywhere else.
 */

/** The language alternates one scanned page declares, as absolute URLs. */
export interface PageLanguageAlternates {
  pageUrl: string;
  alternateUrls: readonly string[];
}

function comparableUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    url.hash = '';
    url.search = '';
    const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/u, '') : url.pathname;
    return `${url.protocol}//${url.host.toLowerCase()}${path}`;
  } catch {
    return undefined;
  }
}

/** Returns the entries with each qualifying 'redirect-interstitial'
 *  re-marked 'language-redirect'. Every other entry is returned unchanged,
 *  so a stored manifest refreshed without alternates keeps its statuses. */
export function markLanguageRedirects(
  entries: readonly ManifestPageEntry[],
  alternates: readonly PageLanguageAlternates[],
): ManifestPageEntry[] {
  const alternatesByPage = new Map<string, Set<string>>();
  for (const { pageUrl, alternateUrls } of alternates) {
    const page = comparableUrl(pageUrl);
    if (page === undefined) continue;
    const set = alternatesByPage.get(page) ?? new Set<string>();
    for (const alternate of alternateUrls) {
      const comparable = comparableUrl(alternate);
      if (comparable !== undefined && comparable !== page) set.add(comparable);
    }
    alternatesByPage.set(page, set);
  }

  return entries.map((entry) => {
    if (entry.status !== 'redirect-interstitial' || entry.redirectTargetUrl === undefined) {
      return entry;
    }
    const source = comparableUrl(entry.url);
    const target = comparableUrl(entry.redirectTargetUrl);
    if (source === undefined || target === undefined || source === target) return entry;
    return alternatesByPage.get(target)?.has(source) === true
      ? { ...entry, status: 'language-redirect' as const }
      : entry;
  });
}
