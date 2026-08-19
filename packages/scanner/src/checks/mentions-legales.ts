/**
 * LCEN article 6-III mentions-legales extraction: SIREN (checksum
 * validated), RCS, and TVA intracommunautaire numbers. Pure regex over
 * already-extracted page text (page.evaluate(() => document.body.
 * innerText), the same idiom render-diff.ts already uses) - no HTML
 * parser added to the dependency tree, matching extract-text.ts's own
 * hand-rolled approach.
 */

import { isValidSiren } from '@odysseus/core';

export interface MentionsLegalesExtraction {
  pageUrl: string;
  siren?: string;
  rcs?: string;
  tva?: string;
}

const SIREN_CANDIDATE_PATTERN = /\b(\d{3}\s?\d{3}\s?\d{3})\b/g;
// A SIRET is a SIREN (9 digits) followed by a 5 digit NIC, usually printed
// with no separating space (e.g. "RCS/RM/Siret : 95126636000019"), which
// is why it needs its own 14-digit pattern rather than relying on
// SIREN_CANDIDATE_PATTERN to find the embedded SIREN: \b word boundaries
// never fire in the middle of one continuous digit run, so a bare SIREN
// pattern can never match a SIREN that only appears fused inside a SIRET.
const SIRET_CANDIDATE_PATTERN = /\b(\d{3}\s?\d{3}\s?\d{3}\s?\d{5})\b/g;
const RCS_PATTERN = /RCS\s+([A-Za-zÀ-ÿ\-\s]{2,40}?)\s+(\d{3}\s?\d{3}\s?\d{3})/i;
const TVA_PATTERN = /\bFR\s?[0-9A-Z]{2}\s?\d{9}\b/i;
// item 0.6 (La Corniche pass): the plural/singular "mentions-legales" form
// alone missed a real site whose registry data lived at
// /conditions-generales-dutilisation/ instead - live-confirmed the SIREN
// (as part of a full SIRET) is printed there. Broadened to the other page
// families that commonly carry the LCEN block (CGU, CGV, conditions
// générales), still narrower than the full LEGAL_PATH_PATTERN on purpose:
// that pattern also matches cookies/privacy/confidentialite/terms/legal,
// which are almost never where a SIREN is printed and would risk
// findMentionsLegalesUrl locking onto the wrong page when a site has both
// a cookie-consent page and a real legal-notice page. Singular
// ("mention-legale") is a real variant seen on live sites, not just the
// plural form. Known simplification: if a site has more than one matching
// page (e.g. both /mentions-legales/ and /cgu/), the first one encountered
// in crawl order wins - not revisited here since no real site scanned so
// far has exercised that case.
const MENTIONS_LEGALES_PATH_PATTERN = /mentions?-legales?|\bcgu\b|\bcgv\b|conditions-generales/i;

/**
 * URL-pattern heuristic only, no navigation. Only considers URLs that
 * actually resolved (the caller is expected to have already filtered out
 * non-2xx pages) - a crawled URL can match the path pattern and still be a
 * dead link (e.g. a malformed href), which must never win over a real page
 * just because it happens to appear earlier in the list.
 */
export function findMentionsLegalesUrl(pageUrls: readonly string[]): string | null {
  const match = pageUrls.find((url) => MENTIONS_LEGALES_PATH_PATTERN.test(url));
  return match ?? null;
}

// item 0.1/0.6 (La Corniche pass): confirmed live that a single legal
// page can carry more than one valid-looking SIREN. lacoorniche.com's
// CGU page states its own SIRET next to its own address, but also
// carries a web agency's RCS/SIREN as boilerplate elsewhere in the same
// text (a different city, a different address) - both are 9-digit,
// Luhn-valid, and the bare-SIREN pattern happened to match the agency's
// number first. A number embedded in a full 14-digit SIRET is a
// stronger, more specific claim of "this is our own registration" than
// a bare 9-digit match that could be quoting any company mentioned on
// the page (an agency credit, a hosting provider, a franchise licensor),
// so SIRET extraction is tried first, not as a fallback.
function firstValidSiren(bodyText: string): string | undefined {
  for (const match of bodyText.matchAll(SIRET_CANDIDATE_PATTERN)) {
    const siret = match[1]?.replace(/\s/g, '');
    const candidate = siret?.slice(0, 9);
    if (candidate && isValidSiren(candidate)) return candidate;
  }
  for (const match of bodyText.matchAll(SIREN_CANDIDATE_PATTERN)) {
    const candidate = match[1]?.replace(/\s/g, '');
    if (candidate && isValidSiren(candidate)) return candidate;
  }
  return undefined;
}

export function extractMentionsLegales(pageUrl: string, bodyText: string): MentionsLegalesExtraction {
  const result: MentionsLegalesExtraction = { pageUrl };

  const siren = firstValidSiren(bodyText);
  if (siren !== undefined) result.siren = siren;

  const rcsMatch = bodyText.match(RCS_PATTERN);
  const city = rcsMatch?.[1]?.trim();
  const rcsNumber = rcsMatch?.[2]?.replace(/\s/g, '');
  if (city && rcsNumber) result.rcs = `${city} ${rcsNumber}`;

  const tvaMatch = bodyText.match(TVA_PATTERN);
  if (tvaMatch) result.tva = tvaMatch[0].replace(/\s/g, '').toUpperCase();

  return result;
}
