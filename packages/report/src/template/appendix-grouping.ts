import { compareCriteria, SEVERITY_ORDER, type Finding, type Severity } from '@odysseus/core';

/** Pure grouping/sorting over Finding[], no schema change - the fix for
 *  B11-B13 and D28. Rows for one rule are adjacent, groups ordered by
 *  severity then total occurrences, per docs/archive/report-v2-refactor.md 3.3.
 *  Reuses @odysseus/core's own SEVERITY_ORDER (critical highest) rather
 *  than a second, locally-scoped severity ordering. */
export interface RuleGroup {
  ruleId: string;
  severity: Severity;
  findings: Finding[];
  totalOccurrences: number;
  /** item 1.6 (La Corniche pass): union of page URLs across every finding
   *  in the group, not the largest single finding's own page count. Used
   *  to read `Math.max(...finding.pageUrls.length)`, rendered as "jusqu'à
   *  N pages" ("up to") - defensible in isolation, but a priority card
   *  for the same rule states "N pages sur M", itself a union across the
   *  theme's findings, so a real report showed two different page counts
   *  for the same rule (18 vs. "jusqu'à 17"). Both now read from the same
   *  union-of-pageUrls computation, so they can no longer disagree.
   *  Issue #291: when the caller supplies the analysed (visited-scope)
   *  page set, the union counts in-scope URLs only, so the figure can
   *  never exceed the analysed-page total. */
  pages: number;
  /** Union across the group, numerically sorted. */
  wcagCriteria: string[];
}

/** report-feedback-palais-gallien.md item 26: every severity, minor
 *  included, groups and renders through this one function now - the
 *  separate minor-findings condensation pass (aggregateMinorFindings,
 *  removed) gated full page/selector detail behind "available on request
 *  in the technical export," a mechanism that never existed anywhere in
 *  the codebase, inside a section titled "Liste complète des constats"
 *  for the single paid tier this product now has (CLAUDE.md trade-off
 *  12). Severity ordering already sorts minor groups to the bottom
 *  (SEVERITY_ORDER below), so they still read as secondary without
 *  having their own detail withheld.
 *
 *  Issue #291: scopePageUrls is the analysed (visited-scope) page set the
 *  group page counts are confined to. Findings record every real URL -
 *  language variants kept after a translation-cluster merge, and
 *  origin-level findings citing discovered-but-not-scanned pages - so the
 *  raw union can exceed the analysed-page total (a real report claimed
 *  206 pages out of 140). Findings and occurrences are unchanged: pages
 *  are counted, occurrences are not page counts. Undefined keeps the
 *  pre-#291 raw union; findings-appendix.ts always passes the scope.
 *
 *  Issue #308: seven Lighthouse image rules used to be folded into one
 *  synthetic "image-weight" group here (item 1.3), so the annex titled a
 *  finding "Images trop lourdes ou mal optimisées" while "Reste à traiter"
 *  and the priority cards, which group by rule, gave the same finding its
 *  own rule's title. A family split across two severities also printed two
 *  groups under one title. Groups are now per rule, like every other
 *  section, so a reader following a finding id lands on the title they
 *  followed. */
export function groupAppendix(
  findings: readonly Finding[],
  scopePageUrls?: ReadonlySet<string>,
): RuleGroup[] {
  const map = new Map<string, RuleGroup>();
  const pageSets = new Map<string, Set<string>>();

  for (const finding of findings) {
    const key = `${finding.ruleId}::${finding.severity}`;
    const group = map.get(key) ?? {
      ruleId: finding.ruleId,
      severity: finding.severity,
      findings: [],
      totalOccurrences: 0,
      pages: 0,
      wcagCriteria: [],
    };
    group.findings.push(finding);
    group.totalOccurrences += finding.occurrences;
    const pageSet = pageSets.get(key) ?? new Set<string>();
    for (const url of finding.pageUrls) {
      if (scopePageUrls !== undefined && !scopePageUrls.has(url)) continue;
      pageSet.add(url);
    }
    pageSets.set(key, pageSet);
    group.pages = pageSet.size;
    if (finding.wcagCriteria.length > 0) {
      group.wcagCriteria = [...new Set([...group.wcagCriteria, ...finding.wcagCriteria])].sort(
        compareCriteria,
      );
    }
    map.set(key, group);
  }

  return [...map.values()].sort(
    (a, b) =>
      SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] ||
      b.totalOccurrences - a.totalOccurrences,
  );
}
