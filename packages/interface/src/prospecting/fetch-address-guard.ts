/**
 * Resolve-then-check address guard for the two prospecting fetch helpers
 * (probeUrl and fetchPageText), built per the posture decision approved for
 * issue #158: every host these helpers touch, initial or redirected, is
 * resolved and its answers classified before the request goes out, so a
 * prospect URL cannot probe the deployment's own loopback or private
 * network (in the production compose stack the probing process shares a
 * Docker network with Caddy and can resolve the app by name).
 *
 * Why resolve at all: the reachable paths are page-controlled redirects and
 * catalogue-declared domains, and both reach the helper as a DNS name.
 * Refusing only URL strings that already look like IPs would miss every one
 * of those, so the guard classifies what DNS actually answers rather than
 * what the URL spells. That also covers spellings a URL could carry but a
 * human would not read as an address: getaddrinfo accepts shortened IPv4
 * forms such as '127.1' and answers them with a plain dotted quad, which
 * the classifier then sees for what it is.
 *
 * Fail closed. A URL that does not parse, a protocol that is not http(s),
 * an empty answer set, or any resolved address in a refused range all end
 * in a refusal; resolution errors themselves are left to throw so each
 * helper routes them through its existing failure classification, exactly
 * as an unresolvable host was reported before the guard existed. When an
 * answer set mixes public and internal addresses the host is refused
 * outright: which address a connection actually picks is not ours to
 * predict, so a public record must not whiten an internal neighbour.
 *
 * Residual risk, accepted in docs/research/interface-probe-address-posture.md:
 * DNS rebinding between this resolve step and the connect that follows is
 * out of scope. Closing it means pinning the connection to the resolved
 * address with a custom dispatcher, which is a deeper change than this
 * posture decision and needs more than Node's built-ins.
 */

import { lookup } from 'node:dns/promises';
import { getProspectFetchAllowlist } from '../config.js';

export type RefusedAddressReason =
  'loopback' | 'private' | 'link-local' | 'unique-local' | 'unspecified' | 'unparseable';

export type AddressClassification =
  { kind: 'allowed' } | { kind: 'refused'; reason: RefusedAddressReason };

/** Parses a dotted quad strictly. getaddrinfo answers IPv4 questions in
 *  canonical dotted form, so this only ever sees what the resolver produced,
 *  but strictness costs nothing and keeps the classifier honest standalone. */
function parseIpv4Octets(address: string): [number, number, number, number] | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/u.test(part)) return null;
    const value = Number.parseInt(part, 10);
    if (value > 255) return null;
    octets.push(value);
  }
  const [a, b, c, d] = octets;
  if (a === undefined || b === undefined || c === undefined || d === undefined) return null;
  return [a, b, c, d];
}

function classifyIpv4Octets([o0, o1]: readonly [
  number,
  number,
  number,
  number,
]): AddressClassification {
  // 0.0.0.0/8 is "this network": connecting to 0.0.0.0 lands on the local
  // host on every platform fetch can run on, so it is refused with the
  // unspecified addresses (:: included) rather than treated as routable.
  if (o0 === 0) return { kind: 'refused', reason: 'unspecified' };
  if (o0 === 10) return { kind: 'refused', reason: 'private' }; // 10.0.0.0/8
  // 100.64.0.0/10, carrier-grade NAT: shared address space that sits behind
  // the ISP, not a public host.
  if (o0 === 100 && (o1 & 0xc0) === 64) return { kind: 'refused', reason: 'private' };
  if (o0 === 127) return { kind: 'refused', reason: 'loopback' }; // 127.0.0.0/8
  // 169.254.0.0/16 link-local, which includes 169.254.169.254, the cloud
  // metadata address this posture decision exists to keep out of reach.
  if (o0 === 169 && o1 === 254) return { kind: 'refused', reason: 'link-local' };
  if (o0 === 172 && (o1 & 0xf0) === 16) return { kind: 'refused', reason: 'private' }; // 172.16.0.0/12
  if (o0 === 192 && o1 === 168) return { kind: 'refused', reason: 'private' }; // 192.168.0.0/16
  return { kind: 'allowed' };
}

/** Parses an IPv6 literal into its 8 hextets, compressing '::' and decoding
 *  an embedded IPv4 tail (::ffff:192.0.2.1 style) into two of them. */
function parseIpv6Groups(address: string): number[] | null {
  const withoutZone = address.split('%')[0] ?? '';
  const firstDouble = withoutZone.indexOf('::');
  if (firstDouble !== -1 && withoutZone.includes('::', firstDouble + 1)) return null;
  const headText = firstDouble === -1 ? withoutZone : withoutZone.slice(0, firstDouble);
  const tailText = firstDouble === -1 ? '' : withoutZone.slice(firstDouble + 2);
  const headGroups = headText === '' ? [] : headText.split(':');
  const tailGroups = tailText === '' ? [] : tailText.split(':');
  const rawGroups = [...headGroups, ...tailGroups];
  const groups: number[] = [];
  for (let index = 0; index < rawGroups.length; index += 1) {
    const text = rawGroups[index] ?? '';
    if (text.includes('.')) {
      // An embedded IPv4 tail always counts as the final two hextets.
      if (index !== rawGroups.length - 1) return null;
      const octets = parseIpv4Octets(text);
      if (octets === null) return null;
      groups.push(
        ((octets[0] ?? 0) << 8) | (octets[1] ?? 0),
        ((octets[2] ?? 0) << 8) | (octets[3] ?? 0),
      );
      continue;
    }
    if (!/^[0-9a-fA-F]{1,4}$/u.test(text)) return null;
    groups.push(Number.parseInt(text, 16));
  }
  if (firstDouble === -1) {
    return groups.length === 8 ? groups : null;
  }
  // '::' must stand for at least one missing group, so a full set of 8 plus
  // a '::' is not a valid literal.
  if (groups.length >= 8) return null;
  const missing = 8 - groups.length;
  const headCount = headGroups.length;
  const expanded: number[] = [];
  for (let index = 0; index < headCount; index += 1) expanded.push(groups[index] ?? 0);
  for (let index = 0; index < missing; index += 1) expanded.push(0);
  for (let index = headCount; index < groups.length; index += 1) {
    expanded.push(groups[index] ?? 0);
  }
  return expanded;
}

function classifyIpv6Groups(groups: readonly number[]): AddressClassification {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  if (
    g0 === undefined ||
    g1 === undefined ||
    g2 === undefined ||
    g3 === undefined ||
    g4 === undefined ||
    g5 === undefined ||
    g6 === undefined ||
    g7 === undefined
  ) {
    return { kind: 'refused', reason: 'unparseable' };
  }
  const allZeroUpTo =
    g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && g6 === 0;
  if (allZeroUpTo && g7 === 0) return { kind: 'refused', reason: 'unspecified' }; // ::
  if (allZeroUpTo && g7 === 1) return { kind: 'refused', reason: 'loopback' }; // ::1
  // ::ffff:0:0/96 IPv4-mapped: the OS maps these straight onto the embedded
  // IPv4 address, so ::ffff:127.0.0.1 is loopback in every way that matters.
  // Classifying through the IPv4 rules keeps the mapped spelling of a
  // private range from walking past the guard.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    return classifyIpv4Octets([(g6 >> 8) & 0xff, g6 & 0xff, (g7 >> 8) & 0xff, g7 & 0xff]);
  }
  // fc00::/7 unique-local (fc00 through fdff).
  if ((g0 & 0xfe00) === 0xfc00) return { kind: 'refused', reason: 'unique-local' };
  // fe80::/10 link-local (fe80 through febf).
  if ((g0 & 0xffc0) === 0xfe80) return { kind: 'refused', reason: 'link-local' };
  return { kind: 'allowed' };
}

/** Classifies one address as it came back from resolution. Multicast and
 *  other reserved ranges are deliberately left to the transport to refuse:
 *  no HTTP fetch to them can succeed, so spelling them out would add
 *  classifier surface without closing a reachable path. */
export function classifyIpAddress(address: string): AddressClassification {
  const octets = parseIpv4Octets(address);
  if (octets !== null) return classifyIpv4Octets(octets);
  const groups = parseIpv6Groups(address);
  if (groups === null) return { kind: 'refused', reason: 'unparseable' };
  return classifyIpv6Groups(groups);
}

/** One resolved answer. Structural on purpose: it matches what
 *  node:dns/promises lookup returns without importing its type, and test
 *  injections can build one with an object literal. */
export interface ResolvedAddress {
  address: string;
  family: number;
}

export type LookupAddresses = (hostname: string) => Promise<readonly ResolvedAddress[]>;

const defaultLookupAddresses: LookupAddresses = (hostname) =>
  lookup(hostname, { all: true, verbatim: true });

export interface CheckFetchTargetOptions {
  /** Test seam: injected instead of the real getaddrinfo lookup so refusal
   *  and resolution behaviour can be exercised without any DNS traffic. */
  lookupAddresses?: LookupAddresses | undefined;
}

export type FetchTargetVerdict = { kind: 'allowed' } | { kind: 'refused'; detail: string };

function stripHostBrackets(host: string): string {
  return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
}

/** Checks one request target before it is fetched. Resolution errors are
 *  deliberately allowed to reject: the helpers wrap this call in their
 *  existing error handling, so an unresolvable host lands in the same
 *  bucket it always did instead of inventing a parallel path. */
export async function checkFetchTarget(
  url: string,
  options: CheckFetchTargetOptions = {},
): Promise<FetchTargetVerdict> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return { kind: 'refused', detail: 'refused unparseable target url' };
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return { kind: 'refused', detail: `refused non-http(s) url protocol ${target.protocol}` };
  }
  const host = stripHostBrackets(target.hostname.toLowerCase());
  if (host === '') {
    return { kind: 'refused', detail: 'refused url with an empty host' };
  }
  // The allowlist matches the URL host, so it is checked before any lookup:
  // an allowlisted host is fetched wherever it points, which is the whole
  // extent of this operator-only escape hatch (see config.ts).
  if (getProspectFetchAllowlist().has(host)) {
    return { kind: 'allowed' };
  }
  const lookupAddresses = options.lookupAddresses ?? defaultLookupAddresses;
  const answers = await lookupAddresses(host);
  if (answers.length === 0) {
    return { kind: 'refused', detail: 'refused host with an empty answer set' };
  }
  for (const answer of answers) {
    const classification = classifyIpAddress(answer.address);
    if (classification.kind === 'refused') {
      return {
        kind: 'refused',
        detail: `refused internal address ${answer.address} (${classification.reason})`,
      };
    }
  }
  return { kind: 'allowed' };
}
