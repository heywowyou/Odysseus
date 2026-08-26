/**
 * C4 (2026-08-24): does the site publish an accessibility statement?
 *
 * For a site inside the scope of the French accessibility obligation, a
 * published "déclaration d'accessibilité" is itself a requirement,
 * separate from the technical conformance the rest of this audit
 * measures. The report already *generates* a draft statement (section
 * 09, accessibility-statement.ts) but never looked at whether the client
 * already publishes one - so a report could hand a client a draft they
 * did not need, or stay silent about a document they were missing.
 *
 * URL-pattern heuristic over the crawled set only, no navigation - the
 * same shape and the same deliberate limitation as
 * findMentionsLegalesUrl in checks/mentions-legales.ts, which this is
 * modelled on. Two consequences worth being explicit about:
 *
 *   - A statement published on a page the crawl never reached (below the
 *     depth cap, linked only from a footer the crawl did not follow) is
 *     invisible here. That is why the finding's wording says the audit
 *     did not find one among the pages analysed, not that none exists.
 *
 *   - Presence is not conformance. A published statement can be empty,
 *     out of date, or claim full conformance on a site this audit just
 *     measured as non-conformant. Judging its contents is a document
 *     review, not a scan, and is out of scope for the same reason
 *     structured-data.ts stops at validity.
 */

/** Path fragments French and English sites actually use. Narrow on
 *  purpose: "accessible" alone would match /chambres-accessibles/ on
 *  exactly the kind of hotel site this product audits, which is a room
 *  description, not a legal statement. */
const ACCESSIBILITY_STATEMENT_PATH_PATTERN =
  /declaration-d?-?accessibilite|declaration-accessibilite|accessibilite-declaration|accessibility-statement|accessibility-policy|politique-d?-?accessibilite/i;

/** A path segment that is exactly "accessibilite" or "accessibility",
 *  which several real sites use as the whole path. Kept separate from the
 *  pattern above so the bare-segment case can require an exact segment
 *  match rather than a substring one, for the /chambres-accessibles/
 *  reason above. */
const BARE_ACCESSIBILITY_SEGMENT = /(^|\/)(accessibilite|accessibility)\/?$/i;

export interface AccessibilityStatementCheckResult {
  /** The URL of the statement page, when one was found among the pages
   *  actually crawled. */
  statementUrl: string | null;
  /** How many pages were searched, so the finding can say what "not
   *  found" was scoped to rather than implying the whole site. */
  pagesSearched: number;
}

export function findAccessibilityStatementUrl(pageUrls: readonly string[]): string | null {
  const byPattern = pageUrls.find((url) => {
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      return false;
    }
    return ACCESSIBILITY_STATEMENT_PATH_PATTERN.test(pathname) || BARE_ACCESSIBILITY_SEGMENT.test(pathname);
  });
  return byPattern ?? null;
}

export function checkAccessibilityStatement(
  pageUrls: readonly string[],
): AccessibilityStatementCheckResult {
  return {
    statementUrl: findAccessibilityStatementUrl(pageUrls),
    pagesSearched: pageUrls.length,
  };
}
