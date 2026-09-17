/**
 * Resolve-then-check address guard for requests whose destination comes from
 * content the operator did not choose: a prospect page's redirects, a scanned
 * page's canonical tag or booking link. Every host such a request touches,
 * initial or redirected, is resolved and its answers classified before the
 * request goes out, so third-party content cannot make the server request
 * its own loopback, the compose network, or link-local metadata (issue #158
 * for prospecting, extended to the scanner for #340).
 *
 * Why resolve at all: the reachable paths arrive as DNS names. Refusing only
 * URL strings that already look like IPs would miss every one of those, so
 * the guard classifies what DNS actually answers rather than what the URL
 * spells. That also covers spellings a human would not read as an address:
 * getaddrinfo accepts shortened IPv4 forms such as '127.1' and answers them
 * with a plain dotted quad, which the classifier then sees for what it is.
 *
 * Fail closed. A URL that does not parse, a protocol that is not http(s),
 * an empty answer set, or any resolved address in a refused range all end
 * in a refusal; resolution errors themselves are left to throw so each
 * caller routes them through its existing failure classification. When an
 * answer set mixes public and internal addresses the host is refused
 * outright: which address a connection actually picks is not ours to
 * predict, so a public record must not whiten an internal neighbour.
 *
 * Residual risk, accepted in docs/research/interface-probe-address-posture.md:
 * DNS rebinding between this resolve step and the connect that follows is
 * out of scope here. Closing it means pinning the connection to the resolved
 * address with a custom dispatcher. For full-audit scanning, plan 059 raises
 * that from accepted risk to a requirement: `network-target-policy.ts` layers
 * pinning and redirect revalidation on top of this classifier, and the
 * prospecting probes continue to run with the residual risk their own posture
 * document accepted.
 */

import { lookup } from 'node:dns/promises';

export type RefusedAddressReason =
  | 'loopback'
  | 'private'
  | 'link-local'
  | 'unique-local'
  | 'unspecified'
  | 'multicast'
  | 'reserved'
  | 'unparseable';

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
  // 224.0.0.0/4 multicast and 240.0.0.0/4 reserved, which includes the
  // 255.255.255.255 broadcast address. Plan 059 section 5.2 names these
  // explicitly rather than leaving them to the transport: the earlier posture
  // reasoned that no HTTP fetch to them can succeed, but "the connection will
  // fail anyway" is a prediction about the network stack, not a refusal this
  // guard made, and it produces no auditable network-safety disposition when
  // a scanned page points at one.
  if ((o0 & 0xf0) === 224) return { kind: 'refused', reason: 'multicast' };
  if ((o0 & 0xf0) === 240) return { kind: 'refused', reason: 'reserved' };
  return { kind: 'allowed' };
}

/** The IPv4 address embedded in the final two hextets of an IPv6 address. */
function embeddedIpv4Octets(high: number, low: number): [number, number, number, number] {
  return [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff];
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
    return classifyIpv4Octets(embeddedIpv4Octets(g6, g7));
  }
  // Every remaining IPv6 form that carries an IPv4 address inside it is
  // classified through the IPv4 rules, for the reason the mapped case gives:
  // the spelling changes, the host reached does not. Without these, '::127.0.0.1',
  // '64:ff9b::127.0.0.1' and '2002:7f00:0001::' are three ways to write
  // loopback that walk straight past a guard that only knows '::ffff:'.
  //
  // ::/96 IPv4-compatible, deprecated but still parsed by getaddrinfo. The ::
  // and ::1 cases above already returned, so anything left here is a genuine
  // embedded address.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return classifyIpv4Octets(embeddedIpv4Octets(g6, g7));
  }
  // 64:ff9b::/96, the well-known NAT64 translation prefix.
  if (g0 === 0x0064 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return classifyIpv4Octets(embeddedIpv4Octets(g6, g7));
  }
  // 2002::/16 6to4, whose embedded IPv4 sits in the second and third hextets.
  if (g0 === 0x2002) return classifyIpv4Octets(embeddedIpv4Octets(g1, g2));
  // fc00::/7 unique-local (fc00 through fdff).
  if ((g0 & 0xfe00) === 0xfc00) return { kind: 'refused', reason: 'unique-local' };
  // fe80::/10 link-local (fe80 through febf).
  if ((g0 & 0xffc0) === 0xfe80) return { kind: 'refused', reason: 'link-local' };
  // ff00::/8 multicast, refused for the same reason as its IPv4 counterpart.
  if ((g0 & 0xff00) === 0xff00) return { kind: 'refused', reason: 'multicast' };
  return { kind: 'allowed' };
}

/** Classifies one address as it came back from resolution. Refuses every
 *  range that is not public-routable, including the multicast and reserved
 *  ranges an earlier posture left to the transport, and classifies each IPv6
 *  form that embeds an IPv4 address through the IPv4 rules so an alternative
 *  spelling cannot reach a host the dotted-quad form would have been refused
 *  for (plan 059 section 5.2). */
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
  /** Hosts fetched wherever they point, matched against the URL host
   *  (lowercase, IPv6 brackets stripped) before any lookup. */
  allowHosts?: ReadonlySet<string> | undefined;
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
  // an allowlisted host is fetched wherever it points.
  if (options.allowHosts?.has(host) === true) {
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
