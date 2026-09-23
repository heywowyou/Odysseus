/**
 * C6 (2026-08-24): does the phone number and postal address a human reads
 * on the page match the one the structured data declares to machines?
 *
 * NAP (name, address, phone) consistency is the signal that decides
 * whether a search engine or an AI assistant is confident enough to state
 * a business's contact details in an answer. A mismatch between the
 * footer and the JSON-LD is not a formatting nit: it is the machine-
 * readable copy and the human-readable copy disagreeing about a fact, and
 * the resolution is usually to distrust both.
 *
 * This is a `geo` finding, not `seo`. Per CLAUDE.md trade-off 14, `geo`
 * exists for AI-answer extractability specifically, and this is the
 * clearest case of it: an assistant asked "what is the phone number for
 * X" reads the structured data, and a contradiction on the page is
 * exactly what stops it answering.
 *
 * Runs inside the existing onRenderedPage hook against already-extracted
 * head metadata plus the page's own visible text. No extra page load, no
 * network.
 *
 * Deliberately narrow. It compares only what can be compared without
 * judgment:
 *
 *   - Phone numbers, reduced to their digits, so "+33 5 56 22 33 44",
 *     "05.56.22.33.44" and "0556223344" all compare equal. Only a genuine
 *     digit difference is reported.
 *   - Postal codes, five digits, which are unambiguous in France and do
 *     not suffer the street-abbreviation problem ("bd" / "boulevard" /
 *     "Bd.") that makes full address comparison a normalisation project
 *     rather than a check.
 *
 * Street names are NOT compared, on purpose. Deciding whether "12 bd
 * Wilson" and "12 boulevard du Président Wilson" are the same address is
 * a judgment call, and rule 1 forbids reaching for a model to make it.
 * Reporting a false mismatch on a correct address would be worse than
 * reporting nothing.
 */

import type { Page } from 'playwright';
import type { JsonLdBlock } from './head-metadata.js';

/** France: exactly five digits, and not part of a longer run, so a phone
 *  number or a price does not read as a postal code. */
const FRENCH_POSTAL_CODE_PATTERN = /(?<!\d)(\d{5})(?!\d)/g;

/** Matches the shapes French sites actually print: +33 prefixed, 0
 *  prefixed, separated by spaces, dots, dashes or non-breaking spaces. */
const PHONE_PATTERN = /(?:\+33|0033|0)\s?[1-9](?:[\s. -]?\d{2}){4}/g;

/** Digits only, with a leading 33 country code reduced to the national 0
 *  form, so the same number written either way compares equal. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/gu, '');
  // French international notation often keeps the domestic trunk zero in
  // parentheses: +33 (0)5... / 0033 (0)5.... It is the same national
  // number as 05..., not an extra digit.
  if (digits.startsWith('330') && digits.length === 12) return `0${digits.slice(3)}`;
  if (digits.startsWith('00330') && digits.length === 13) return `0${digits.slice(5)}`;
  if (digits.startsWith('0033')) return `0${digits.slice(4)}`;
  if (digits.startsWith('33') && digits.length === 11) return `0${digits.slice(2)}`;
  return digits;
}

/** Walks a parsed JSON-LD value, collecting every string reachable under
 *  the given key names at any depth. @graph, arrays and nested objects
 *  are all just values to recurse through, so no schema shape is
 *  assumed - a site nesting its LocalBusiness three levels deep inside a
 *  @graph is read the same as one declaring it at the top level. */
function collectJsonLdStrings(
  value: unknown,
  keys: readonly string[],
  found: string[] = [],
): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectJsonLdStrings(item, keys, found);
    return found;
  }
  if (value === null || typeof value !== 'object') return found;

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (keys.includes(key) && typeof nested === 'string') found.push(nested);
    collectJsonLdStrings(nested, keys, found);
  }
  return found;
}

export interface NapConsistencyCheckResult {
  pageUrl: string;
  /** Distinct normalized phone numbers declared in structured data. */
  structuredPhones: string[];
  /** Distinct normalized phone numbers found in the page's visible text. */
  visiblePhones: string[];
  /** Distinct postal codes declared in structured data. */
  structuredPostalCodes: string[];
  /** Distinct postal codes found in the page's visible text. */
  visiblePostalCodes: string[];
  /** True when structured data declares a phone that appears nowhere in
   *  the visible text, AND the visible text does contain some phone -
   *  a page with no phone at all is silent, not contradictory. */
  phoneMismatch: boolean;
  postalCodeMismatch: boolean;
}

export function buildNapConsistency(
  pageUrl: string,
  jsonLdBlocks: readonly JsonLdBlock[],
  visibleText: string,
): NapConsistencyCheckResult {
  const parsed = jsonLdBlocks.map((block) => block.parsed).filter((value) => value !== null);

  const structuredPhones = unique(
    collectJsonLdStrings(parsed, ['telephone', 'phone']).map(normalizePhone).filter(Boolean),
  );
  const structuredPostalCodes = unique(
    collectJsonLdStrings(parsed, ['postalCode']).map((v) => v.replace(/\D/gu, '')),
  );

  const visiblePhones = unique(
    (visibleText.match(PHONE_PATTERN) ?? []).map(normalizePhone).filter(Boolean),
  );
  const visiblePostalCodes = unique(
    [...visibleText.matchAll(FRENCH_POSTAL_CODE_PATTERN)].map((m) => m[1]!),
  );

  // A declared value that appears nowhere in the visible text is only a
  // contradiction if the page shows a value of that kind at all. A page
  // that simply does not print its phone number is not disagreeing with
  // anything, and reporting it would be reporting an absence as a
  // conflict.
  const phoneMismatch =
    structuredPhones.length > 0 &&
    visiblePhones.length > 0 &&
    !structuredPhones.some((phone) => visiblePhones.includes(phone));

  const postalCodeMismatch =
    structuredPostalCodes.length > 0 &&
    visiblePostalCodes.length > 0 &&
    !structuredPostalCodes.some((code) => visiblePostalCodes.includes(code));

  return {
    pageUrl,
    structuredPhones,
    visiblePhones,
    structuredPostalCodes,
    visiblePostalCodes,
    phoneMismatch,
    postalCodeMismatch,
  };
}

export async function checkNapConsistency(
  page: Page,
  pageUrl: string,
  jsonLdBlocks: readonly JsonLdBlock[],
): Promise<NapConsistencyCheckResult> {
  const visibleText = await page.evaluate(readContactRegionText);
  return buildNapConsistency(pageUrl, jsonLdBlocks, visibleText);
}

/**
 * The text of the page's own contact regions: header, footer, `address`,
 * schema.org contact properties, and the numbers behind `tel:` links. The
 * whole body is read only on a contact page. A news article that quotes a
 * tourist office's number is not the business stating its own, and
 * comparing against it reported a mismatch that did not exist.
 *
 * Runs in the page, so it must stay self-contained.
 */
export function readContactRegionText(): string {
  const path = window.location.pathname.toLowerCase();
  if (/contact|acces|access|coordonn|nous-trouver|find-us/.test(path)) {
    return document.body.innerText;
  }
  const selectors = [
    'header',
    'footer',
    '[role="banner"]',
    '[role="contentinfo"]',
    'address',
    '[itemprop="telephone"]',
    '[itemprop="address"]',
    '[itemprop="postalCode"]',
  ];
  const parts = new Set<string>();
  for (const element of Array.from(document.querySelectorAll<HTMLElement>(selectors.join(',')))) {
    parts.add(element.innerText);
  }
  for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="tel:"]'))) {
    parts.add(decodeURIComponent(link.getAttribute('href')!.slice(4)));
  }
  return [...parts].join('\n');
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}
