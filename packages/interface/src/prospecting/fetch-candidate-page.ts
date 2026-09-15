/**
 * Plain-HTTP-only page fetch for the prospecting qualification stage, per
 * docs/rules/prospect-qualification.md section 5: "The plain HTTP stage must
 * not use Chromium." No HTML-parsing dependency added, matching
 * @odysseus/scanner's own extract-text.ts hand-rolled precedent -
 * htmlToText is deliberately crude, since it only needs to preserve
 * visible-text patterns well enough for @odysseus/scanner's
 * extractMentionsLegales regexes to match, not full rendering fidelity.
 * An SPA whose mentions-legales content renders client-side yields an
 * empty shell and no SIREN here - per the governing doc's own framing,
 * that is correct behavior ("a site publishing no resolvable SIREN is
 * dropped... it is not a prospect"), not a gap.
 *
 * fetchPageText follows redirects by hand (issue #158, posture approved
 * 2026-09-10). It used to pass no redirect option at all, so fetch followed
 * page-controlled chains with no hop bound and no address check; the
 * posture decision reconciles it to probeUrl's discipline instead of
 * adding an address check alone. Each hop is resolved and checked before
 * it is requested (fetch-address-guard.ts), the chain stops at
 * MAX_REDIRECT_HOPS, and one overall timeout keeps the shipped
 * total-time budget for a whole chain rather than a per-hop one.
 */

import { MAX_REDIRECT_HOPS } from './probe-url.js';
import { checkFetchTarget, type LookupAddresses } from './fetch-address-guard.js';

const SCRIPT_OR_STYLE_PATTERN = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const TAG_PATTERN = /<[^>]+>/g;
const WHITESPACE_PATTERN = /\s+/g;

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(text: string): string {
  return text.replace(
    /&(amp|lt|gt|quot|#39|apos|nbsp);/g,
    (match) => HTML_ENTITIES[match] ?? match,
  );
}

export function htmlToText(html: string): string {
  const withoutScriptsAndStyles = html.replace(SCRIPT_OR_STYLE_PATTERN, ' ');
  const withoutTags = withoutScriptsAndStyles.replace(TAG_PATTERN, ' ');
  return decodeEntities(withoutTags).replace(WHITESPACE_PATTERN, ' ').trim();
}

const ANCHOR_HREF_PATTERN = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi;

/** Resolved hrefs. Same-origin only by default - the mentions-legales page is
 *  always on the same site as the homepage that links to it, which is all
 *  milestone 9a ever needed.
 *
 *  `includeOffOrigin` exists for plan 003, where an off-domain link is itself
 *  the fact being measured: a hotel whose only booking route is an OTA listing
 *  has a different funnel from one selling direct, and the default would hide
 *  exactly the links that distinguish them. The default is unchanged so the
 *  shipped 9a callers keep their current behaviour. */
export function extractAnchorHrefs(
  html: string,
  baseUrl: string,
  options: { includeOffOrigin?: boolean } = {},
): string[] {
  const baseOrigin = new URL(baseUrl).origin;
  const hrefs: string[] = [];
  for (const match of html.matchAll(ANCHOR_HREF_PATTERN)) {
    const raw = match[1];
    if (!raw) continue;
    try {
      const resolved = new URL(raw, baseUrl);
      if (!/^https?:$/.test(resolved.protocol)) continue;
      if (options.includeOffOrigin !== true && resolved.origin !== baseOrigin) continue;
      hrefs.push(resolved.href);
    } catch {
      continue;
    }
  }
  return hrefs;
}

export interface FetchedPage {
  url: string;
  bodyText: string;
  anchorUrls: string[];
}

export interface FetchPageTextOptions {
  /** Test seam over the guard's DNS resolution, mirroring probeUrl's. */
  lookupAddresses?: LookupAddresses | undefined;
}

/** Returns null on any failure (network, non-2xx, timeout, refused address,
 *  redirect loop, exhausted hop budget) rather than throwing - matches
 *  obligation-stage.ts's "degrade, never crash the batch" posture. */
export async function fetchPageText(
  url: string,
  timeoutMs: number,
  userAgent: string,
  options: FetchPageTextOptions = {},
): Promise<FetchedPage | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let currentUrl = url;
    const seen = new Set<string>([url]);
    for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
      // Resolve then check before connecting, every hop including the first.
      // Refusals, like every other failure here, answer null.
      const verdict = await checkFetchTarget(currentUrl, {
        lookupAddresses: options.lookupAddresses,
      });
      if (verdict.kind === 'refused') return null;

      const response = await fetch(currentUrl, {
        headers: { 'User-Agent': userAgent },
        redirect: 'manual',
        signal: controller.signal,
      });
      // Same 3xx rule as probeUrl so the two helpers read one redirect
      // posture, not two.
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location === null) return null;
        let next: URL;
        try {
          next = new URL(location, currentUrl);
        } catch {
          return null;
        }
        currentUrl = next.href;
        if (seen.has(currentUrl)) return null; // redirect loop
        seen.add(currentUrl);
        continue;
      }
      if (!response.ok) return null;
      const html = await response.text();
      return {
        url: currentUrl,
        bodyText: htmlToText(html),
        // The anchor base stays the requested url, exactly as before: the
        // shipped 9a callers read these anchors, and hand them the landing
        // page's own origin would change their behaviour for a redirected
        // site.
        anchorUrls: extractAnchorHrefs(html, url),
      };
    }
    return null; // more than MAX_REDIRECT_HOPS redirects
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
