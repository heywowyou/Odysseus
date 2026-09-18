/**
 * The code-owned network safety contract for full-audit scanning (plan 059
 * sections 3.6, 5.2 and 7).
 *
 * `address-guard.ts` answers "is this resolved address public-routable". This
 * module answers the question a scan actually asks, which is larger: given a
 * URL that came from a third party's page, may this run connect to it, under
 * which policy profile, and what do we record when the answer is no.
 *
 * Three things here that the classifier alone does not give:
 *
 * 1. **Profiles that production cannot escape.** Tests need to point the
 *    scanner at a loopback fixture server. That requirement must never become
 *    a switch a job payload can flip, or a hostile prospect record becomes an
 *    SSRF primitive. `resolveNetworkTargetPolicyForJob` therefore only ever
 *    returns the public-site policy and refuses loudly if a payload names
 *    anything else; the loopback profile is reachable only through a factory
 *    that throws unless a test runner is in the process.
 *
 * 2. **Address pinning.** Resolving a host and then connecting by name lets
 *    DNS answer differently the second time - the rebinding risk the
 *    prospecting posture accepted as residual. A verdict here carries the
 *    exact addresses that were classified, so the caller can bind its
 *    connection to one of them, and `assertPinnedAddress` catches the case
 *    where something connected somewhere else anyway.
 *
 * 3. **A disposition instead of a thrown string.** A refusal is evidence: the
 *    inventory ledger records that this URL was reached for and refused on
 *    network-safety grounds, which is a different fact from a 404 or a
 *    timeout. Every disposition is non-retryable by construction, because the
 *    only way to "retry" an address refusal is to change identity or profile,
 *    and plan 059 section 22 rejects both.
 */

import { isIP } from 'node:net';
import {
  classifyIpAddress,
  type LookupAddresses,
  type RefusedAddressReason,
  type ResolvedAddress,
} from './address-guard.js';

export const PUBLIC_SITE_NETWORK_POLICY_ID = 'public-site';
export const TEST_ONLY_LOOPBACK_NETWORK_POLICY_ID = 'test-only-loopback';

export interface NetworkTargetPolicy {
  readonly id: string;
  /** Only the test-only profile sets this. It skips address classification
   *  entirely, which is exactly why it must not be selectable in production. */
  readonly allowsPrivateAddresses: boolean;
  /** Hosts connected to wherever they resolve. Matched on the URL host before
   *  any lookup, so an entry here is a deliberate, named exemption. */
  readonly allowHosts: ReadonlySet<string>;
}

export type NetworkSafetyRefusalReason =
  | 'unparseable-url'
  | 'forbidden-scheme'
  | 'credentials-in-url'
  | 'empty-host'
  | 'unresolvable-host'
  | 'refused-address'
  | 'rebound-address';

/**
 * Why one target was refused, in the shape the coverage ledger stores. Kept
 * free of stack traces and resolver internals: this ends up next to a URL in
 * an evidence artifact, not in a debug log.
 */
export interface NetworkSafetyDisposition {
  reason: NetworkSafetyRefusalReason;
  url: string;
  policyId: string;
  /** Set when the refusal came from a specific resolved address. */
  address?: string;
  addressReason?: RefusedAddressReason;
  detail: string;
  /** Structurally false. A network-safety block is never retried, because
   *  every available "retry" changes crawler identity or policy profile. */
  retryable: false;
}

export type NetworkTargetVerdict =
  | {
      kind: 'allowed';
      /** The classified answer set. Bind the connection to one of these
       *  rather than re-resolving the host, or DNS gets a second chance to
       *  answer differently. Empty when the host was allowlisted, since no
       *  lookup was performed. */
      pinnedAddresses: readonly ResolvedAddress[];
    }
  | { kind: 'refused'; disposition: NetworkSafetyDisposition };

export const PUBLIC_SITE_NETWORK_POLICY: NetworkTargetPolicy = {
  id: PUBLIC_SITE_NETWORK_POLICY_ID,
  allowsPrivateAddresses: false,
  allowHosts: new Set(),
};

/**
 * The only entry point a queued job's payload reaches.
 *
 * It refuses rather than silently downgrading. A payload naming the loopback
 * profile means either a misconfiguration or an attempt, and both deserve to
 * stop the scan where they can be seen; quietly substituting the safe policy
 * would let a broken deployment run for months looking healthy.
 */
export function resolveNetworkTargetPolicyForJob(requestedId?: unknown): NetworkTargetPolicy {
  if (requestedId === undefined || requestedId === PUBLIC_SITE_NETWORK_POLICY_ID) {
    return PUBLIC_SITE_NETWORK_POLICY;
  }
  throw new Error(
    `odysseus: refusing to run a scan under network policy ${JSON.stringify(requestedId)}. ` +
      `Job input may only select ${PUBLIC_SITE_NETWORK_POLICY_ID}.`,
  );
}

function isUnderTestRunner(): boolean {
  return process.env.VITEST !== undefined || process.env.NODE_ENV === 'test';
}

/**
 * The loopback profile, for fixture servers. Throws outside a test runner, so
 * the refusal happens at construction in any environment that should not have
 * one rather than at the first request it would have wrongly allowed.
 */
export function createTestOnlyLoopbackPolicy(
  allowHosts: readonly string[] = ['localhost', '127.0.0.1', '[::1]'],
): NetworkTargetPolicy {
  if (!isUnderTestRunner()) {
    throw new Error(
      'odysseus: the test-only loopback network policy is not available outside a test runner.',
    );
  }
  return {
    id: TEST_ONLY_LOOPBACK_NETWORK_POLICY_ID,
    allowsPrivateAddresses: true,
    allowHosts: new Set(allowHosts.map((host) => host.toLowerCase())),
  };
}

function stripHostBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

function refuse(
  url: string,
  policy: NetworkTargetPolicy,
  reason: NetworkSafetyRefusalReason,
  detail: string,
  address?: { address: string; addressReason: RefusedAddressReason },
): NetworkTargetVerdict {
  return {
    kind: 'refused',
    disposition: {
      reason,
      url,
      policyId: policy.id,
      detail,
      retryable: false,
      ...(address === undefined
        ? {}
        : { address: address.address, addressReason: address.addressReason }),
    },
  };
}

export interface CheckNetworkTargetOptions {
  /** Test seam, matching `checkFetchTarget`: injected in place of the real
   *  getaddrinfo lookup so refusals can be exercised without DNS traffic. */
  lookupAddresses?: LookupAddresses | undefined;
}

/**
 * Checks one target immediately before connecting to it.
 *
 * Resolution failure is converted into a refusal here rather than left to
 * throw, unlike `checkFetchTarget`. A scan reaches this for every discovered
 * link, and an unresolvable host is an ordinary fact about a site's outbound
 * links that belongs in the ledger as its own disposition, not an exception
 * each call site has to re-classify.
 */
export async function checkNetworkTarget(
  url: string,
  policy: NetworkTargetPolicy,
  options: CheckNetworkTargetOptions = {},
): Promise<NetworkTargetVerdict> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return refuse(url, policy, 'unparseable-url', 'target url does not parse');
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return refuse(url, policy, 'forbidden-scheme', `scheme ${target.protocol} is not http(s)`);
  }
  // Checked before the host: credentials in a URL point somewhere other than
  // the visible host suggests, which is a refusal on its own terms whatever
  // that host resolves to.
  if (target.username !== '' || target.password !== '') {
    return refuse(url, policy, 'credentials-in-url', 'target url embeds credentials');
  }
  const host = stripHostBrackets(target.hostname.toLowerCase());
  if (host === '') {
    return refuse(url, policy, 'empty-host', 'target url has an empty host');
  }
  if (policy.allowHosts.has(host)) {
    return { kind: 'allowed', pinnedAddresses: [] };
  }
  if (policy.allowsPrivateAddresses) {
    return { kind: 'allowed', pinnedAddresses: [] };
  }

  // An IP literal is its own answer. Handing it to a resolver would let an
  // injected or misbehaving lookup vouch for an address the connection will
  // use verbatim anyway.
  const literalFamily = isIP(host);
  const lookupAddresses = options.lookupAddresses ?? defaultLookupAddresses;
  let answers: readonly ResolvedAddress[];
  try {
    answers =
      literalFamily === 0
        ? await lookupAddresses(host)
        : [{ address: host, family: literalFamily }];
  } catch {
    return refuse(url, policy, 'unresolvable-host', `host ${host} did not resolve`);
  }
  if (answers.length === 0) {
    return refuse(url, policy, 'unresolvable-host', `host ${host} resolved to no addresses`);
  }
  // Every answer must pass, not merely one. Which address a connection picks
  // is the resolver's choice, so one public record must not launder an
  // internal neighbour in the same answer set.
  for (const answer of answers) {
    const classification = classifyIpAddress(answer.address);
    if (classification.kind === 'refused') {
      return refuse(
        url,
        policy,
        'refused-address',
        `host ${host} resolves to ${answer.address}, which is not public-routable`,
        { address: answer.address, addressReason: classification.reason },
      );
    }
  }
  return { kind: 'allowed', pinnedAddresses: answers };
}

/**
 * Revalidates a redirect hop under the same policy as the original target.
 *
 * A separate name rather than a second call to `checkNetworkTarget`, because
 * forgetting to check a hop is the whole bug class: a public URL that 302s to
 * `169.254.169.254` passes every check made before the request went out.
 */
export function checkRedirectTarget(
  hopUrl: string,
  policy: NetworkTargetPolicy,
  options: CheckNetworkTargetOptions = {},
): Promise<NetworkTargetVerdict> {
  return checkNetworkTarget(hopUrl, policy, options);
}

/**
 * Confirms the address a connection actually used was one of the addresses
 * that were classified for it.
 *
 * This is what makes the pinning real rather than advisory: if a resolver
 * answered differently between the check and the connect, the mismatch is
 * caught here instead of becoming a request to wherever the second answer
 * pointed.
 */
export function assertPinnedAddress(
  url: string,
  policy: NetworkTargetPolicy,
  connectedAddress: string,
  pinnedAddresses: readonly ResolvedAddress[],
): NetworkTargetVerdict {
  // An allowlisted or test-only target was never resolved, so there is
  // nothing to pin it against and nothing it could have rebound from.
  if (pinnedAddresses.length === 0) return { kind: 'allowed', pinnedAddresses };
  if (pinnedAddresses.some((answer) => answer.address === connectedAddress)) {
    return { kind: 'allowed', pinnedAddresses };
  }
  const classification = classifyIpAddress(connectedAddress);
  return refuse(
    url,
    policy,
    'rebound-address',
    `connection reached ${connectedAddress}, which was not among the addresses checked for this target`,
    classification.kind === 'refused'
      ? { address: connectedAddress, addressReason: classification.reason }
      : undefined,
  );
}

const defaultLookupAddresses: LookupAddresses = async (hostname) => {
  const { lookup } = await import('node:dns/promises');
  return lookup(hostname, { all: true, verbatim: true });
};
