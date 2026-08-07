/**
 * LCEN article 6-III mentions-legales extraction: SIREN (checksum
 * validated), RCS, and TVA intracommunautaire numbers. Pure regex over
 * already-extracted page text (page.evaluate(() => document.body.
 * innerText), the same idiom render-diff.ts already uses) - no HTML
 * parser added to the dependency tree, matching extract-text.ts's own
 * hand-rolled approach.
 */

import { isValidSiren, LEGAL_PATH_PATTERN } from '@odysseus/core';

export interface MentionsLegalesExtraction {
  pageUrl: string;
  siren?: string;
  rcs?: string;
  tva?: string;
}

const SIREN_CANDIDATE_PATTERN = /\b(\d{3}\s?\d{3}\s?\d{3})\b/g;
const RCS_PATTERN = /RCS\s+([A-Za-zÀ-ÿ\-\s]{2,40}?)\s+(\d{3}\s?\d{3}\s?\d{3})/i;
const TVA_PATTERN = /\bFR\s?[0-9A-Z]{2}\s?\d{9}\b/i;

/**
 * URL-pattern heuristic only, no navigation. Reuses core's shared
 * LEGAL_PATH_PATTERN (the same pattern packages/llm's diversion logic
 * uses) narrowed to the mentions-legales alternative specifically, so the
 * page this check treats as the mentions-legales page can never disagree
 * with what diversion.ts treats as a legal-style page.
 */
export function findMentionsLegalesUrl(pageUrls: readonly string[]): string | null {
  const match = pageUrls.find((url) => LEGAL_PATH_PATTERN.test(url) && /mentions/i.test(url));
  return match ?? null;
}

function firstValidSiren(bodyText: string): string | undefined {
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
