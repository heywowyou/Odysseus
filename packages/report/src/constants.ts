/**
 * Bumped whenever the report template's structure or content changes in a
 * way worth distinguishing in stored report metadata, the same reasoning
 * as FINDINGS_SCHEMA_VERSION: a template change between two monitoring
 * reports must never read as the client's site having changed.
 */
export const REPORT_TEMPLATE_VERSION = 1;

/** A report-level display filter on top of, never a reimplementation of,
 *  the canonical scan-time selectPageDirsToKeep pruning decision (which
 *  always keeps the homepage regardless of its own missingPercent). A
 *  healthy homepage at 0% missing is real evidence of nothing, and cost
 *  28.7MB of the v1 report for exactly that reason. See
 *  docs/report-v2-refactor.md A8/B18. */
export const EVIDENCE_INCLUSION_THRESHOLD_PERCENT = 5;

/** Evidence screenshots are downscaled to this width before embedding
 *  (A8): 30.7MB to 670KB on the real haaitza scan, with more information
 *  on the page, not less, since fewer bytes buys downscaling the height
 *  of a homepage-length screenshot rather than cropping it away. */
export const EVIDENCE_MAX_WIDTH_PX = 800;
export const EVIDENCE_JPEG_QUALITY = 0.8;
/** A 13,000px full-page strip is not evidence, it is ballast - capped
 *  independently of the width downscale, which alone would still leave a
 *  multi-thousand-pixel-tall image proportionally. */
export const EVIDENCE_MAX_HEIGHT_PX = 2400;
