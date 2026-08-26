/**
 * A single per-page, per-occurrence candidate finding, before dedupe and
 * merge. One candidate per axe (violation, node) pair, per Lighthouse
 * (audit, page) pair or (audit, item) pair when the audit has node-level
 * detail, or per qualifying render-diff page. normalizeAudit groups these
 * by dedupe key and merges each group into one Finding.
 *
 * Kept in its own module (not normalize.ts) so the three per-source
 * extractors can depend on this shape without importing the orchestrator
 * that depends on them, avoiding a circular import.
 */

import type { FindingCategory, FindingElement, FindingSource, Severity } from '../types/findings.js';

export interface FindingCandidate {
  source: FindingSource;
  ruleId: string;
  category: FindingCategory;
  severity: Severity;
  wcagCriteria: string[];
  title: string;
  description: string;
  helpUrl?: string;
  pageUrl: string;
  /** null for page-scoped candidates (selector is '' for dedupe purposes). */
  element: FindingElement | null;
  /** B4 (2026-08-24): overrides element.selector as this candidate's
   *  identity for the fine dedupe pass, without changing what is displayed.
   *
   *  Needed because a DOM selector is the wrong identity for a defect that
   *  belongs to a file rather than to a place in a page. Lighthouse's image
   *  audits are the case that forced it: "serve this image in a modern
   *  format" is one defect about one file, but its selector is wherever
   *  that file happens to be rendered, which differs per page and, on sites
   *  using a slider that generates its wrapper id at runtime
   *  (swiper-wrapper-3bd6608a838df14e), differs per page load. A real
   *  haaitza.com audit reported the same image 65 times that way.
   *
   *  Set it only where the identity is genuinely something other than the
   *  element, and only to a value that is stable across runs - cross-run
   *  identity for the monitoring tier is dedupeKey (trade-off 3). Leaving
   *  it undefined keeps the original selector-based behaviour, which stays
   *  correct for every element-scoped rule. */
  dedupeIdentity?: string;
  /** This candidate's contribution to the eventual Finding.rawEvidence.
   *  Scoped to a single page; the merge step in normalize.ts shapes these
   *  into rawEvidence.perPage[pageUrl]. */
  rawEvidenceForPage: Record<string, unknown>;
}
