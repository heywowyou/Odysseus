import { compareCriteria, HEURISTIC_RULE_IDS, type Finding } from '@odysseus/core';

/** Per-criterion rollup for the conformance summary (docs/report-v2-refactor.md
 *  C20/C21): a WCAG failure is a different kind of fact from a slow
 *  image, and this is the page that can be handed to a lawyer or agency
 *  as-is. A finding carrying more than one criterion is counted under
 *  each - the same finding can be evidence for two separate conformance
 *  gaps at once.
 *
 *  item 1.11: `pages` used to be the single worst finding's own page
 *  count ("Pages (max)"), which could and did read as a different, lower
 *  number than the union-based "en échec sur N pages" headline stat
 *  elsewhere in the report (a real report showed 9 here against 10 there)
 *  when two different findings map to the same criterion on overlapping
 *  but not identical page sets. Tracked as a Set of page URLs per
 *  criterion instead, so this table's own count is the true union and can
 *  never disagree with a union-based figure computed anywhere else. */
export interface ConformanceRow {
  criterion: string;
  findingCount: number;
  totalOccurrences: number;
  pages: number;
}

function rollup(findings: readonly Finding[], includeHeuristic: boolean): ConformanceRow[] {
  const counts = new Map<string, { findingCount: number; totalOccurrences: number; pages: Set<string> }>();

  for (const finding of findings) {
    if (finding.category !== 'accessibility' || finding.wcagCriteria.length === 0) continue;
    if (HEURISTIC_RULE_IDS.has(finding.ruleId) !== includeHeuristic) continue;
    for (const criterion of finding.wcagCriteria) {
      const row = counts.get(criterion) ?? { findingCount: 0, totalOccurrences: 0, pages: new Set<string>() };
      row.findingCount += 1;
      row.totalOccurrences += finding.occurrences;
      for (const url of finding.pageUrls) row.pages.add(url);
      counts.set(criterion, row);
    }
  }

  const map = new Map<string, ConformanceRow>(
    [...counts.entries()].map(([criterion, row]) => [
      criterion,
      { criterion, findingCount: row.findingCount, totalOccurrences: row.totalOccurrences, pages: row.pages.size },
    ]),
  );

  return [...map.values()].sort((a, b) => compareCriteria(a.criterion, b.criterion));
}

/** item 8: only rules NOT in HEURISTIC_RULE_IDS (e.g. axe-core's own
 *  image-alt) count as a genuine WCAG conformance failure here.
 *  `alt-text-quality-heuristic` used to be folded into this same rollup,
 *  so a heuristic red-flag on alt-text quality (the methodology page's
 *  own words) rendered as a hard criterion failure in the one table a
 *  client might hand straight to a lawyer - 157 of that heuristic's
 *  occurrences alone, in the report that prompted this fix. */
export function buildConformanceRollup(findings: readonly Finding[]): ConformanceRow[] {
  return rollup(findings, false);
}

/** The heuristic-only counterpart: rendered in its own clearly labeled
 *  block ("Signaux à vérifier" / heuristic quality flags), never merged
 *  into buildConformanceRollup's table. A criterion can legitimately
 *  appear in both rollups at once (e.g. 1.1.1 failing from a genuine
 *  axe image-alt finding AND separately flagged by the alt-text
 *  heuristic on different images) - that is not a bug, the two rollups
 *  answer different questions about different findings. */
export function buildHeuristicRollup(findings: readonly Finding[]): ConformanceRow[] {
  return rollup(findings, true);
}

/** item 1.2 (La Corniche pass): the table's own occurrence column
 *  legitimately does not sum to the accessibility-occurrences tile
 *  elsewhere in the report - a finding mapped to two criteria is counted
 *  under both rows by design (see the module doc comment above) - but
 *  nothing said so, and a real report showed a 208-occurrence gap an
 *  agency had to puzzle out unaided. Used to render a footnote only when
 *  it would actually apply, not unconditionally. */
export function hasMultiCriterionFinding(findings: readonly Finding[]): boolean {
  return findings.some(
    (finding) =>
      finding.category === 'accessibility' && !HEURISTIC_RULE_IDS.has(finding.ruleId) && finding.wcagCriteria.length > 1,
  );
}

/** Distinct pages carrying at least one accessibility finding with a WCAG
 *  criterion - the "sur M pages" half of the stats page's wide tile and
 *  the conformance summary's framing. item 8: excludes HEURISTIC_RULE_IDS
 *  findings for the same reason buildConformanceRollup does - this count
 *  feeds the same page-5 headline that must not be inflated by a
 *  heuristic red-flag. */
export function pagesWithWcagFailures(findings: readonly Finding[]): number {
  const pages = new Set<string>();
  for (const finding of findings) {
    if (finding.category === 'accessibility' && finding.wcagCriteria.length > 0 && !HEURISTIC_RULE_IDS.has(finding.ruleId)) {
      for (const url of finding.pageUrls) pages.add(url);
    }
  }
  return pages.size;
}
