/**
 * Milestone 8.5a: fetches the target of a page's canonical tag when it
 * points to a different URL than the page itself, and reports whether
 * that target is reachable and indexable. A canonical tag says "this
 * other URL is the definitive version" - if that URL is broken or itself
 * excluded from indexing, the signal is contradictory.
 *
 * Deliberately skips a self-referencing canonical (the page's own HTTP
 * status and robots meta are already known from this same scan - nothing
 * new to check) and pages with more than one canonical tag (already
 * covered by normalize-head-metadata.ts's canonical-conflicting check;
 * fetching either target there would be guessing which one is "the"
 * canonical). Only the single-target cross-page case needs a network
 * call, keeping this to the minimum extra request per page that actually
 * has something new to check.
 *
 * A target on another host is requested only after the address guard
 * clears it, hop by hop, so a page cannot point the server at an internal
 * address.
 *
 * A plain fetch(), not a Playwright navigation: this only needs the raw
 * HTML text for a single regex-based robots-meta read, not a rendered
 * DOM, matching the "hand-rolled over structured-but-simple text"
 * precedent in sitemap.ts and mentions-legales.ts.
 */

import { auditedHostAliases, classifyHostResponse } from '@odysseus/core';
import { checkFetchTarget, type LookupAddresses } from '../address-guard.js';
import { getCrawlerUserAgent } from '../config.js';
import type { HostRequestScheduler } from '../host-request-scheduler.js';

export interface CanonicalTargetCheckResult {
  pageUrl: string;
  canonicalUrl: string;
  httpStatus?: number;
  fetchError?: string;
  noindex: boolean;
  /** A transient/rate-limit response is not evidence that the canonical is
   * unreachable. It stays visible to coverage/manual review instead. */
  undetermined?: boolean;
}

const META_TAG_PATTERN = /<meta[^>]*>/gi;
const ROBOTS_NAME_PATTERN = /name\s*=\s*["']robots["']/i;
const CONTENT_VALUE_PATTERN = /content\s*=\s*["']([^"']*)["']/i;

/** Pure: scans raw HTML text for a <meta name="robots" content="..."> tag
 *  and returns its lowercased content, or null if absent. Exported
 *  separately so this is unit-testable without a network call, matching
 *  head-metadata.ts's parseJsonLdBlocks precedent. */
export function extractRobotsMetaContent(html: string): string | null {
  for (const match of html.matchAll(META_TAG_PATTERN)) {
    const tag = match[0];
    if (!ROBOTS_NAME_PATTERN.test(tag)) continue;
    const content = tag.match(CONTENT_VALUE_PATTERN);
    if (content?.[1]) return content[1].toLowerCase();
  }
  return null;
}

/** Redirect hops followed before the target counts as unreachable, the
 *  same bound fetch applies by default. */
const MAX_CANONICAL_REDIRECTS = 20;

export interface CanonicalTargetCheckOptions {
  /** Test seam for the address guard's DNS lookup. */
  lookupAddresses?: LookupAddresses;
  /** Shared run scheduler, notified when the canonical fetch receives host
   *  pushback so this extra request cannot bypass the audit's pacing policy. */
  scheduler?: HostRequestScheduler;
}

/** A hop on the scanned page's own host was chosen by the operator along
 *  with the page. Any other host was chosen by the page's content, so it is
 *  resolved and refused when it points at a non-public address. */
async function hopIsAllowed(
  hopUrl: URL,
  pageHostname: string,
  options: CanonicalTargetCheckOptions,
): Promise<boolean> {
  if (hopUrl.hostname === pageHostname) return true;
  const verdict = await checkFetchTarget(hopUrl.href, {
    lookupAddresses: options.lookupAddresses,
  });
  return verdict.kind === 'allowed';
}

export async function checkCanonicalTarget(
  pageUrl: string,
  canonicalHref: string,
  timeoutMs: number,
  options: CanonicalTargetCheckOptions = {},
): Promise<CanonicalTargetCheckResult | null> {
  let resolved: string;
  let pageHostname: string;
  try {
    resolved = new URL(canonicalHref, pageUrl).href;
    pageHostname = new URL(pageUrl).hostname;
  } catch {
    return null;
  }
  if (resolved === pageUrl) return null;

  try {
    const signal = AbortSignal.timeout(timeoutMs);
    // Redirects are followed by hand so every hop passes the address guard,
    // and the request identifies itself like the crawler does.
    let hop = new URL(resolved);
    let response: Response | undefined;
    for (let redirects = 0; ; redirects++) {
      // A target that resolves to a non-public address is not a fact about
      // the client's site worth reporting, and must not be requested.
      if (!(await hopIsAllowed(hop, pageHostname, options))) return null;
      await options.scheduler?.pace();
      response = await fetch(hop, {
        redirect: 'manual',
        signal,
        headers: { 'user-agent': getCrawlerUserAgent() },
      });
      const retryAfterValue = response.headers.get('retry-after');
      const retryAfterSeconds = retryAfterValue === null ? Number.NaN : Number(retryAfterValue);
      const parsedRetryAfterAt =
        retryAfterValue === null ? Number.NaN : Date.parse(retryAfterValue);
      const retryAfterMs =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0
          ? retryAfterSeconds * 1000
          : Number.isFinite(parsedRetryAfterAt)
            ? Math.max(0, parsedRetryAfterAt - Date.now())
            : undefined;
      const hostResponse = {
        requestedHost: hop.hostname,
        landedHost: hop.hostname,
        auditedHostAliases: auditedHostAliases(pageHostname),
        status: response.status,
        ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      };
      if (options.scheduler !== undefined) {
        options.scheduler.observeHostDocument({
          response: hostResponse,
          document: { status: response.status },
          signal: { pageUrl, fetcher: 'canonical' },
        });
      } else {
        classifyHostResponse({ ...hostResponse, consecutiveOriginServerErrors: 0 });
      }
      const location = response.headers.get('location');
      if (response.status < 300 || response.status >= 400 || location === null) break;
      if (redirects >= MAX_CANONICAL_REDIRECTS) {
        return {
          pageUrl,
          canonicalUrl: resolved,
          noindex: false,
          fetchError: 'redirect count exceeded',
        };
      }
      await response.body?.cancel();
      hop = new URL(location, hop);
    }
    if (!response.ok) {
      if (response.status === 429 || response.status === 408 || response.status >= 500) {
        return {
          pageUrl,
          canonicalUrl: resolved,
          httpStatus: response.status,
          noindex: false,
          undetermined: true,
        };
      }
      return { pageUrl, canonicalUrl: resolved, httpStatus: response.status, noindex: false };
    }
    const html = await response.text();
    const robotsContent = extractRobotsMetaContent(html);
    return {
      pageUrl,
      canonicalUrl: resolved,
      httpStatus: response.status,
      noindex: robotsContent?.includes('noindex') ?? false,
    };
  } catch (error) {
    return {
      pageUrl,
      canonicalUrl: resolved,
      noindex: false,
      fetchError: error instanceof Error ? error.message : String(error),
    };
  }
}
