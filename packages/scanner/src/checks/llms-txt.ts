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

import { classifyDocumentWall, extractHostSignalMarkers } from '@odysseus/core';
import { getCrawlerUserAgent } from '../config.js';
import type { NetworkSafetyDisposition, NetworkTargetPolicy } from '../network-target-policy.js';
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

async function readResponsePrefix(response: Response, maxBytes: number): Promise<string> {
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  try {
    while (bytes < maxBytes) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, maxBytes - bytes);
      bytes += chunk.byteLength;
      text += decoder.decode(chunk, { stream: bytes < maxBytes });
      if (chunk.byteLength < value.byteLength) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return text;
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
    if ([401, 403, 429].includes(response.status) || response.status >= 500) {
      return { found: false, fetchError: `HTTP ${response.status}` };
    }
    const sample = await readResponsePrefix(response, 64 * 1024);
    const title = sample.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? null;
    const wall = classifyDocumentWall({
      status: response.status,
      title,
      markupLength: sample.length,
      visibleTextLength: sample.replace(/<[^>]*>/g, ' ').trim().length,
      markers: extractHostSignalMarkers(sample),
    });
    if (wall.classification === 'wall') {
      return { found: false, fetchError: `HTTP wall response (${wall.reason})` };
    }
    if (!response.ok) return { found: false, fetchError: `HTTP ${response.status}` };
    return { found: true, url };
  } catch (error) {
    if (error instanceof NetworkSafetyBlockedError) throw error;
    return { found: false, fetchError: error instanceof Error ? error.message : String(error) };
  }
}
