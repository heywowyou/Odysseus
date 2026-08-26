/**
 * C7 (2026-08-24): violation judgment for the HTML validity check.
 *
 * One finding per page per rule, carrying the occurrence count, rather
 * than one finding per issue. A page with forty duplicate ids has one
 * template defect repeated forty times, and emitting forty findings would
 * re-create exactly the explosion B2 was needed to undo three days after
 * fixing it.
 *
 * Category is 'seo': these are defects in how correctly a machine can
 * parse the document, and every machine that reads the page - crawler,
 * assistive technology, AI engine - is affected the same way. Not
 * 'accessibility', despite duplicate ids breaking aria references,
 * because the accessibility category in this report carries WCAG
 * criteria and these findings deliberately carry none (WCAG 2.2 removed
 * 4.1.1 Parsing, the criterion that used to cover this - see the check's
 * own file header). A finding sitting in the accessibility section with
 * an empty criterion column would read as an omission rather than as the
 * deliberate absence it is.
 *
 * 'minor': modern parsers recover from most of this, which is why WCAG
 * removed the criterion. It is worth telling a developer and is not worth
 * a client's attention over a contrast failure.
 */

import type { FindingCandidate } from './candidate.js';
import { severityFromCustom } from './severity.js';

export const HTML_VALIDITY_RULE_ID = 'html-structural-validity';

export interface HtmlValidityCheckInput {
  checked: boolean;
  issueCount: number;
  issues: { ruleId: string; message: string; line: number; column: number }[];
}

export function normalizeHtmlValidity(
  input: HtmlValidityCheckInput,
  pageUrl: string,
): FindingCandidate[] {
  if (!input.checked || input.issues.length === 0) return [];

  // Grouped by the underlying rule, so "duplicate id" and "stray end
  // tag" stay separable in the annex without becoming one finding each.
  const byRule = new Map<string, { ruleId: string; message: string; line: number; column: number }[]>();
  for (const issue of input.issues) {
    const bucket = byRule.get(issue.ruleId);
    if (bucket) bucket.push(issue);
    else byRule.set(issue.ruleId, [issue]);
  }

  return [...byRule.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ruleId, issues]) => ({
      source: 'custom' as const,
      ruleId: HTML_VALIDITY_RULE_ID,
      category: 'seo' as const,
      severity: severityFromCustom(HTML_VALIDITY_RULE_ID),
      wcagCriteria: [],
      title: 'The page markup is not well-formed',
      description: `${issues.length} instance(s) of "${ruleId}" on this page. ${issues[0]!.message} (line ${issues[0]!.line}). Malformed markup makes a browser, a search engine and a screen reader each build a slightly different document from the same page.`,
      pageUrl,
      // The rule name is the stable identity here; a line number is not a
      // selector and would defeat cross-run dedupe the moment the page's
      // content shifts by one line.
      element: { pageUrl, selector: `[html-validate:${ruleId}]`, snippet: issues[0]!.message },
      rawEvidenceForPage: { ruleId, issueCount: issues.length, issues },
    }));
}
