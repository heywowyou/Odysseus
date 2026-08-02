/**
 * axe-core tags every WCAG success criterion as `wcag` + a 1-digit
 * principle + a 1-digit guideline + a 1-2 digit criterion number, e.g.
 * `wcag1412` -> 1.4.12, `wcag258` -> 2.5.8. Verified against the installed
 * axe-core package: no WCAG guideline number is ever more than one digit,
 * so this is unambiguous. Conformance-level tags such as `wcag2a` or
 * `wcag21aa` don't match this shape and are correctly excluded, since they
 * describe a tag set, not a success criterion.
 */
const WCAG_SC_TAG_PATTERN = /^wcag([1-4])(\d)(\d{1,2})$/;

/** Extracts and formats WCAG success criteria (e.g. "1.4.3") from a set of
 *  axe-core tags. Returns a sorted, deduped list. */
export function wcagCriteriaFromAxeTags(tags: readonly string[]): string[] {
  const criteria = new Set<string>();

  for (const tag of tags) {
    const match = WCAG_SC_TAG_PATTERN.exec(tag);
    if (!match) continue;
    const [, principle, guideline, criterion] = match;
    criteria.add(`${principle}.${guideline}.${criterion}`);
  }

  return [...criteria].sort(compareCriteria);
}

/** Exported so callers merging wcagCriteria lists across candidates (see
 *  normalize.ts) can sort the union with the same numeric-aware ordering,
 *  rather than a plain lexicographic sort that would misorder "1.4.10"
 *  before "1.4.2". */
export function compareCriteria(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
