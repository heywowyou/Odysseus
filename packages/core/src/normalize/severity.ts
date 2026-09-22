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
export function severityFromLighthouse(score: number | null, weight: number): Severity {
  // Informative or not applicable audits carry no severity.
  if (score === null) return 'minor';
  if (weight === 0) return 'minor';

  const failure: Severity = score < 0.5 ? 'critical' : score < 0.9 ? 'serious' : 'minor';

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
  'hreflang-target-invalid': 'serious',

  // Document structure. Overlaps accessibility, deduped downstream.
  'heading-hierarchy-skip': 'moderate',
  'multiple-h1': 'minor',
  'no-h1': 'moderate',

  // Social
  'opengraph-missing': 'minor',

  // Links (trade-off 110). Moved from Lighthouse's link-text and
  // crawlable-anchors audits, which carry weight 1 in its SEO category and so
  // were capped at moderate by severityFromLighthouse. Kept at moderate so
  // the move changes where the defect is found, not how loud it is.
  'link-text': 'moderate',
  'crawlable-anchors': 'moderate',

  // Assets
  'image-oversized': 'moderate',
  'image-legacy-format': 'minor',

  // Legal transparency
  'lcen-mentions-legales-missing': 'serious',

  // Extended accessibility pass (docs/rules/manual-accessibility-checklist.md).
  // keyboard-trap: WCAG 2.1.2, page becomes unusable via keyboard alone.
  // focus-order-mismatch: real usability confusion, page stays operable.
  // form-error-not-associated: WCAG 3.3.1/4.1.2, error genuinely
  // imperceptible to assistive tech, not merely suboptimal.
  // video-missing-captions: WCAG 1.2.2, zero access for deaf/hard-of-
  // hearing users to that content.
  // placeholder-only-label: WCAG 3.3.2, the field still has an accessible
  // name (axe accepts the placeholder) but its visible label vanishes on
  // input; a real barrier, not a total one.
  // alt-text-quality-heuristic: explicitly the lowest-confidence check in
  // this table by design (a heuristic red-flag, not a definitive
  // detection - see docs/rules/manual-accessibility-checklist.md).
  'keyboard-trap': 'critical',
  'focus-order-mismatch': 'moderate',
  'form-error-not-associated': 'serious',
  'video-missing-captions': 'serious',
  'placeholder-only-label': 'moderate',
  'alt-text-quality-heuristic': 'minor',

  // Milestone 8.5a: SEO checks beyond what milestone 8 and Lighthouse's
  // own seo/performance categories already cover.
  // canonical-target-unreachable: the declared definitive URL is broken,
  // a direct crawlability defect.
  // canonical-target-noindex: a real but recoverable contradictory
  // signal (the target is excluded from indexing).
  // sitemap-orphan-page: hygiene - the page still exists and works, it
  // just depends entirely on the sitemap for discovery.
  // robots-disallow-broad: a real, recoverable indexing-scope issue;
  // capped below robots-blocks-indexing/noindex-on-public-page since it
  // may be deliberate (excluding a cart or admin section).
  'canonical-target-unreachable': 'serious',
  'canonical-target-noindex': 'moderate',
  'sitemap-orphan-page': 'minor',
  'sitemap-lists-redirects': 'minor',
  'robots-disallow-broad': 'moderate',
  'relative-link-nesting': 'moderate',

  // Milestone 8.5a: GEO (generative-engine-optimization) checks - do
  // real, extractable content exist for an AI answer engine to cite.
  // llms-txt-missing: an emerging, optional convention, not yet a
  // settled standard - opportunity, not a defect.
  // structured-data-entity-missing: no machine-readable statement of who
  // the business is anywhere on the site, a real gap for entity-based
  // extraction.
  // entity-data-incomplete: an entity block exists but is missing basic
  // identifying fields - a lesser version of the above.
  // faq-content-without-schema: a structural pattern match only
  // (questions-shaped headings with no matching schema), not a semantic
  // judgment about content quality - kept at the lowest tier.
  'llms-txt-missing': 'minor',
  'structured-data-entity-missing': 'moderate',
  'entity-data-incomplete': 'minor',
  'faq-content-without-schema': 'minor',

  // Milestone 8.6: response-header hardening. Capped at 'moderate' even
  // for CSP (arguably the most consequential of the five) since none of
  // these are the site being actively exploited today - they are missing
  // defenses, not confirmed breaches, and 'serious'/'critical' are
  // reserved elsewhere for direct reachability/indexability loss.
  'security-header-missing-csp': 'moderate',
  'security-header-missing-hsts': 'moderate',
  'security-header-missing-x-frame-options': 'moderate',
  'security-header-missing-referrer-policy': 'minor',
  'security-header-missing-permissions-policy': 'minor',

  // C1 (2026-08-24): cookie/consent. Rated above the security headers
  // above, deliberately. A missing response header is a defense that is
  // not in place; a tracking cookie written before consent is a thing
  // the site is doing right now, on every visit, and it is the one
  // obligation in this product whose scope is not disputed (CNIL
  // enforcement does not turn on company size the way the EAA reading
  // does). Not 'critical': that tier is reserved for a visitor being
  // blocked or a page being unindexable, and this blocks nobody.
  'cookie-non-essential-before-consent': 'serious',
  'tracker-request-before-consent': 'serious',
  // Moderate, not serious: absence of a *recognised* consent platform is
  // weaker evidence than the presence of a named tracking cookie, since
  // a hand-rolled banner would look identical to none at all. The two
  // rules above already carry the concrete, certain fact.
  'consent-mechanism-absent': 'moderate',
  // Moderate: a real defect with a documented one-line fix
  // (youtube-nocookie.com), but narrower than site-wide tracking.
  'youtube-tracking-embed': 'moderate',

  // C4 (2026-08-24). Moderate, not serious, on purpose: whether this
  // document is mandatory for a given business is precisely the question
  // rule 6 forbids this product from answering. Rating it 'serious'
  // would assert the obligation applies through the severity scale
  // instead of through prose - the same mistake, made less visibly.
  'accessibility-statement-missing': 'moderate',

  // C6 (2026-08-24). Moderate: a contradiction between the machine- and
  // human-readable contact details genuinely suppresses an AI answer,
  // but nothing is unreachable or unindexable as a result.
  'nap-phone-mismatch': 'moderate',
  'nap-postal-code-mismatch': 'moderate',

  // C3 (2026-08-24). Serious, not critical: a reader can still reach the
  // content by scrolling in two directions, which is exactly the burden
  // WCAG 1.4.10 exists to remove, but it is not the content being
  // unreachable - the same line drawn between a missing defense and a
  // confirmed loss of access elsewhere in this table.
  'reflow-horizontal-scroll': 'serious',

  // C5 (2026-08-24). Minor on purpose: this is an inventory a DPO needs,
  // not a defect. Nothing is broken, and a scanner has no basis for
  // deciding which of these transfers is lawful.
  'third-party-data-transfer': 'minor',

  // C7 (2026-08-24). Minor: modern parsers recover from most malformed
  // markup, which is exactly why WCAG 2.2 removed criterion 4.1.1
  // (Parsing). Worth telling a developer; not worth a client's attention
  // ahead of a contrast failure.
  'html-structural-validity': 'minor',

  // Milestone 8.6: robots.txt blocking a named AI crawler. Capped below
  // robots-disallow-broad's own 'moderate': unlike a broad Disallow that
  // accidentally excludes a real content section, blocking a named
  // AI-training or AI-answer bot by its own explicit user-agent token is
  // very often a deliberate site-owner choice, so this is reported as an
  // opportunity-cost fact, not treated as a probable mistake.
  'ai-crawler-blocked': 'minor',

  // Milestone 8.6: structured-data-testing-tool's Google preset failed a
  // non-optional field for a schema type this page itself declares (the
  // preset's own conditional only runs against schemas actually found),
  // so this is a real gap in what Google's rich-results pipeline can read
  // back out, not a speculative one.
  'structured-data-invalid': 'moderate',

  // Milestone 8.6: CrUX field data crossing Google's own "poor" Core Web
  // Vitals threshold. Real visitors, not a lab simulation - matches
  // Lighthouse's own severityFromLighthouse posture (a genuine, measured
  // failure) but capped at 'serious' rather than reaching 'critical',
  // since this is one signal among several performance already provides,
  // not a structural reachability failure.
  'crux-lcp-poor': 'serious',
  'crux-cls-poor': 'serious',
  'crux-inp-poor': 'serious',
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
