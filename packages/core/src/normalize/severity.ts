/**
 * Severity mapping. LOCKED CONTRACT.
 *
 * Three scanners report severity in three incompatible ways. This file is
 * the only place that reconciles them. Every mapping decision here is
 * defensible in front of a client's developer, which is why the native
 * value is always preserved in the finding's rawEvidence.
 *
 * The unified scale intentionally matches axe-core's, because axe covers
 * the audit type with legal exposure and its scale is the one an external
 * party is most likely to recognise.
 */

import type { Severity } from '../types/findings.js';

/* -------------------------------------------------------------------------
 * axe-core
 * ---------------------------------------------------------------------- */

/**
 * Direct passthrough. axe's impact values are the unified scale.
 * axe may report impact as null on some rules; treat that as 'moderate'
 * rather than dropping the finding.
 */
export function severityFromAxe(impact: string | null | undefined): Severity {
  switch (impact) {
    case 'critical':
      return 'critical';
    case 'serious':
      return 'serious';
    case 'moderate':
      return 'moderate';
    case 'minor':
      return 'minor';
    default:
      return 'moderate';
  }
}

/* -------------------------------------------------------------------------
 * Lighthouse
 * ---------------------------------------------------------------------- */

/**
 * Lighthouse reports a 0 to 1 score per audit plus a category weight.
 * Score alone is not enough: a failing audit that carries no weight in
 * its category is noise, and reporting it as critical destroys the
 * credibility of the prioritization.
 *
 * Rule: severity is driven by how badly the audit failed, then capped by
 * how much Lighthouse itself weights that audit.
 *
 * A weight of 0 means Lighthouse treats the audit as diagnostic only.
 * Those are recorded as 'minor' and never surface as headline findings.
 */
export function severityFromLighthouse(
  score: number | null,
  weight: number,
): Severity {
  // Informative or not applicable audits carry no severity.
  if (score === null) return 'minor';
  if (weight === 0) return 'minor';

  const failure: Severity =
    score < 0.5 ? 'critical' : score < 0.9 ? 'serious' : 'minor';

  // Cap by weight. Low-weight audits cannot be headline findings.
  if (weight < 3) return capAt(failure, 'moderate');
  if (weight < 10) return capAt(failure, 'serious');
  return failure;
}

/* -------------------------------------------------------------------------
 * Custom checks
 * ---------------------------------------------------------------------- */

/**
 * Custom checks have no native severity, so severity is assigned per rule
 * here, once, deliberately. Adding a custom check means adding a line to
 * this table. A check with no entry defaults to 'moderate' and logs a
 * warning, so nothing silently becomes invisible.
 *
 * Reasoning behind the tiers:
 *  - critical: the page or site is structurally unreachable or
 *    unindexable. Direct, immediate commercial loss.
 *  - serious: significant loss of search or social presentation.
 *  - moderate: real but recoverable quality issues.
 *  - minor: hygiene.
 */
export const CUSTOM_CHECK_SEVERITY: Record<string, Severity> = {
  // Indexability and reachability
  'robots-blocks-indexing': 'critical',
  'noindex-on-public-page': 'critical',
  'broken-internal-link': 'serious',
  'redirect-chain-excessive': 'moderate',
  'mixed-content': 'serious',
  'http-error-status': 'critical',

  // Search presentation
  'meta-title-missing': 'serious',
  'meta-title-length': 'minor',
  'meta-description-missing': 'serious',
  'meta-description-length': 'minor',
  'canonical-missing': 'moderate',
  'canonical-conflicting': 'serious',
  'sitemap-missing': 'moderate',
  'sitemap-stale': 'minor',

  // Structured data
  'jsonld-missing': 'moderate',
  'jsonld-invalid': 'serious',

  // Bilingual sites, relevant for wine, tourism, and hospitality
  'hreflang-missing': 'moderate',
  'hreflang-invalid': 'serious',
  'hreflang-no-return-link': 'serious',

  // Document structure. Overlaps accessibility, deduped downstream.
  'heading-hierarchy-skip': 'moderate',
  'multiple-h1': 'minor',
  'no-h1': 'moderate',

  // Social
  'opengraph-missing': 'minor',

  // Assets
  'image-oversized': 'moderate',
  'image-legacy-format': 'minor',

  // Legal transparency
  'lcen-mentions-legales-missing': 'serious',

  // Extended accessibility pass (milestone-8-scope-addendum.md section 1.3).
  // keyboard-trap: WCAG 2.1.2, page becomes unusable via keyboard alone.
  // focus-order-mismatch: real usability confusion, page stays operable.
  // form-error-not-associated: WCAG 3.3.1/4.1.2, error genuinely
  // imperceptible to assistive tech, not merely suboptimal.
  // video-missing-captions: WCAG 1.2.2, zero access for deaf/hard-of-
  // hearing users to that content.
  // alt-text-quality-heuristic: explicitly the lowest-confidence check in
  // this table by design (a heuristic red-flag, not a definitive
  // detection - see docs/milestone-8-scope-addendum.md section 1.4).
  'keyboard-trap': 'critical',
  'focus-order-mismatch': 'moderate',
  'form-error-not-associated': 'serious',
  'video-missing-captions': 'serious',
  'alt-text-quality-heuristic': 'minor',
};

export function severityFromCustom(ruleId: string): Severity {
  const mapped = CUSTOM_CHECK_SEVERITY[ruleId];
  if (!mapped) {
    // Deliberately loud. An unmapped check is a bug, not a default.
    console.warn(
      `[severity] custom check "${ruleId}" has no severity mapping, defaulting to moderate`,
    );
    return 'moderate';
  }
  return mapped;
}

/* -------------------------------------------------------------------------
 * Render diff
 * ---------------------------------------------------------------------- */

/**
 * Severity is driven by how much of the page a non-JavaScript crawler
 * cannot see. These thresholds are a starting position, not a measured
 * result. Revisit once there is real distribution data across scanned
 * sites.
 */
export function severityFromRenderDiff(missingPercent: number): Severity {
  if (missingPercent >= 80) return 'critical';
  if (missingPercent >= 50) return 'serious';
  if (missingPercent >= 20) return 'moderate';
  return 'minor';
}

/* -------------------------------------------------------------------------
 * Ordering helpers
 * ---------------------------------------------------------------------- */

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 4,
  serious: 3,
  moderate: 2,
  minor: 1,
};

export function capAt(value: Severity, ceiling: Severity): Severity {
  return SEVERITY_ORDER[value] > SEVERITY_ORDER[ceiling] ? ceiling : value;
}

/** Highest severity wins when the same issue is reported by two scanners. */
export function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_ORDER[a] >= SEVERITY_ORDER[b] ? a : b;
}
