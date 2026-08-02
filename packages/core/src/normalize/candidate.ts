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
  /** This candidate's contribution to the eventual Finding.rawEvidence.
   *  Scoped to a single page; the merge step in normalize.ts shapes these
   *  into rawEvidence.perPage[pageUrl]. */
  rawEvidenceForPage: Record<string, unknown>;
}
