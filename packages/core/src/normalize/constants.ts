/**
 * Named thresholds for normalization. Kept separate from severity.ts
 * (locked) since these are emission/capping decisions, not the severity
 * mapping itself.
 */

/** Emit a Lighthouse finding only when the audit scores below this.
 *  Also participates in severityFromLighthouse's own internal boundary
 *  between 'serious' and 'minor' among audits that already pass this
 *  gate; see normalize-lighthouse.ts for why that branch is legitimately
 *  unreachable for weighted audits once this gate is applied. */
export const LIGHTHOUSE_EMISSION_SCORE_THRESHOLD = 0.9;

/** Cap on how many details.items entries are stored in rawEvidence for a
 *  page-scoped Lighthouse finding, to keep documents bounded. */
export const MAX_LIGHTHOUSE_DETAILS_ITEMS = 20;

/** Matches severityFromRenderDiff's 'moderate' floor in severity.ts.
 *  severity.ts is locked and doesn't export this number, so it is
 *  deliberately duplicated here. packages/scanner's screenshot pruning
 *  selection must use this same constant (see prune-screenshots.ts). */
export const RENDER_DIFF_EMISSION_THRESHOLD_PERCENT = 20;

/**
 * Lighthouse categories excluded from finding emission this milestone.
 *
 * accessibility: it is axe-core underneath, and axe already scans WCAG
 * 2.2 AA directly against the same page, so emitting both produces
 * systematic duplicates with two different severity mappings for the same
 * rule.
 *
 * best-practices: bundles unrelated concerns (HTTPS usage, deprecated
 * APIs, console errors, image aspect ratio, permission-prompt hygiene)
 * that have no single correct home among the four locked FindingCategory
 * values. Forcing one onto a client-facing report section mislabels it.
 * Revisit in Milestone 8 with a deliberate per-audit-id mapping table,
 * alongside the custom checks. Do not re-add either category to finding
 * emission without that table; see CLAUDE.md.
 *
 * Both categories' scores are still recorded per page in the audit
 * manifest, via extractLighthouseExcludedCategoryScores in
 * normalize-lighthouse.ts, so the numbers are not lost.
 */
export const LIGHTHOUSE_EXCLUDED_CATEGORIES = ['accessibility', 'best-practices'] as const;

/**
 * Individual Lighthouse audit IDs excluded from finding emission because
 * they duplicate an axe-core rule that already covers the same page,
 * with a different severity mapping. Category-level exclusion
 * (LIGHTHOUSE_EXCLUDED_CATEGORIES above) does not catch these because the
 * duplicate lives inside a category that IS scanned (e.g. 'seo').
 *
 * image-alt: Lighthouse's seo-category `image-alt` audit and axe's
 * `image-alt` rule both flag <img> without alternative text on the same
 * element. Confirmed duplicate. Only add an ID here once overlap with a
 * specific axe rule is confirmed, not on suspicion.
 */
export const LIGHTHOUSE_EXCLUDED_AUDITS = ['image-alt'] as const;
