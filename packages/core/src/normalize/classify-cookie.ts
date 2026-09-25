/**
 * Which observed cookies belong to a measurement or advertising product
 * (issue #493).
 *
 * Classification lives here, in normalization, rather than in the scanner:
 * the normalizer re-classifies the cookies a stored scan recorded, so a
 * correction to this table fixes stored audits on their next refresh instead
 * of only future scans.
 *
 * Deliberately a short list of certainties rather than a broad heuristic: a
 * false positive here tells a client they have a legal problem they do not
 * have, which is worse than missing one. A session or CSRF cookie a CMS
 * invents cannot be classified from its name and is correctly not classified
 * at all.
 *
 * Two kinds of entry:
 *
 * - A distinctive prefix no first-party cookie plausibly shares (`_ga`,
 *   `_fbp`). Matched case-insensitively, prefix-wise, whatever the cookie's
 *   domain, because several carry a per-property suffix (`_ga_G-XXXX`) and
 *   the vendor's script writes them on the site's own domain.
 * - A short or generic name (`fr`, `ide`, `muid`, `bcookie`). Matched
 *   exactly, and only when the cookie is set on the vendor's own registrable
 *   domain. Prefix-matching `fr` classified Magento's `frontend` and a
 *   site's `fr_lang` as Meta cookies.
 */

import { getDomain } from 'tldts';

const DISTINCTIVE_PREFIXES: readonly { prefix: string; vendor: string }[] = [
  { prefix: '_ga', vendor: 'Google Analytics' },
  { prefix: '_gid', vendor: 'Google Analytics' },
  { prefix: '_gat', vendor: 'Google Analytics' },
  { prefix: '__utm', vendor: 'Google Analytics (legacy)' },
  { prefix: '_gcl_', vendor: 'Google Ads' },
  { prefix: '_fbp', vendor: 'Meta Pixel' },
  { prefix: '_fbc', vendor: 'Meta Pixel' },
  { prefix: '_hj', vendor: 'Hotjar' },
  { prefix: '_clck', vendor: 'Microsoft Clarity' },
  { prefix: '_clsk', vendor: 'Microsoft Clarity' },
  { prefix: '_pin_unauth', vendor: 'Pinterest' },
  { prefix: '_pinterest_', vendor: 'Pinterest' },
  { prefix: '_tt_enable_cookie', vendor: 'TikTok' },
  { prefix: '_ttp', vendor: 'TikTok' },
  { prefix: '_uetsid', vendor: 'Microsoft UET' },
  { prefix: '_uetvid', vendor: 'Microsoft UET' },
  { prefix: '_hstc', vendor: 'HubSpot' },
  { prefix: 'hubspotutk', vendor: 'HubSpot' },
  { prefix: '_mkto_trk', vendor: 'Marketo' },
  { prefix: 'ajs_', vendor: 'Segment' },
  { prefix: 'amplitude_', vendor: 'Amplitude' },
  { prefix: '_pk_', vendor: 'Matomo' },
];

/** Exact names, lowercased, each valid only on the listed registrable
 *  domains: the vendor's own. */
const VENDOR_DOMAIN_NAMES: readonly { name: string; domains: readonly string[]; vendor: string }[] =
  [
    { name: 'fr', domains: ['facebook.com'], vendor: 'Meta' },
    { name: 'ide', domains: ['doubleclick.net'], vendor: 'Google DoubleClick' },
    { name: 'test_cookie', domains: ['doubleclick.net'], vendor: 'Google DoubleClick' },
    { name: 'muid', domains: ['bing.com', 'clarity.ms'], vendor: 'Microsoft Advertising' },
    { name: 'personalization_id', domains: ['twitter.com', 'x.com'], vendor: 'X (Twitter)' },
    { name: 'li_sugr', domains: ['linkedin.com'], vendor: 'LinkedIn' },
    { name: 'bcookie', domains: ['linkedin.com'], vendor: 'LinkedIn' },
    { name: 'bscookie', domains: ['linkedin.com'], vendor: 'LinkedIn' },
    { name: 'lidc', domains: ['linkedin.com'], vendor: 'LinkedIn' },
  ];

/** Mixpanel's documented cookie: `mp_<32-hex project token>_mixpanel`. A bare
 *  `mp_` prefix also matched unrelated first-party names. */
const MIXPANEL_COOKIE = /^mp_[0-9a-f]{32}_mixpanel$/u;

export interface CookieToClassify {
  name: string;
  /** The cookie's Domain attribute as the browser recorded it, possibly with
   *  a leading dot. */
  domain: string;
}

function registrableDomain(cookieDomain: string): string | undefined {
  const host = cookieDomain.replace(/^\./u, '').toLowerCase();
  return getDomain(host) ?? undefined;
}

export function classifyCookie(cookie: CookieToClassify): { vendor: string } | undefined {
  const lower = cookie.name.toLowerCase();
  for (const entry of DISTINCTIVE_PREFIXES) {
    if (lower.startsWith(entry.prefix)) return { vendor: entry.vendor };
  }
  if (MIXPANEL_COOKIE.test(lower)) return { vendor: 'Mixpanel' };
  const domain = registrableDomain(cookie.domain);
  if (domain === undefined) return undefined;
  for (const entry of VENDOR_DOMAIN_NAMES) {
    if (lower === entry.name && entry.domains.includes(domain)) return { vendor: entry.vendor };
  }
  return undefined;
}
