/**
 * Bumped whenever the report template's structure or content changes in a
 * way worth distinguishing in stored report metadata, the same reasoning
 * as FINDINGS_SCHEMA_VERSION: a template change between two monitoring
 * reports must never read as the client's site having changed.
 */
export const REPORT_TEMPLATE_VERSION = 3;

/** A report-level display filter on top of, never a reimplementation of,
 *  the canonical scan-time selectPageDirsToKeep pruning decision (which
 *  always keeps the homepage regardless of its own missingPercent). A
 *  healthy homepage at 0% missing is real evidence of nothing, and cost
 *  28.7MB of the v1 report for exactly that reason. See
 *  docs/archive/report-v2-refactor.md A8/B18. */
export const EVIDENCE_INCLUSION_THRESHOLD_PERCENT = 5;

/** docs/report/report-design-system.md section 3: section 08 shows the 3 worst
 *  pages by missingPercent, bars only, no screenshots. */
export const EVIDENCE_MAX_RENDER_DIFF_PAGES = 3;

/** Chromium args for the report's own print-to-PDF launch only (trade-off
 *  19): the glyph-splitting fix, never applied to the scanner's browser.
 *  Defined here rather than in index.ts so the outreach preview's PDF
 *  sibling can share the exact same print launch without a circular
 *  import. */
export const REPORT_PDF_CHROMIUM_ARGS = ['--font-render-hinting=none'];
