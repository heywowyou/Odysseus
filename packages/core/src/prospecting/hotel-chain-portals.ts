/**
 * Corporate hotel-chain domains and brand names, for the directory facets
 * (issue #394). The Atout France export declares many franchise and managed
 * hotels with the chain's booking portal as their website (`marriott.fr`,
 * `all.accor.com`, `hotel-bb.com`). Parsed alone, such a portal is an ordinary
 * registrable domain and would read as the hotel's own site, inviting a full
 * crawl of a multinational's portal as if it were the hotel's.
 *
 * Kept apart from hotel-vendor-hosts.ts on purpose: a vendor host means "no
 * own domain yet, send to review"; a chain portal means "this establishment
 * belongs to a chain". Conflating them would either pitch a chain or discard
 * an independent (see that file's doc comment).
 *
 * Exact registrable-domain matches only, for the same reason as the vendor
 * list: a suffix or substring test would reclassify unrelated hotels.
 */

import type { DeclaredWebsiteResolution } from './hotel-domain.js';

export interface HotelChainPortal {
  /** Registrable domain, lowercase, no leading `www`. */
  domain: string;
  chain: string;
}

export const HOTEL_CHAIN_PORTALS: readonly HotelChainPortal[] = [
  { domain: 'accor.com', chain: 'Accor' },
  { domain: 'accorhotels.com', chain: 'Accor' },
  { domain: 'ibis.com', chain: 'Accor' },
  { domain: 'novotel.com', chain: 'Accor' },
  { domain: 'mercure.com', chain: 'Accor' },
  { domain: 'sofitel.com', chain: 'Accor' },
  { domain: 'pullmanhotels.com', chain: 'Accor' },
  { domain: 'marriott.com', chain: 'Marriott' },
  { domain: 'marriott.fr', chain: 'Marriott' },
  { domain: 'hotel-bb.com', chain: 'B&B Hotels' },
  { domain: 'bestwestern.com', chain: 'Best Western' },
  { domain: 'bestwestern.fr', chain: 'Best Western' },
  { domain: 'ihg.com', chain: 'IHG' },
  { domain: 'hilton.com', chain: 'Hilton' },
  { domain: 'hyatt.com', chain: 'Hyatt' },
  { domain: 'radissonhotels.com', chain: 'Radisson' },
  { domain: 'wyndhamhotels.com', chain: 'Wyndham' },
  { domain: 'choicehotels.com', chain: 'Choice Hotels' },
  { domain: 'louvrehotels.com', chain: 'Louvre Hotels' },
  { domain: 'campanile.com', chain: 'Louvre Hotels' },
  { domain: 'kyriad.com', chain: 'Louvre Hotels' },
  { domain: 'premiereclasse.com', chain: 'Louvre Hotels' },
  { domain: 'ennismore.com', chain: 'Ennismore' },
  { domain: '25hours-hotels.com', chain: 'Ennismore' },
];

const PORTALS_BY_DOMAIN: ReadonlyMap<string, HotelChainPortal> = new Map(
  HOTEL_CHAIN_PORTALS.map((entry) => [entry.domain, entry]),
);

export function findHotelChainPortal(registrableDomain: string): HotelChainPortal | undefined {
  return PORTALS_BY_DOMAIN.get(registrableDomain.trim().toLowerCase());
}

/** Brand names that only corporate chains use. Matched as whole words on the
 *  accent-folded establishment name. Federations of independents (Logis,
 *  The Originals, Relais & Châteaux) are deliberately absent. */
const CHAIN_BRAND_WORDS: readonly string[] = [
  'mgallery',
  'sofitel',
  'novotel',
  'ibis',
  'mercure',
  'pullman',
  'adagio',
  'b&b hotel',
  'b&b hotels',
  'best western',
  'kyriad',
  'campanile',
  'premiere classe',
  'holiday inn',
  'crowne plaza',
  'hilton',
  'marriott',
  'courtyard by marriott',
  'moxy',
  'radisson',
  'hyatt',
  'wyndham',
  'mama shelter',
  '25hours',
];

function foldName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const CHAIN_BRAND_PATTERN = new RegExp(
  `(^|[^\\p{L}\\p{N}])(${CHAIN_BRAND_WORDS.map(escapeRegExp).join('|')})($|[^\\p{L}\\p{N}])`,
  'u',
);

/** True when the establishment name carries a corporate chain brand, so it
 *  must not be presented as independent without review. */
export function hasHotelChainBrandName(name: string): boolean {
  return CHAIN_BRAND_PATTERN.test(foldName(name));
}

/** The directory/prospect website kind for a usable declared website. */
export function websiteKindForResolution(
  resolution: Exclude<DeclaredWebsiteResolution, { kind: 'unusable' }>,
): 'own' | 'vendor-hosted' | 'chain' {
  if (resolution.kind === 'vendor-hosted') return 'vendor-hosted';
  return findHotelChainPortal(resolution.registrableDomain) !== undefined ? 'chain' : 'own';
}
