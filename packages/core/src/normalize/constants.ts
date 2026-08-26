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
 * they duplicate another audit that already covers the same page, with a
 * different severity mapping. Category-level exclusion
 * (LIGHTHOUSE_EXCLUDED_CATEGORIES above) does not catch these because the
 * duplicate lives inside a category that IS scanned (e.g. 'seo' or
 * 'performance').
 *
 * image-alt: Lighthouse's seo-category `image-alt` audit and axe's
 * `image-alt` rule both flag <img> without alternative text on the same
 * element. Confirmed duplicate against real scanner output.
 *
 * font-display-insight, render-blocking-insight, cache-insight: Lighthouse
 * ships a legacy audit (font-display, render-blocking-resources,
 * uses-long-cache-ttl) alongside a newer "insight" audit covering the
 * exact same underlying issue (report-feedback-palais-gallien-v2.md item
 * 1.1). Confirmed against a real Palais Gallien page: all three legacy/
 * insight pairs fired simultaneously with overlapping descriptions,
 * producing near-identical findings two pages apart in the annex. The
 * legacy audit id is kept (simpler description, already the one this
 * report's copy is written around); its insight twin is excluded.
 *
 * largest-contentful-paint-element: identifies which DOM element is the
 * LCP element - genuinely different information from
 * `largest-contentful-paint` (the timing metric itself), not a pure
 * duplicate. Excluded anyway because `largest-contentful-paint` must stay
 * in finding emission (it is also what capSeverityByCoreWebVitalRating and
 * the Core Web Vitals table key off), and the two audits produced two
 * separate findings on every page for one underlying performance problem
 * in the real report. The element-level detail (which node is the LCP
 * element) is a smaller loss than the timing/severity data would be.
 *
 * image-delivery-insight is deliberately NOT here despite also pairing
 * with uses-optimized-images: on a real page uses-optimized-images scored
 * 1 (would never emit a finding at all, since it never crosses the
 * emission-score threshold) while image-delivery-insight scored 0.5 and
 * fired on far more pages (18 vs 1 in the source feedback) - not a clean
 * duplicate to drop one side of, closer to the broader "seven separate
 * image-weight rules read as one problem" grouping question (item 1.3),
 * which belongs to theme/annex clustering, not exclusion.
 *
 * max-potential-fid, interactive: deprecated metrics, not duplicates of
 * another audit - excluded for a different reason than every entry above.
 * FID (First Input Delay, what max-potential-fid estimates) was replaced
 * by INP (Interaction to Next Paint) as a Core Web Vital in March 2024;
 * `interactive` (Time to Interactive) was removed from Lighthouse's own
 * report UI. Both still fire in this LHR version with real scores
 * (report-feedback-palais-gallien-v2.md item 1.2), dating the tool to a
 * 2026 reader. INP itself is not addable in its place: Lighthouse in
 * navigation mode (this scanner's mode) never emits an INP audit at all,
 * since INP requires an actual user interaction during the trace -
 * documented already at normalize-lighthouse.ts's extractCoreWebVitals.
 *
 * document-title: axe-core ships its own rule with the exact same id,
 * "document-title" (WCAG 2.4.2, Page Titled), and Lighthouse's SEO-
 * category audit of the same name fires on the identical defect (a page
 * with no <title> element). This is the trade-off 1 duplicate-finding
 * mistake ("Lighthouse's accessibility category emits no findings because
 * axe already scans WCAG 2.2 AA directly") recurring through a different
 * door: `packages/core/src/normalize/normalize-head-metadata.ts`'s own
 * milestone-8 comment already reasoned that its custom SEO check must not
 * duplicate Lighthouse's document-title audit, but never checked whether
 * axe's accessibility scan also reports a rule of that name - it does.
 * Confirmed against a real 2026-08-25 Lagnonu review report scan: f030
 * (axe, accessibility, serious, WCAG 2.4.2) and f035 (lighthouse, seo,
 * moderate) both fired for the same 14 pages, describing the same missing
 * <title> element under two different categories and severities. axe's
 * finding is kept (matches this file's own reasoning for keeping the
 * legacy-over-insight audit above: it is the WCAG-referenced, more
 * severity-accurate side of the pair).
 *
 * Only add an ID here once overlap with a specific other rule, or
 * deprecation, is confirmed against real scanner output, not on
 * suspicion.
 */
export const LIGHTHOUSE_EXCLUDED_AUDITS = [
  'image-alt',
  'font-display-insight',
  'render-blocking-insight',
  'cache-insight',
  'largest-contentful-paint-element',
  'max-potential-fid',
  'interactive',
  'document-title',
] as const;
