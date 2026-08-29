/**
 * Bumped whenever the report template's structure or content changes in a
 * way worth distinguishing in stored report metadata, the same reasoning
 * as FINDINGS_SCHEMA_VERSION: a template change between two monitoring
 * reports must never read as the client's site having changed.
 */
export const REPORT_TEMPLATE_VERSION = 2;

/** A report-level display filter on top of, never a reimplementation of,
 *  the canonical scan-time selectPageDirsToKeep pruning decision (which
 *  always keeps the homepage regardless of its own missingPercent). A
 *  healthy homepage at 0% missing is real evidence of nothing, and cost
 *  28.7MB of the v1 report for exactly that reason. See
 *  docs/report-v2-refactor.md A8/B18. */
export const EVIDENCE_INCLUSION_THRESHOLD_PERCENT = 5;

/** docs/report-design-system.md section 3: section 08 shows the 3 worst
 *  pages by missingPercent, bars only, no screenshots. */
export const EVIDENCE_MAX_RENDER_DIFF_PAGES = 3;
