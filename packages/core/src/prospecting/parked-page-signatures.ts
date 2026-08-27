/**
 * Registrar and holding-page signatures, curated the way hotel-vendor-hosts.ts
 * is curated: a hand-maintained list with a stated reason per entry, not a
 * clever heuristic. A false positive here silently deletes a real hotel from
 * the campaign, so the bar for adding a signature is that it appears on
 * holding pages and could not plausibly appear on a working hotel homepage.
 *
 * Two rules keep that bar enforceable. Matching is on the extracted visible
 * text, lowercased and accent-folded, never on raw HTML - a script tag naming
 * a registrar's analytics is not a holding page. And a signature must be a
 * phrase, never a single word: "parking" is a hotel amenity in French and
 * English both, and matching it would reject exactly the properties this
 * campaign wants.
 */

export interface ParkedPageSignature {
  /** Lowercased, accent-folded phrase to look for in the page's visible text. */
  phrase: string;
  /** Who publishes it, so a later reader can verify the entry rather than
   *  trusting it. */
  attribution: string;
}

export const PARKED_PAGE_SIGNATURES: readonly ParkedPageSignature[] = [
  { phrase: 'ce nom de domaine est enregistre', attribution: 'OVH holding page' },
  { phrase: 'domaine reserve', attribution: 'French registrar holding page' },
  { phrase: 'site en construction', attribution: 'generic French holding page' },
  { phrase: 'site en cours de construction', attribution: 'generic French holding page' },
  { phrase: 'page en construction', attribution: 'generic French holding page' },
  { phrase: 'under construction', attribution: 'generic English holding page' },
  { phrase: 'coming soon', attribution: 'generic English holding page' },
  { phrase: 'this domain is for sale', attribution: 'domain marketplace' },
  { phrase: 'ce domaine est a vendre', attribution: 'domain marketplace' },
  { phrase: 'buy this domain', attribution: 'domain marketplace' },
  { phrase: 'domain name is parked', attribution: 'generic parking service' },
  { phrase: 'nom de domaine parked', attribution: 'generic parking service' },
  { phrase: 'default web site page', attribution: 'unconfigured web server default' },
  { phrase: 'apache2 default page', attribution: 'unconfigured web server default' },
  { phrase: 'welcome to nginx', attribution: 'unconfigured web server default' },
  { phrase: 'it works!', attribution: 'unconfigured Apache default' },
  { phrase: 'future home of something quite cool', attribution: 'unconfigured server default' },
  { phrase: 'compte suspendu', attribution: 'suspended hosting account' },
  { phrase: 'account suspended', attribution: 'suspended hosting account' },
];

/** Lowercase and strip diacritics so 'réservé' and 'reserve' compare equal.
 *  The same normalization the signature phrases above are already written in,
 *  applied to the page rather than assumed of it. */
export function foldForSignatureMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Returns the matching signature's attribution, or null. Returning which one
 *  matched rather than a boolean is what makes a false positive diagnosable
 *  from stored data instead of by re-fetching the site. */
export function matchParkedPageSignature(visibleText: string): string | null {
  const folded = foldForSignatureMatch(visibleText);
  for (const signature of PARKED_PAGE_SIGNATURES) {
    if (folded.includes(signature.phrase)) return signature.attribution;
  }
  return null;
}
