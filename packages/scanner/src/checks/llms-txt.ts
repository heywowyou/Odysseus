/**
 * Milestone 8.5a: presence check for /llms.txt, the emerging (not yet
 * standardized) convention for a plain-text file describing a site for
 * LLM consumption, the same site-level shape as checks/sitemap.ts's
 * checkSitemap - one fetch, once per crawl, attached only to the
 * homepage's scan.json in scan-site.ts, the same "attribute a site-level
 * fact to the one page every site has" pattern sitemap and mentions-
 * legales already established.
 *
 * Presence only. This milestone does not validate llms.txt content
 * (the spec itself is still settling), matching the "detect, don't
 * grade" posture the rest of the scanner holds to.
 */

import { getCrawlerUserAgent } from '../config.js';
import type {
  NetworkSafetyDisposition,
  NetworkTargetPolicy,
} from '../network-target-policy.js';
import { fetchWithNetworkPolicy, NetworkSafetyBlockedError } from '../safe-fetch.js';

export interface LlmsTxtCheckResult {
  found: boolean;
  url?: string;
  fetchError?: string;
}

export interface LlmsTxtCheckOptions {
  networkPolicy?: NetworkTargetPolicy;
  onNetworkSafetyBlocked?: (disposition: NetworkSafetyDisposition) => void;
}

export async function checkLlmsTxt(
  origin: string,
  timeoutMs: number,
  userAgent: string = getCrawlerUserAgent(),
  options: LlmsTxtCheckOptions = {},
): Promise<LlmsTxtCheckResult> {
  const url = new URL('/llms.txt', origin).href;
  try {
    const request = {
      headers: { 'user-agent': userAgent },
      signal: AbortSignal.timeout(timeoutMs),
    };
    const response =
      options.networkPolicy === undefined
        ? await fetch(url, request)
        : await fetchWithNetworkPolicy(url, request, {
            policy: options.networkPolicy,
            ...(options.onNetworkSafetyBlocked !== undefined
              ? { onBlocked: options.onNetworkSafetyBlocked }
              : {}),
          });
    if (!response.ok) {
      return { found: false, fetchError: `HTTP ${response.status}` };
    }
    return { found: true, url };
  } catch (error) {
    if (error instanceof NetworkSafetyBlockedError) throw error;
    return { found: false, fetchError: error instanceof Error ? error.message : String(error) };
  }
}
