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

/**
 * A8 (2026-08-24 three-site review): a real La Corniche report listed
 * criterion 2.1.3 in a table headed "Critères WCAG 2.2 niveau AA en
 * échec", with a blank name cell. 2.1.3 (Clavier, pas d'exception) is a
 * level AAA criterion, so it belonged in neither: the blank cell was the
 * visible symptom, the AA table carrying a AAA row was the real defect.
 *
 * axe-core does tag rules with AAA criteria, and its conformance-level
 * tags (`wcag2aaa`) are deliberately discarded by wcagCriteriaFromAxeTags
 * above - they describe a tag set, not a criterion - so a finding does
 * not record which level its criteria sit at. Rather than change the
 * locked Finding shape to carry a level, the level is recovered here from
 * the criterion number itself, which is a fixed published fact about WCAG
 * 2.2 rather than anything derived from a scan.
 *
 * The complete WCAG 2.2 level AAA set, 31 criteria. Listing AAA rather
 * than A/AA is deliberate: a criterion this codebase has never seen (a
 * future axe upgrade, a WCAG 2.3) is then treated as in-scope and shown,
 * rather than silently dropped from a conformance table. Over-reporting a
 * real failure is recoverable; hiding one is not.
 */
export const WCAG_AAA_CRITERIA: ReadonlySet<string> = new Set([
  '1.2.6', '1.2.7', '1.2.8', '1.2.9',
  '1.3.6',
  '1.4.6', '1.4.7', '1.4.8', '1.4.9',
  '2.1.3',
  '2.2.3', '2.2.4', '2.2.5', '2.2.6',
  '2.3.2', '2.3.3',
  '2.4.8', '2.4.9', '2.4.10', '2.4.12', '2.4.13',
  '2.5.5', '2.5.6',
  '3.1.3', '3.1.4', '3.1.5', '3.1.6',
  '3.2.5',
  '3.3.5', '3.3.6', '3.3.9',
]);

/** True when a criterion is within the level A / AA scope this report
 *  audits and states on its own cover. */
export function isAuditedConformanceLevel(criterion: string): boolean {
  return !WCAG_AAA_CRITERIA.has(criterion);
}
