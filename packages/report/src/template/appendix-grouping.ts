import { compareCriteria, SEVERITY_ORDER, type Finding, type Severity } from '@odysseus/core';

/** Pure grouping/sorting over Finding[], no schema change - the fix for
 *  B11-B13 and D28. Rows for one rule are adjacent, groups ordered by
 *  severity then total occurrences, per docs/report-v2-refactor.md 3.3.
 *  Reuses @odysseus/core's own SEVERITY_ORDER (critical highest) rather
 *  than a second, locally-scoped severity ordering. */
export interface RuleGroup {
  ruleId: string;
  severity: Severity;
  findings: Finding[];
  totalOccurrences: number;
  maxPages: number;
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
 *  having their own detail withheld. */
export function groupAppendix(findings: readonly Finding[]): RuleGroup[] {
  const map = new Map<string, RuleGroup>();

  for (const finding of findings) {
    const key = `${finding.ruleId}::${finding.severity}`;
    const group = map.get(key) ?? {
      ruleId: finding.ruleId,
      severity: finding.severity,
      findings: [],
      totalOccurrences: 0,
      maxPages: 0,
      wcagCriteria: [],
    };
    group.findings.push(finding);
    group.totalOccurrences += finding.occurrences;
    group.maxPages = Math.max(group.maxPages, finding.pageUrls.length);
    if (finding.wcagCriteria.length > 0) {
      group.wcagCriteria = [...new Set([...group.wcagCriteria, ...finding.wcagCriteria])].sort(compareCriteria);
    }
    map.set(key, group);
  }

  return [...map.values()].sort(
    (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] || b.totalOccurrences - a.totalOccurrences,
  );
}

/** group.findings.length <= 6 keeps a rule-group on one page (`.keep`);
 *  above that, letting it break across pages with the header row
 *  repeating is the better outcome - a `.keep` group with fourteen rows
 *  blanks half a page instead. See docs/report-v2-refactor.md 3.2. */
export const APPENDIX_GROUP_KEEP_THRESHOLD = 6;
