/**
 * LCEN article 1-1, I, 2° mentions-legales extraction: SIREN (checksum
 * validated), RCS, and TVA intracommunautaire numbers. Pure regex over
 * already-extracted page text (page.evaluate(() => document.body.
 * innerText), the same idiom render-diff.ts already uses) - no HTML
 * parser added to the dependency tree, matching extract-text.ts's own
 * hand-rolled approach.
 */

import { isValidSiren } from '@odysseus/core';
import type { MentionsLegalesCheckedPages } from '@odysseus/core';

export interface MentionsLegalesExtraction {
  pageUrl: string;
  siren?: string;
  rcs?: string;
  tva?: string;
  /** Plan 036: attached by scan-page.ts's call site, not by this pure
   *  text-extraction function, since the searched-URL list is a crawl-level
   *  fact this function never receives. See
   *  normalize-custom.ts's MentionsLegalesCheckedPages doc comment. */
  checkedPages?: MentionsLegalesCheckedPages;
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
// plural form. Issue #44 (Villas Foch): "mentions" compounded with
// credits/informations ("mentions-et-credits"), the French
// "informations-legales" compound, and the English "legals"/"legal-notice"
// forms are real registry-page names on multilingual hotel sites; bare
// "legal" stays excluded for the same wrong-lock reason as LEGAL_PATH
// above. Known simplification: if a site has more than one matching
// page (e.g. both /mentions-legales/ and /cgu/), the first one encountered
// in crawl order wins - not revisited here since no real site scanned so
// far has exercised that case.
const MENTIONS_LEGALES_PATH_PATTERN =
  /mentions?-legales?|mentions?-(?:et-)?(?:credits|informations)|informations?-legales?|conditions-generales|\bcgu\b|\bcgv\b|legal-notices?|\blegals\b/i;

function legalPageRank(url: string): number {
  let pathname: string;
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
  if (/mentions?-legales?/u.test(pathname)) return 0;
  if (/informations?-legales?/u.test(pathname)) return 1;
  if (/legal-notices?|\blegals\b/u.test(pathname)) return 2;
  if (/mentions?-(?:et-)?(?:credits|informations)/u.test(pathname)) return 3;
  if (/conditions-generales|\bcgu\b|\bcgv\b/u.test(pathname)) return 4;
  return Number.MAX_SAFE_INTEGER;
}

/** Resolved legal-page candidates, ranked so direct legal notices win over
 *  terms of sale/use pages when both are available. The pathname alone is
 *  examined: hostnames such as "hotel-cgv.example" cannot select a page. */
export function findMentionsLegalesUrls(pageUrls: readonly string[]): string[] {
  return pageUrls
    .filter((url) => {
      try {
        return MENTIONS_LEGALES_PATH_PATTERN.test(new URL(url).pathname);
      } catch {
        return false;
      }
    })
    .sort((left, right) => legalPageRank(left) - legalPageRank(right) || left.localeCompare(right));
}

/** Compatibility helper for callers that only need the preferred page. */
export function findMentionsLegalesUrl(pageUrls: readonly string[]): string | null {
  return findMentionsLegalesUrls(pageUrls)[0] ?? null;
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

// Issue #76 (Hotel Tandem case): a mentions-legales page with distinct
// "EDITEUR" and "Hebergement" blocks put the host's (O2Switch) SIRET
// before the site editor's (HOTELIFE) SIREN in document order, so the
// plain first-match scan above picked the host - a wrong SIREN then fed
// straight into assessObligations() as the audited company's own
// identity (non-negotiable rule 6). These patterns only match at the
// start of a line: "hebergement" alone, anywhere in body text, is an
// extremely common word on the hotel sites this product actually audits
// (lodging/accommodation, not web hosting), so a bare substring match
// would misfire constantly on this product's own target market. Real
// mentions-legales pages mark this distinction with a heading or a
// "Label : valeur" line, which the ^ (line-start) anchor captures without
// needing an HTML parser.
const EDITOR_SECTION_HEADER_PATTERN =
  /^[ \t]*(?:[ée]diteur(?:\s+du\s+site)?|responsable\s+de\s+la\s+publication)[ \t]*:?/gim;
const HOST_SECTION_HEADER_PATTERN = /^[ \t]*h[ée]berg(?:ement|eur)(?:\s+du\s+site)?[ \t]*:?/gim;

type LegalSectionType = 'editor' | 'host' | 'unlabeled';

/**
 * Splits body text into ordered segments by which labeled section (if any)
 * each stretch of text falls under. A segment runs from one recognized
 * header to the next (or to the end of the text); any text before the
 * first header is 'unlabeled'. Pages with no labeled sections at all
 * (the common case, and every pre-existing fixture) come back as a single
 * 'unlabeled' segment covering the whole text, preserving prior behavior.
 */
function splitLegalSections(bodyText: string): { type: LegalSectionType; text: string }[] {
  const headers: { index: number; type: LegalSectionType }[] = [];
  for (const match of bodyText.matchAll(EDITOR_SECTION_HEADER_PATTERN)) {
    if (match.index === undefined) continue;
    headers.push({ index: match.index, type: 'editor' });
  }
  for (const match of bodyText.matchAll(HOST_SECTION_HEADER_PATTERN)) {
    if (match.index === undefined) continue;
    headers.push({ index: match.index, type: 'host' });
  }
  if (headers.length === 0) return [{ type: 'unlabeled', text: bodyText }];
  headers.sort((a, b) => a.index - b.index);
  const firstHeader = headers[0];
  if (firstHeader === undefined) return [{ type: 'unlabeled', text: bodyText }];

  const segments: { type: LegalSectionType; text: string }[] = [];
  if (firstHeader.index > 0) {
    segments.push({ type: 'unlabeled', text: bodyText.slice(0, firstHeader.index) });
  }
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    if (header === undefined) continue;
    const next = headers[i + 1];
    const end = next === undefined ? bodyText.length : next.index;
    segments.push({ type: header.type, text: bodyText.slice(header.index, end) });
  }
  return segments;
}

/**
 * Section-aware wrapper around firstValidSiren: tries the editor-labeled
 * text first, then any unlabeled text, and only falls back to
 * host-labeled text last - a hosting provider's own SIRET can still win
 * when it is genuinely the only one on the page, just not by virtue of
 * appearing earlier in the raw text.
 */
function firstValidSirenPreferringEditor(bodyText: string): string | undefined {
  const sections = splitLegalSections(bodyText);
  const priorityOrder: readonly LegalSectionType[] = ['editor', 'unlabeled', 'host'];
  for (const wantedType of priorityOrder) {
    const text = sections
      .filter((section) => section.type === wantedType)
      .map((section) => section.text)
      .join('\n');
    if (!text) continue;
    const found = firstValidSiren(text);
    if (found) return found;
  }
  return undefined;
}

export function extractMentionsLegales(
  pageUrl: string,
  bodyText: string,
): MentionsLegalesExtraction {
  const result: MentionsLegalesExtraction = { pageUrl };

  const siren = firstValidSirenPreferringEditor(bodyText);
  if (siren !== undefined) result.siren = siren;

  const rcsMatch = bodyText.match(RCS_PATTERN);
  const city = rcsMatch?.[1]?.trim();
  const rcsNumber = rcsMatch?.[2]?.replace(/\s/g, '');
  if (city && rcsNumber) result.rcs = `${city} ${rcsNumber}`;

  const tvaMatch = bodyText.match(TVA_PATTERN);
  if (tvaMatch) result.tva = tvaMatch[0].replace(/\s/g, '').toUpperCase();

  return result;
}
