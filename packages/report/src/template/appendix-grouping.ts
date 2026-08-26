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
  /** item 1.6 (La Corniche pass): union of page URLs across every finding
   *  in the group, not the largest single finding's own page count. Used
   *  to read `Math.max(...finding.pageUrls.length)`, rendered as "jusqu'à
   *  N pages" ("up to") - defensible in isolation, but a priority card
   *  for the same rule states "N pages sur M", itself a union across the
   *  theme's findings, so a real report showed two different page counts
   *  for the same rule (18 vs. "jusqu'à 17"). Both now read from the same
   *  union-of-pageUrls computation, so they can no longer disagree. */
  pages: number;
  /** Union across the group, numerically sorted. */
  wcagCriteria: string[];
  /** item 1.3: the actual rule ids folded into this group when it's a
   *  rule-family cluster (RULE_FAMILIES below) - always includes at least
   *  `ruleId` itself, sorted, deduplicated. A group with exactly one
   *  member here is the ordinary, non-clustered case; the renderer uses
   *  this length to decide whether to show a family title with a list of
   *  machine codes underneath, or the single rule-code badge it already
   *  showed before clustering existed. */
  memberRuleIds: string[];
}

/** item 1.3: seven separate Lighthouse rules ("your images are heavy",
 *  report-feedback-palais-gallien-v2.md's own framing) that read as seven
 *  distinct problems to a client when they are one remediation job -
 *  confirmed as the correct scope by that feedback pass specifically
 *  (image-delivery-insight/uses-optimized-images was deliberately left
 *  OUT of the Lighthouse dedupe list in constants.ts for the opposite
 *  reason: it is not a clean audit-pair duplicate, it genuinely measures
 *  something different, so both survive as findings and get clustered
 *  for *presentation* here instead of one being suppressed at the data
 *  layer). A small, explicit map, not an inferred pattern match - only
 *  add a rule id here once it is confirmed to belong to the same
 *  remediation job as the rest of its family, the same "confirmed against
 *  real scanner output, not assumed" bar constants.ts's own dedupe list
 *  documents. */
const RULE_FAMILIES: Readonly<Record<string, string>> = {
  'unsized-images': 'image-weight',
  'modern-image-formats': 'image-weight',
  'offscreen-images': 'image-weight',
  'uses-responsive-images': 'image-weight',
  'uses-optimized-images': 'image-weight',
  'image-delivery-insight': 'image-weight',
  'prioritize-lcp-image': 'image-weight',
};

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
  const pageSets = new Map<string, Set<string>>();

  for (const finding of findings) {
    // item 1.3: a family member groups under its family key, still
    // separately per severity - a family with both a moderate and a
    // minor member produces two group rows, not a merged severity, since
    // deciding how to pick one representative severity across mixed
    // members is a different, bigger question than clustering the
    // annex's presentation.
    const familyKey = RULE_FAMILIES[finding.ruleId] ?? finding.ruleId;
    const key = `${familyKey}::${finding.severity}`;
    const group = map.get(key) ?? {
      ruleId: familyKey,
      severity: finding.severity,
      findings: [],
      totalOccurrences: 0,
      pages: 0,
      wcagCriteria: [],
      memberRuleIds: [],
    };
    group.findings.push(finding);
    group.totalOccurrences += finding.occurrences;
    const pageSet = pageSets.get(key) ?? new Set<string>();
    for (const url of finding.pageUrls) pageSet.add(url);
    pageSets.set(key, pageSet);
    group.pages = pageSet.size;
    if (finding.wcagCriteria.length > 0) {
      group.wcagCriteria = [...new Set([...group.wcagCriteria, ...finding.wcagCriteria])].sort(
        compareCriteria,
      );
    }
    if (!group.memberRuleIds.includes(finding.ruleId)) {
      group.memberRuleIds = [...group.memberRuleIds, finding.ruleId].sort();
    }
    map.set(key, group);
  }

  return [...map.values()].sort(
    (a, b) =>
      SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] ||
      b.totalOccurrences - a.totalOccurrences,
  );
}
