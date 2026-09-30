/**
 * Plan 075 M7: ask the site how it answers a path that cannot exist, once
 * under the root and once under each language prefix its analysed pages use
 * (a multilingual site serves one catch-all per language: yonahotel.com
 * answers `/en/<anything>` and `/fr/<anything>` with two different 200
 * shells). core's `catchAllTextSignatures` decides which answers identify a
 * catch-all; this module only fetches them, a few polite requests per audit.
 */
import { randomBytes } from 'node:crypto';
import type { CatchAllProbe } from '@odysseus/core';
import { HTML_PAGE_MAX_BYTES, readBoundedText } from '../bounded-body.js';
import type { NetworkSafetyDisposition, NetworkTargetPolicy } from '../network-target-policy.js';
import { analyzeRawDocument } from '../raw-document-signals.js';
import { fetchWithNetworkPolicy } from '../safe-fetch.js';

/** One probe for the root and one per language prefix, at most this many. */
export const MAX_CATCH_ALL_PROBES = 8;

const LANGUAGE_PREFIX = /^[a-z]{2}(?:[-_][a-z]{2})?$/i;

/** The root plus every language prefix among the given page URLs, in first
 *  seen order, bounded by MAX_CATCH_ALL_PROBES. */
export function catchAllProbePrefixes(pageUrls: readonly string[]): string[] {
  const prefixes = [''];
  for (const url of pageUrls) {
    let first: string | undefined;
    try {
      first = new URL(url).pathname.split('/').find((segment) => segment !== '');
    } catch {
      continue;
    }
    if (first === undefined || !LANGUAGE_PREFIX.test(first)) continue;
    const prefix = `/${first}`;
    if (!prefixes.includes(prefix)) prefixes.push(prefix);
    if (prefixes.length >= MAX_CATCH_ALL_PROBES) break;
  }
  return prefixes;
}

/** A path no site serves: identifiable in the site's logs as ours. */
export function catchAllProbeUrl(origin: string, prefix: string, token: string): string {
  return new URL(`${prefix}/odysseus-missing-page-${token}`, origin).href;
}

export function newCatchAllProbeToken(): string {
  return randomBytes(4).toString('hex');
}

export interface CatchAllProbeOptions {
  networkPolicy?: NetworkTargetPolicy;
  onNetworkSafetyBlocked?: (disposition: NetworkSafetyDisposition) => void;
}

export async function probeCatchAll(
  url: string,
  timeoutMs: number,
  userAgent: string,
  options: CatchAllProbeOptions = {},
): Promise<CatchAllProbe> {
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
    const probe: CatchAllProbe = {
      url,
      landedUrl: response.url || url,
      httpStatus: response.status,
    };
    if (response.status < 200 || response.status >= 300) {
      await response.body?.cancel().catch(() => undefined);
      return probe;
    }
    const html = await readBoundedText(response, HTML_PAGE_MAX_BYTES);
    return { ...probe, textSignature: analyzeRawDocument(html).textSignature };
  } catch (error) {
    return { url, fetchError: error instanceof Error ? error.message : String(error) };
  }
}
