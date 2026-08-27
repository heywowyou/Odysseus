/**
 * Turns the website string a source declares into a decision about what, if
 * anything, the hotel owns. Pure and synchronous, the same posture as
 * hotel-star-rating.ts: adapters carry the raw string, core decides what it
 * means, so there is one implementation and one test surface.
 *
 * The return type is a discriminated union rather than a nullable string
 * because an unusable value has to reach the review queue carrying its reason.
 * A declared website of `pas encore en ligne` ("not online yet") and one of
 * `mailto:contact@...` are both unusable, but a human triaging them needs to
 * know which is which, and returning null for both throws that away.
 *
 * Registrable domains come from the public suffix list via tldts, not from
 * counting labels. Measured against the real Atout France export on
 * 2026-08-27: taking the last two labels is wrong for exactly eleven of 9,730
 * hosts, and ten of those eleven are site builders, where the error is not
 * cosmetic. Six hotels on `business.site` collapsing to one registrable domain
 * would be labelled a chain and dropped from the campaign. The eleventh is
 * `inghams.co.uk`.
 *
 * The public suffix list is necessary but not sufficient, which is why
 * hotel-vendor-hosts.ts exists alongside it. See that file's doc comment.
 */

import { parse } from 'tldts';
import { findHotelVendorHost, type HotelVendorHost } from './hotel-vendor-hosts.js';

export type DeclaredWebsiteUnusableReason =
  /** Not an address at all. The export really does carry 'pas encore en ligne'
   *  and 'en cours de construction' in the website column. */
  | 'not-a-url'
  /** Recognisably meant to be a URL, but written wrong: 'https:\\\\www.x.com',
   *  'https:/x.com', 'http:/https://x.com'. Kept apart from 'not-a-url' so
   *  review can tell a typo one person can fix from a hotel with no site. */
  | 'malformed-url'
  /** Parseable, but addresses something other than the web. */
  | 'unsupported-scheme'
  /** A literal IP, which is a host but can never be a registrable domain. */
  | 'ip-address'
  /** A host with no public suffix, such as a bare label or an intranet name. */
  | 'no-registrable-domain';

export type DeclaredWebsiteResolution =
  | {
      kind: 'own-domain';
      hostname: string;
      registrableDomain: string;
      subdomain: string;
      /** True when the registrable domain came from the public suffix list's
       *  private section. Such a host is per-hotel, so it is a usable key, but
       *  it is still a platform address rather than a domain the hotel owns. */
      isPrivateSuffix: boolean;
    }
  | {
      kind: 'vendor-hosted';
      hostname: string;
      registrableDomain: string;
      vendor: HotelVendorHost;
    }
  | { kind: 'unusable'; reason: DeclaredWebsiteUnusableReason };

/** A scheme is `letter *( letter / digit / "+" / "-" / "." ) ":"`, per RFC 3986.
 *  Matched explicitly so a value with a scheme can be told apart from a
 *  scheme-less hostname, which 873 real rows are. */
const SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):/iu;

function unusable(reason: DeclaredWebsiteUnusableReason): DeclaredWebsiteResolution {
  return { kind: 'unusable', reason };
}

export function normalizeDeclaredWebsite(raw: string): DeclaredWebsiteResolution {
  const trimmed = raw.trim();
  if (trimmed === '') return unusable('not-a-url');

  const schemeMatch = SCHEME_PATTERN.exec(trimmed);
  let absolute: string;
  if (schemeMatch === null) {
    absolute = `https://${trimmed}`;
  } else {
    const scheme = (schemeMatch[1] as string).toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') return unusable('unsupported-scheme');
    // A real http(s) URL has '//' after the colon. The export contains
    // 'https:\\www...', 'https:/villa-port-antibes.com', and
    // 'http:/https://www...', all of which parse into something plausible if
    // handed to a lenient parser and none of which is a usable address.
    if (!/^https?:\/\//iu.test(trimmed)) return unusable('malformed-url');
    absolute = trimmed;
  }

  // Whitespace in the authority means prose, not an address. Measured against
  // the real export: six otherwise valid chain URLs carry a stray space inside
  // the *path* ('.../hotel-1108-ibis- cognac/...'), so rejecting on whitespace
  // anywhere in the value discards six real hotels whose hostname is perfectly
  // good. Only the authority is tested.
  const authority = absolute.replace(/^https?:\/\//iu, '').split(/[/?#]/u)[0] ?? '';
  if (authority === '' || /\s/u.test(authority)) return unusable('not-a-url');

  const parsed = parse(absolute, { allowPrivateDomains: true });
  if (parsed.isIp === true) return unusable('ip-address');
  if (parsed.hostname === null) return unusable('not-a-url');
  if (parsed.domain === null) return unusable('no-registrable-domain');

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/u, '');
  const registrableDomain = parsed.domain.toLowerCase().replace(/\.$/u, '');
  const publicSuffix = (parsed.publicSuffix ?? '').toLowerCase();

  // Two ways to be vendor-hosted, and both are needed. A curated entry can
  // match the registrable domain ('business.site') or, when the public suffix
  // list has already split the platform off, its suffix ('wixsite.com' behind
  // 'hotelhavane.wixsite.com').
  const vendor = findHotelVendorHost(registrableDomain) ?? findHotelVendorHost(publicSuffix);
  if (vendor !== undefined) {
    return { kind: 'vendor-hosted', hostname, registrableDomain, vendor };
  }
  if (parsed.isPrivate === true) {
    // On the private list but not curated. Fail safe: an unrecognised platform
    // is still a platform, and calling it an own domain would put a stranger's
    // hosting product into the campaign as an independent hotel.
    return {
      kind: 'vendor-hosted',
      hostname,
      registrableDomain,
      vendor: {
        domain: publicSuffix === '' ? registrableDomain : publicSuffix,
        kind: 'shared-platform',
        reason:
          'Public suffix list private section: a platform that hosts third-party sites, not curated here.',
        measuredOccurrences: null,
      },
    };
  }

  return {
    kind: 'own-domain',
    hostname,
    registrableDomain,
    subdomain: (parsed.subdomain ?? '').toLowerCase(),
    isPrivateSuffix: false,
  };
}
