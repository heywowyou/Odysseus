import { lookup as dnsLookup } from 'node:dns';
import type { LookupFunction } from 'node:net';
import { Agent, fetch as undiciFetch, type Dispatcher } from 'undici';
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
  /** Return each validated redirect response to callers that inspect hops. */
  manualRedirects?: boolean;
  fetchImpl?: typeof fetch;
}

/**
 * A dispatcher whose connections can only reach addresses the policy permits.
 *
 * Checking a URL and then handing it to fetch leaves a gap: fetch resolves the
 * host again, and a name that answered publicly to the check can answer
 * privately to the connection (DNS rebinding). Here the classification runs
 * inside the socket's own lookup, so the address that is checked is the
 * address that is dialled, and there is no second resolution to rebind.
 */
export function createPinnedDispatcher(
  policy: NetworkTargetPolicy,
  options: CheckNetworkTargetOptions & {
    onBlocked?: (disposition: NetworkSafetyDisposition) => void;
  } = {},
): Dispatcher {
  const lookup: LookupFunction = (hostname, lookupOptions, callback) => {
    void checkNetworkTarget(
      `http://${hostname.includes(':') ? `[${hostname}]` : hostname}/`,
      policy,
      {
        ...(options.lookupAddresses !== undefined
          ? { lookupAddresses: options.lookupAddresses }
          : {}),
      },
    ).then((verdict) => {
      if (verdict.kind === 'refused') {
        options.onBlocked?.(verdict.disposition);
        callback(new NetworkSafetyBlockedError(verdict.disposition), '', 0);
        return;
      }
      if (verdict.pinnedAddresses.length === 0) {
        // Allowlisted or test-only target: the policy permitted the name
        // itself, so the system resolver answers for it.
        dnsLookup(hostname, lookupOptions, callback);
        return;
      }
      const answers = verdict.pinnedAddresses;
      if (lookupOptions.all === true) {
        (callback as unknown as (error: null, addresses: typeof answers) => void)(null, answers);
        return;
      }
      const first = answers[0]!;
      callback(null, first.address, first.family);
    });
  };
  return new Agent({ connect: { lookup } });
}

const pinnedDispatchers = new WeakMap<NetworkTargetPolicy, Dispatcher>();

function dispatcherFor(policy: NetworkTargetPolicy): Dispatcher {
  let dispatcher = pinnedDispatchers.get(policy);
  if (dispatcher === undefined) {
    dispatcher = createPinnedDispatcher(policy);
    pinnedDispatchers.set(policy, dispatcher);
  }
  return dispatcher;
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
  // The production path dials through the pinned dispatcher, so the address
  // classified below is the one the socket uses. An injected fetch is a test
  // seam and owns its own transport.
  const dispatcher = options.fetchImpl === undefined ? dispatcherFor(options.policy) : undefined;
  const fetchImpl: typeof fetch =
    options.fetchImpl ??
    ((input, requestInit) =>
      undiciFetch(
        input as string,
        {
          ...(requestInit as object),
          dispatcher,
        } as Parameters<typeof undiciFetch>[1],
      ) as unknown as Promise<Response>);
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
    if (options.manualRedirects === true || !REDIRECT_STATUSES.has(response.status))
      return response;

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
