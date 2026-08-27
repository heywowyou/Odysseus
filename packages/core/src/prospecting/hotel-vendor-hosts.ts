/**
 * Registrable domains that host other businesses' websites: site builders,
 * booking engines, marketing federations, and online travel agencies. A hotel
 * whose declared website sits on one of these has told us where it publishes,
 * not what it owns.
 *
 * Compiled TypeScript rather than config/*.json, unlike free-mail-domains.ts
 * next door. That list is compliance-adjacent and edited by the operator when a
 * new consumer webmail brand appears. This one is edited content in the sense
 * reference-stats/stats.ts is: each entry is a claim about a specific host,
 * justified by a measurement or a named reason, and changing it changes who the
 * campaign treats as an independent hotel. It should move through review, not
 * through a JSON file.
 *
 * The list exists *in addition to* the public suffix list, not instead of it.
 * Measured against the real Atout France export on 2026-08-27: of the ten
 * site-builder hosts in it, the PSL private section covers only `wixsite.com`
 * (and `github.io`). `business.site`, `jimdo.com`, `jimdofree.com`,
 * `jimdosite.com`, `e-monsite.com`, `webnode.fr`, and `eatbu.com` all parse to
 * themselves as ordinary registrable domains, so without this list six hotels
 * on `business.site` and three on `jimdofree.com` would be merged into
 * fabricated chains.
 *
 * The distinction this list protects is the one plan 002 step 5 names: a
 * vendor-hosted independent hotel must never be labelled a chain. A shared
 * *vendor* domain means "no own domain yet, send it to review". A shared
 * *corporate* domain means "chain, exclude from the SMB campaign". Getting
 * those two backwards either pitches a chain or discards an independent.
 */

/** One host, with the reason it is here. The reason is the entry's whole
 *  justification, so it is a required field rather than a comment. */
export interface HotelVendorHost {
  /** Registrable domain, lowercase, no leading `www`. */
  domain: string;
  kind:
    | 'site-builder'
    | 'booking-engine'
    | 'federation'
    | 'online-travel-agency'
    /** Not a curated entry: a host the public suffix list's private section
     *  already identifies as a platform hosting third parties. Synthesized at
     *  classification time so an unlisted platform still fails safe. */
    | 'shared-platform';
  reason: string;
  /** Occurrences in the Atout France export measured 2026-08-27, or null for an
   *  entry listed on a named reason rather than an observation. */
  measuredOccurrences: number | null;
}

/** Every entry with a number was observed in the real national export. The
 *  numbers are provenance, not a threshold: an entry does not stop being a
 *  vendor host because a later export happens to contain one fewer hotel. */
export const HOTEL_VENDOR_HOSTS: readonly HotelVendorHost[] = [
  {
    domain: 'wixsite.com',
    kind: 'site-builder',
    reason: 'Wix free-tier subdomains. Also a PSL private suffix, so listed for intent as well.',
    measuredOccurrences: 18,
  },
  {
    domain: 'wix.com',
    kind: 'site-builder',
    reason: 'Wix hosted site builder, non-wixsite subdomain form.',
    measuredOccurrences: 1,
  },
  {
    domain: 'eatbu.com',
    kind: 'site-builder',
    reason: 'Eat-builder hospitality site builder. Not in any public suffix list.',
    measuredOccurrences: 17,
  },
  {
    domain: 'business.site',
    kind: 'site-builder',
    reason: "Google's business-profile site builder. Not in any public suffix list.",
    measuredOccurrences: 6,
  },
  {
    domain: 'e-monsite.com',
    kind: 'site-builder',
    reason: 'French hosted site builder.',
    measuredOccurrences: 4,
  },
  {
    domain: 'webnode.fr',
    kind: 'site-builder',
    reason: 'Webnode hosted site builder, French locale.',
    measuredOccurrences: 4,
  },
  {
    domain: 'jimdofree.com',
    kind: 'site-builder',
    reason: 'Jimdo free tier.',
    measuredOccurrences: 3,
  },
  {
    domain: 'jimdo.com',
    kind: 'site-builder',
    reason: 'Jimdo hosted site builder, paid-tier subdomain form.',
    measuredOccurrences: 1,
  },
  {
    domain: 'jimdosite.com',
    kind: 'site-builder',
    reason: 'Jimdo hosted site builder, current subdomain form.',
    measuredOccurrences: 1,
  },
  {
    domain: 'pagesperso-orange.fr',
    kind: 'site-builder',
    reason: 'Orange personal pages, a French ISP hosting product.',
    measuredOccurrences: 2,
  },
  {
    domain: 'octosite.net',
    kind: 'site-builder',
    reason: 'Web agency hosting client sites on its own domain.',
    measuredOccurrences: 1,
  },
  {
    domain: 'github.io',
    kind: 'site-builder',
    reason: 'GitHub Pages. Also a PSL private suffix, so listed for intent as well.',
    measuredOccurrences: 1,
  },
  {
    domain: 'ellohaweb.com',
    kind: 'booking-engine',
    reason: 'Elloha booking engine, hosting the property page itself.',
    measuredOccurrences: 5,
  },
  {
    domain: 'reservit.com',
    kind: 'booking-engine',
    reason: 'Reservit booking engine, hosting the property page itself.',
    measuredOccurrences: 1,
  },
  {
    domain: 'neo-direct-booking.com',
    kind: 'booking-engine',
    reason: 'Direct-booking engine hosting the property page.',
    measuredOccurrences: 1,
  },
  {
    domain: 'logishotels.com',
    kind: 'federation',
    reason:
      'Logis is a marketing federation of independent hotels, not a corporate chain. Its 45 measured properties are exactly the case that must reach review rather than be excluded as a chain.',
    measuredOccurrences: 45,
  },
  // Not measured in the current export. Listed because plan 003 resolves a
  // declared website rather than trusting the string, and a declared site can
  // redirect onto one of these. Kept to the handful large enough that a French
  // hotel plausibly lands there, rather than an aspiring catalogue of every OTA.
  {
    domain: 'booking.com',
    kind: 'online-travel-agency',
    reason: 'Reachable by redirect from a declared website.',
    measuredOccurrences: null,
  },
  {
    domain: 'expedia.fr',
    kind: 'online-travel-agency',
    reason: 'Reachable by redirect from a declared website.',
    measuredOccurrences: null,
  },
  {
    domain: 'expedia.com',
    kind: 'online-travel-agency',
    reason: 'Reachable by redirect from a declared website.',
    measuredOccurrences: null,
  },
  {
    domain: 'hotels.com',
    kind: 'online-travel-agency',
    reason: 'Reachable by redirect from a declared website.',
    measuredOccurrences: null,
  },
  {
    domain: 'tripadvisor.fr',
    kind: 'online-travel-agency',
    reason: 'Reachable by redirect from a declared website.',
    measuredOccurrences: null,
  },
  {
    domain: 'tripadvisor.com',
    kind: 'online-travel-agency',
    reason: 'Reachable by redirect from a declared website.',
    measuredOccurrences: null,
  },
  {
    domain: 'airbnb.fr',
    kind: 'online-travel-agency',
    reason: 'Reachable by redirect from a declared website.',
    measuredOccurrences: null,
  },
  {
    domain: 'trivago.fr',
    kind: 'online-travel-agency',
    reason: 'Reachable by redirect from a declared website.',
    measuredOccurrences: null,
  },
];

const BY_DOMAIN: ReadonlyMap<string, HotelVendorHost> = new Map(
  HOTEL_VENDOR_HOSTS.map((entry) => [entry.domain, entry]),
);

/** Looks up an exact registrable domain. Deliberately not a suffix match: a
 *  suffix test would classify `notbooking.com` and, worse, would make adding
 *  one broad entry silently reclassify unrelated hotels. */
export function findHotelVendorHost(registrableDomain: string): HotelVendorHost | undefined {
  return BY_DOMAIN.get(registrableDomain.trim().toLowerCase());
}

export function isHotelVendorHost(registrableDomain: string): boolean {
  return findHotelVendorHost(registrableDomain) !== undefined;
}
