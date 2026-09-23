/**
 * Operator decision, 2026-09-23: Odysseus audits businesses in France and
 * the EU only. French territories outside the EU are out of scope: they
 * keep their own company registers (New Caledonia's RIDET, French
 * Polynesia's numéro TAHITI) and their own accessibility rules, so the
 * SIREN, obligation and legal wording the product relies on do not hold
 * there. A Nouméa hotel's audit showed every one of those assumptions
 * failing at once.
 *
 * In scope: metropolitan France, the five overseas departments and regions
 * and Saint-Martin, which are EU outermost regions. Out of scope: Saint-Pierre-
 * et-Miquelon, Saint-Barthélemy, Wallis-et-Futuna, French Polynesia, New
 * Caledonia and the French Southern and Antarctic Lands, which are overseas
 * countries and territories of the EU, not part of it.
 */

/** Postcode prefixes of the French territories outside the EU. */
const NON_EU_POSTCODE_PREFIXES = ['975', '97133', '984', '986', '987', '988'] as const;

/** Country-code domains of the same territories. */
const NON_EU_FRENCH_DOMAIN_SUFFIXES = ['.pm', '.bl', '.tf', '.wf', '.pf', '.nc'] as const;

export function isNonEuFrenchPostcode(postcode: string | undefined): boolean {
  const digits = postcode?.replace(/\s/g, '') ?? '';
  return (
    /^\d{5}$/.test(digits) && NON_EU_POSTCODE_PREFIXES.some((prefix) => digits.startsWith(prefix))
  );
}

export function isNonEuFrenchDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/\.$/, '');
    return NON_EU_FRENCH_DOMAIN_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

/** A site or business Odysseus does not audit: located, by postcode or by
 *  its website's country-code domain, in a French territory outside the EU. */
export function isOutsideEuTerritory(input: {
  postcode?: string | undefined;
  url?: string | undefined;
}): boolean {
  return (
    isNonEuFrenchPostcode(input.postcode) ||
    (input.url !== undefined && isNonEuFrenchDomain(input.url))
  );
}
