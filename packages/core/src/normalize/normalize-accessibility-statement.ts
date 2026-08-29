/**
 * C4 (2026-08-24): violation judgment for the accessibility-statement
 * check. Site-level, attributed to the homepage, same pattern as
 * normalize-sitemap.ts and normalize-security-headers.ts.
 *
 * Emitted only when no statement was found among the pages actually
 * crawled. A statement that *was* found produces no finding, and
 * deliberately no "pass" either - this audit has not read the document
 * and has no basis for saying it is adequate.
 *
 * Severity is 'moderate', not 'serious'. Per CLAUDE.md rule 6, whether a
 * given business is inside the scope that makes this document mandatory
 * is exactly the question this product refuses to answer; the report's
 * compliance section states the criteria and the company's registry data
 * and leaves the conclusion to counsel. A finding that rated this
 * 'serious' would be asserting the obligation applies, through the
 * severity scale rather than through prose - which is the same mistake,
 * made less visibly.
 */

import type { FindingCandidate } from './candidate.js';
import { severityFromCustom } from './severity.js';

export const ACCESSIBILITY_STATEMENT_MISSING_RULE_ID = 'accessibility-statement-missing';

export interface AccessibilityStatementCheckInput {
  statementUrl: string | null;
  pagesSearched: number;
}

export function normalizeAccessibilityStatement(
  input: AccessibilityStatementCheckInput,
  homepageUrl: string,
): FindingCandidate[] {
  if (input.statementUrl !== null) return [];

  return [
    {
      source: 'custom',
      ruleId: ACCESSIBILITY_STATEMENT_MISSING_RULE_ID,
      category: 'accessibility',
      severity: severityFromCustom(ACCESSIBILITY_STATEMENT_MISSING_RULE_ID),
      // Deliberately no WCAG criterion: publishing a statement is a
      // requirement of the French transposition, not a WCAG success
      // criterion, and tagging it with one would misrepresent where the
      // requirement comes from in the one table a client may hand to a
      // lawyer.
      wcagCriteria: [],
      title: 'No accessibility statement was found',
      description: `None of the ${input.pagesSearched} page(s) analysed is an accessibility statement ("déclaration d'accessibilité"). Publication guidance depends on whether Article 47 applies; outside that regime, publication is presented only as an optional best practice. A statement on a page outside this audit's scope would not be visible here.`,
      pageUrl: homepageUrl,
      element: null,
      rawEvidenceForPage: { pagesSearched: input.pagesSearched },
    },
  ];
}
