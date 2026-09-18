import {
  checkNetworkTarget,
  type CheckNetworkTargetOptions,
  type NetworkSafetyDisposition,
  type NetworkTargetPolicy,
} from './network-target-policy.js';

const DEFAULT_MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class NetworkSafetyBlockedError extends Error {
  readonly disposition: NetworkSafetyDisposition;

  constructor(disposition: NetworkSafetyDisposition) {
    super(`network safety blocked ${disposition.url}: ${disposition.reason}`);
    this.name = 'NetworkSafetyBlockedError';
    this.disposition = disposition;
  }
}

export interface SafeFetchOptions extends CheckNetworkTargetOptions {
  policy: NetworkTargetPolicy;
  onBlocked?: (disposition: NetworkSafetyDisposition) => void;
  maxRedirects?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Fetches an HTTP(S) resource while validating every redirect hop before the
 * connection is attempted. Native fetch follows redirects internally, which
 * would otherwise let a public URL bounce the scanner onto a private target
 * after the initial policy check.
 */
export async function fetchWithNetworkPolicy(
  url: string,
  init: RequestInit,
  options: SafeFetchOptions,
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  let currentUrl = url;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const verdict = await checkNetworkTarget(currentUrl, options.policy, {
      ...(options.lookupAddresses !== undefined
        ? { lookupAddresses: options.lookupAddresses }
        : {}),
    });
    if (verdict.kind === 'refused') {
      options.onBlocked?.(verdict.disposition);
      throw new NetworkSafetyBlockedError(verdict.disposition);
    }

    const response = await fetchImpl(currentUrl, { ...init, redirect: 'manual' });
    if (!REDIRECT_STATUSES.has(response.status)) return response;

    const location = response.headers.get('location');
    if (location === null) return response;
    if (hop === maxRedirects) {
      await response.body?.cancel();
      throw new Error(`safe fetch exceeded ${maxRedirects} redirects for ${url}`);
    }

    const nextUrl = new URL(location, currentUrl).href;
    await response.body?.cancel();
    currentUrl = nextUrl;
  }

  throw new Error(`safe fetch exhausted redirect loop for ${url}`);
}
