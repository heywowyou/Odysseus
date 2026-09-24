/**
 * Sitemap discovery and raw-fact extraction. The root fields remain
 * compatible with milestone 8 artifacts; milestone 9b.5 adds flattened
 * page entries across recursively resolved sitemap indexes.
 */

import { gunzipSync } from 'node:zlib';
import { isSameSiteHostname } from '../links.js';
import type { HostRequestScheduler } from '../host-request-scheduler.js';
import {
  checkNetworkTarget,
  type NetworkSafetyDisposition,
  type NetworkTargetPolicy,
} from '../network-target-policy.js';
import { fetchWithNetworkPolicy } from '../safe-fetch.js';

const LOC_PATTERN = /<loc>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*?))\s*<\/loc>/gi;
const LASTMOD_PATTERN = /<lastmod>\s*([^<]+?)\s*<\/lastmod>/i;
const SITEMAP_INDEX_PATTERN = /<sitemapindex[\s>]/i;

export interface SitemapEntry {
  url: string;
  lastmod?: string;
}

export interface SitemapFetchError {
  url: string;
  error: string;
}

export interface SitemapDocumentMetadata {
  url: string;
  isRoot: boolean;
  isSitemapIndex: boolean;
  entryCount: number;
}

export interface SitemapCheckResult {
  /** First successfully fetched root sitemap, retained for compatibility. */
  sitemapUrl?: string;
  found: boolean;
  /** Whether the first successful root was a sitemap index. */
  isSitemapIndex: boolean;
  /** Raw entries from the first successful root, retained for compatibility. */
  entries: SitemapEntry[];
  /** Flattened page entries from all successfully resolved sitemap documents. */
  pageEntries: SitemapEntry[];
  /** One metadata record per successfully fetched sitemap document. */
  fetchedDocuments: SitemapDocumentMetadata[];
  /** URL-only compatibility convenience for callers predating document metadata. */
  fetchedSitemapUrls: string[];
  fetchErrors: SitemapFetchError[];
  /** Legacy single-error summary used by historical normalization copy. */
  fetchError?: string;
}

export interface SitemapCheckOptions {
  userAgent?: string;
  /** Fallback pacing for standalone callers without a shared scheduler. */
  delayMs?: number;
  /** Plan 059: run-wide host scheduler for every sitemap document request. */
  scheduler?: HostRequestScheduler;
  networkPolicy?: NetworkTargetPolicy;
  onNetworkSafetyBlocked?: (disposition: NetworkSafetyDisposition) => void;
}

function decodeXmlText(value: string): string {
  return value
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/u, '$1')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

/** Pure XML extraction. A full parser dependency is unnecessary for the
 *  sitemap protocol's small `loc` and `lastmod` surface. */
export function parseSitemapXml(xml: string): { isSitemapIndex: boolean; entries: SitemapEntry[] } {
  const isSitemapIndex = SITEMAP_INDEX_PATTERN.test(xml);
  const entries: SitemapEntry[] = [];
  const blocks = xml.split(/<url>|<sitemap>/i).slice(1);
  for (const block of blocks) {
    const locMatch = block.match(/<loc>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*?))\s*<\/loc>/i);
    const loc = locMatch?.[1] ?? locMatch?.[2];
    if (!loc?.trim()) continue;
    const lastmodMatch = block.match(LASTMOD_PATTERN);
    entries.push({
      url: decodeXmlText(loc),
      ...(lastmodMatch?.[1] ? { lastmod: decodeXmlText(lastmodMatch[1]) } : {}),
    });
  }
  if (entries.length === 0) {
    for (const match of xml.matchAll(LOC_PATTERN)) {
      const loc = match[1] ?? match[2];
      if (loc?.trim()) entries.push({ url: decodeXmlText(loc) });
    }
  }
  return { isSitemapIndex, entries };
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function tryFetchSitemap(
  url: string,
  timeoutMs: number,
  userAgent: string | undefined,
  options: SitemapCheckOptions,
): Promise<{ xml: string; finalUrl: string } | { error: string }> {
  try {
    const request = {
      signal: AbortSignal.timeout(timeoutMs),
      ...(userAgent !== undefined ? { headers: { 'user-agent': userAgent } } : {}),
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
    if (!response.ok) return { error: `HTTP ${response.status}` };
    const bytes = Buffer.from(await response.arrayBuffer());
    const xmlBytes =
      bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
    return { xml: xmlBytes.toString('utf8'), finalUrl: response.url || url };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function resolveDocumentUrl(href: string, baseUrl: string, authorizedUrl: URL): string | undefined {
  let resolved: URL;
  try {
    resolved = new URL(href, baseUrl);
  } catch {
    return undefined;
  }
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return undefined;
  if (!isSameSiteHostname(authorizedUrl.hostname, resolved.hostname)) return undefined;
  if (resolved.port !== authorizedUrl.port) return undefined;
  resolved.hash = '';
  return resolved.toString();
}

interface SitemapQueueEntry {
  url: string;
  isRoot: boolean;
}

/**
 * Resolves every robots-declared root sitemap, or the conventional
 * `/sitemap.xml` fallback, then recursively resolves sitemap indexes.
 * Documents outside the authorized hostname plus its www/apex counterpart
 * are recorded as failures and never fetched.
 */
export async function checkSitemap(
  origin: string,
  declaredSitemapUrls: readonly string[],
  timeoutMs: number,
  options: SitemapCheckOptions = {},
): Promise<SitemapCheckResult> {
  const authorizedUrl = new URL(origin);
  const fallbackUrl = new URL('/sitemap.xml', authorizedUrl).href;
  const initialRoots = declaredSitemapUrls.length > 0 ? [...declaredSitemapUrls] : [fallbackUrl];
  const queue: SitemapQueueEntry[] = initialRoots.map((url) => ({ url, isRoot: true }));
  const visitedDocuments = new Set<string>();
  const fetchedDocuments: SitemapDocumentMetadata[] = [];
  const fetchedSitemapUrls: string[] = [];
  const fetchErrors: SitemapFetchError[] = [];
  const pageEntriesByUrl = new Map<string, SitemapEntry>();
  let firstRoot:
    { sitemapUrl: string; isSitemapIndex: boolean; entries: SitemapEntry[] } | undefined;
  let attemptedFallback = initialRoots.includes(fallbackUrl);
  let hasFetched = false;

  while (queue.length > 0 || (!firstRoot && !attemptedFallback)) {
    if (queue.length === 0) {
      attemptedFallback = true;
      queue.push({ url: fallbackUrl, isRoot: true });
    }

    const queued = queue.shift()!;
    const documentUrl = resolveDocumentUrl(queued.url, origin, authorizedUrl);
    if (documentUrl === undefined) {
      fetchErrors.push({ url: queued.url, error: 'outside authorized hostname' });
      continue;
    }
    if (visitedDocuments.has(documentUrl)) continue;
    visitedDocuments.add(documentUrl);

    if (options.networkPolicy !== undefined) {
      const networkVerdict = await checkNetworkTarget(documentUrl, options.networkPolicy);
      if (networkVerdict.kind === 'refused') {
        options.onNetworkSafetyBlocked?.(networkVerdict.disposition);
        fetchErrors.push({
          url: documentUrl,
          error: `network-safety: ${networkVerdict.disposition.reason}`,
        });
        continue;
      }
    }

    let fetched: Awaited<ReturnType<typeof tryFetchSitemap>>;
    if (options.scheduler !== undefined) {
      fetched = await options.scheduler.schedule(() =>
        tryFetchSitemap(documentUrl, timeoutMs, options.userAgent, options),
      );
    } else {
      if (hasFetched) await sleep(options.delayMs ?? 0);
      fetched = await tryFetchSitemap(documentUrl, timeoutMs, options.userAgent, options);
    }
    hasFetched = true;
    if ('error' in fetched) {
      fetchErrors.push({ url: documentUrl, error: fetched.error });
      continue;
    }

    const finalUrl = resolveDocumentUrl(fetched.finalUrl, documentUrl, authorizedUrl);
    if (finalUrl === undefined) {
      fetchErrors.push({ url: documentUrl, error: 'redirected outside authorized hostname' });
      continue;
    }
    visitedDocuments.add(finalUrl);
    fetchedSitemapUrls.push(finalUrl);

    if (!/<(?:urlset|sitemapindex)(?:\s|>)/i.test(fetched.xml)) {
      fetchErrors.push({ url: finalUrl, error: 'invalid sitemap XML document' });
      continue;
    }
    const parsed = parseSitemapXml(fetched.xml);
    fetchedDocuments.push({
      url: finalUrl,
      isRoot: queued.isRoot,
      isSitemapIndex: parsed.isSitemapIndex,
      entryCount: parsed.entries.length,
    });
    if (queued.isRoot && firstRoot === undefined) {
      firstRoot = {
        sitemapUrl: finalUrl,
        isSitemapIndex: parsed.isSitemapIndex,
        entries: parsed.entries,
      };
    }

    if (parsed.isSitemapIndex) {
      for (const entry of parsed.entries) queue.push({ url: entry.url, isRoot: false });
      continue;
    }

    for (const entry of parsed.entries) {
      let pageUrl = entry.url;
      try {
        pageUrl = new URL(entry.url, finalUrl).toString();
      } catch {
        // Preserve malformed declarations in the flattened facts so the
        // crawl admission layer can count them as filtered coverage.
      }
      if (!pageEntriesByUrl.has(pageUrl)) pageEntriesByUrl.set(pageUrl, { ...entry, url: pageUrl });
    }
  }

  const lastError = fetchErrors.at(-1)?.error;
  return {
    ...(firstRoot !== undefined ? { sitemapUrl: firstRoot.sitemapUrl } : {}),
    found: firstRoot !== undefined,
    isSitemapIndex: firstRoot?.isSitemapIndex ?? false,
    entries: firstRoot?.entries ?? [],
    pageEntries: [...pageEntriesByUrl.values()],
    fetchedDocuments,
    fetchedSitemapUrls,
    fetchErrors,
    ...(firstRoot === undefined && lastError !== undefined ? { fetchError: lastError } : {}),
  };
}
