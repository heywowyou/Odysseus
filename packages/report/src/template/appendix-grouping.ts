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

/** Second reduction, minor findings only: 60 rows collapse to a handful
 *  aggregated by ruleId, sorted by occurrences descending, moving them
 *  below the findings that matter rather than dominating the appendix by
 *  row count. See docs/report-v2-refactor.md 3.3 / B11. */
export interface MinorFindingSummary {
  ruleId: string;
  findingCount: number;
  maxPages: number;
  totalOccurrences: number;
}

export function aggregateMinorFindings(minorFindings: readonly Finding[]): MinorFindingSummary[] {
  const map = new Map<string, MinorFindingSummary>();

  for (const finding of minorFindings) {
    const summary = map.get(finding.ruleId) ?? {
      ruleId: finding.ruleId,
      findingCount: 0,
      maxPages: 0,
      totalOccurrences: 0,
    };
    summary.findingCount += 1;
    summary.maxPages = Math.max(summary.maxPages, finding.pageUrls.length);
    summary.totalOccurrences += finding.occurrences;
    map.set(finding.ruleId, summary);
  }

  return [...map.values()].sort((a, b) => b.totalOccurrences - a.totalOccurrences);
}

/** group.findings.length <= 6 keeps a rule-group on one page (`.keep`);
 *  above that, letting it break across pages with the header row
 *  repeating is the better outcome - a `.keep` group with fourteen rows
 *  blanks half a page instead. See docs/report-v2-refactor.md 3.2. */
export const APPENDIX_GROUP_KEEP_THRESHOLD = 6;
