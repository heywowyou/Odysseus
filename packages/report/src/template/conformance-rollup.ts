import { compareCriteria, type Finding } from '@odysseus/core';

/** Per-criterion rollup for the conformance summary (docs/report-v2-refactor.md
 *  C20/C21): a WCAG failure is a different kind of fact from a slow
 *  image, and this is the page that can be handed to a lawyer or agency
 *  as-is. A finding carrying more than one criterion is counted under
 *  each - the same finding can be evidence for two separate conformance
 *  gaps at once. */
export interface ConformanceRow {
  criterion: string;
  findingCount: number;
  totalOccurrences: number;
  maxPages: number;
}

export function buildConformanceRollup(findings: readonly Finding[]): ConformanceRow[] {
  const map = new Map<string, ConformanceRow>();

  for (const finding of findings) {
    if (finding.category !== 'accessibility' || finding.wcagCriteria.length === 0) continue;
    for (const criterion of finding.wcagCriteria) {
      const row = map.get(criterion) ?? { criterion, findingCount: 0, totalOccurrences: 0, maxPages: 0 };
      row.findingCount += 1;
      row.totalOccurrences += finding.occurrences;
      row.maxPages = Math.max(row.maxPages, finding.pageUrls.length);
      map.set(criterion, row);
    }
  }

  return [...map.values()].sort((a, b) => compareCriteria(a.criterion, b.criterion));
}

/** Distinct pages carrying at least one accessibility finding with a WCAG
 *  criterion - the "sur M pages" half of the stats page's wide tile and
 *  the conformance summary's framing. */
export function pagesWithWcagFailures(findings: readonly Finding[]): number {
  const pages = new Set<string>();
  for (const finding of findings) {
    if (finding.category === 'accessibility' && finding.wcagCriteria.length > 0) {
      for (const url of finding.pageUrls) pages.add(url);
    }
  }
  return pages.size;
}
