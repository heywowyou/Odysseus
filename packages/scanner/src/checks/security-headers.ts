/**
 * Milestone 8.6: security response headers, a site-level fact fetched
 * once per audit rather than per page - HSTS/CSP/etc. are near-always
 * set by the same server config for every page on a site, so a per-page
 * fetch here would just repeat the same answer at the cost of the
 * politeness budget. Same "one fetch, attributed to the homepage" shape
 * as checks/llms-txt.ts and checks/sitemap.ts.
 *
 * Presence-only, like llms-txt.ts: this reports which of the five
 * headers a response actually set, not whether a directive's contents
 * are well-formed (e.g. a syntactically broken CSP value still counts as
 * "present" here). Judging directive correctness is a distinct, harder
 * problem than judging absence and is out of scope for this pass.
 */

import { classifyDocumentWall, extractHostSignalMarkers } from '@odysseus/core';
import { getCrawlerUserAgent } from '../config.js';
import type { NetworkSafetyDisposition, NetworkTargetPolicy } from '../network-target-policy.js';
import { fetchWithNetworkPolicy, NetworkSafetyBlockedError } from '../safe-fetch.js';

export interface SecurityHeadersCheckResult {
  fetched: boolean;
  isHttps: boolean;
  hasCsp: boolean;
  hasHsts: boolean;
  hasXFrameOptions: boolean;
  hasReferrerPolicy: boolean;
  hasPermissionsPolicy: boolean;
  fetchError?: string;
}

export interface SecurityHeadersCheckOptions {
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
      const remaining = maxBytes - bytes;
      const chunk = value.subarray(0, remaining);
      bytes += chunk.byteLength;
      text += decoder.decode(chunk, { stream: bytes < maxBytes });
      if (chunk.byteLength < value.byteLength) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return text;
}

export async function checkSecurityHeaders(
  origin: string,
  timeoutMs: number,
  userAgent: string = getCrawlerUserAgent(),
  options: SecurityHeadersCheckOptions = {},
): Promise<SecurityHeadersCheckResult> {
  const isHttps = new URL(origin).protocol === 'https:';
  try {
    const request = {
      headers: { 'user-agent': userAgent },
      signal: AbortSignal.timeout(timeoutMs),
    };
    const response =
      options.networkPolicy === undefined
        ? await fetch(origin, request)
        : await fetchWithNetworkPolicy(origin, request, {
            policy: options.networkPolicy,
            ...(options.onNetworkSafetyBlocked !== undefined
              ? { onBlocked: options.onNetworkSafetyBlocked }
              : {}),
          });
    if ([401, 403, 429].includes(response.status) || response.status >= 500) {
      return {
        fetched: false,
        isHttps,
        hasCsp: false,
        hasHsts: false,
        hasXFrameOptions: false,
        hasReferrerPolicy: false,
        hasPermissionsPolicy: false,
        fetchError: `HTTP ${response.status}`,
      };
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
      return {
        fetched: false,
        isHttps,
        hasCsp: false,
        hasHsts: false,
        hasXFrameOptions: false,
        hasReferrerPolicy: false,
        hasPermissionsPolicy: false,
        fetchError: `HTTP wall response (${wall.reason})`,
      };
    }
    return {
      fetched: true,
      isHttps,
      hasCsp: response.headers.has('content-security-policy'),
      hasHsts: response.headers.has('strict-transport-security'),
      hasXFrameOptions: response.headers.has('x-frame-options'),
      hasReferrerPolicy: response.headers.has('referrer-policy'),
      hasPermissionsPolicy: response.headers.has('permissions-policy'),
    };
  } catch (error) {
    if (error instanceof NetworkSafetyBlockedError) throw error;
    return {
      fetched: false,
      isHttps,
      hasCsp: false,
      hasHsts: false,
      hasXFrameOptions: false,
      hasReferrerPolicy: false,
      hasPermissionsPolicy: false,
      fetchError: error instanceof Error ? error.message : String(error),
    };
  }
}
