/**
 * Which acquisition check a normalized finding's evidence came from, and
 * whether that finding is a confirmed defect or a signal (plan 059 sections
 * 5.12, 5.13 and 14).
 *
 * `Finding.source` says which tool family emitted a rule but not which check
 * ran it: every custom rule shares `source: 'custom'`, from head-metadata to
 * CrUX. The evidence graph needs the check, because a finding is only
 * admissible when an accepted attempt of the check that observed it exists
 * for the page (or site) it names. This table is that join, keyed by the
 * scanner's own rule ids and checked against the complete custom rule set by
 * its test, so a new rule without a declared source check fails the build
 * rather than silently becoming unprovable.
 */
import { HEURISTIC_RULE_IDS, type Finding } from '@odysseus/core';

/** Site-level checks that do not appear in the per-page check registry: the
 *  crawl's own inventory and the robots policy fetch. */
export const CRAWL_INVENTORY_CHECK_ID = 'crawl-inventory';
export const ROBOTS_POLICY_CHECK_ID = 'robots-policy';

const CUSTOM_RULE_CHECKS: Readonly<Record<string, string>> = {
  'robots-blocks-indexing': ROBOTS_POLICY_CHECK_ID,
  'robots-disallow-broad': ROBOTS_POLICY_CHECK_ID,
  'ai-crawler-blocked': ROBOTS_POLICY_CHECK_ID,
  'broken-internal-link': CRAWL_INVENTORY_CHECK_ID,
  'redirect-chain-excessive': CRAWL_INVENTORY_CHECK_ID,
  'http-error-status': CRAWL_INVENTORY_CHECK_ID,
  'noindex-on-public-page': 'head-metadata',
  'sitemap-lists-noindex': 'head-metadata',
  'meta-title-missing': 'head-metadata',
  'meta-title-length': 'head-metadata',
  'title-not-translated': 'head-metadata',
  'meta-description-missing': 'head-metadata',
  'meta-description-length': 'head-metadata',
  'canonical-missing': 'head-metadata',
  'canonical-conflicting': 'head-metadata',
  'jsonld-missing': 'head-metadata',
  'jsonld-invalid': 'head-metadata',
  'hreflang-missing': 'head-metadata',
  'hreflang-invalid': 'head-metadata',
  'hreflang-no-return-link': 'head-metadata',
  'hreflang-target-invalid': 'head-metadata',
  'heading-hierarchy-skip': 'head-metadata',
  'multiple-h1': 'head-metadata',
  'no-h1': 'head-metadata',
  'opengraph-missing': 'head-metadata',
  'link-text': 'head-metadata',
  'crawlable-anchors': 'head-metadata',
  'structured-data-entity-missing': 'head-metadata',
  'entity-data-incomplete': 'head-metadata',
  'faq-content-without-schema': 'head-metadata',
  'mixed-content': 'mixed-content',
  'sitemap-missing': 'sitemap-check',
  'sitemap-stale': 'sitemap-check',
  'sitemap-orphan-page': 'sitemap-check',
  'sitemap-lists-redirects': 'sitemap-check',
  'image-oversized': 'lighthouse',
  'image-legacy-format': 'lighthouse',
  'lcen-mentions-legales-missing': 'mentions-legales',
  'keyboard-trap': 'keyboard-navigation',
  'focus-order-mismatch': 'keyboard-navigation',
  'form-error-not-associated': 'form-error-handling',
  'video-missing-captions': 'video-captions',
  'placeholder-only-label': 'placeholder-labels',
  'alt-text-quality-heuristic': 'alt-text',
  'canonical-target-unreachable': 'canonical-target',
  'canonical-target-noindex': 'canonical-target',
  'llms-txt-missing': 'llms-txt-check',
  'security-header-missing-csp': 'security-headers',
  'security-header-missing-hsts': 'security-headers',
  'security-header-missing-x-frame-options': 'security-headers',
  'security-header-missing-referrer-policy': 'security-headers',
  'security-header-missing-permissions-policy': 'security-headers',
  'cookie-non-essential-before-consent': 'cookie-consent',
  'tracker-request-before-consent': 'cookie-consent',
  'consent-mechanism-absent': 'cookie-consent',
  'youtube-tracking-embed': 'cookie-consent',
  'third-party-data-transfer': 'cookie-consent',
  'accessibility-statement-missing': 'accessibility-statement',
  'nap-phone-mismatch': 'nap-consistency',
  'nap-postal-code-mismatch': 'nap-consistency',
  'reflow-horizontal-scroll': 'reflow',
  'relative-link-nesting': CRAWL_INVENTORY_CHECK_ID,
  'html-structural-validity': 'html-validity',
  'structured-data-invalid': 'structured-data',
  'crux-lcp-poor': 'crux-field-data',
  'crux-cls-poor': 'crux-field-data',
  'crux-inp-poor': 'crux-field-data',
};

/** Rule ids the table knows. Exported for the completeness test only. */
export const MAPPED_CUSTOM_RULE_IDS: readonly string[] = Object.keys(CUSTOM_RULE_CHECKS);

/**
 * The check whose accepted attempt a finding's evidence must come from, or
 * undefined for a custom rule nobody declared, which the consistency gate
 * treats as a finding without provenance.
 */
export function observationCheckId(
  finding: Pick<Finding, 'source' | 'ruleId'>,
): string | undefined {
  switch (finding.source) {
    case 'axe':
      return 'axe';
    case 'lighthouse':
      return 'lighthouse';
    case 'renderdiff':
      return 'render-diff';
    case 'custom':
      return CUSTOM_RULE_CHECKS[finding.ruleId];
  }
}

/** Checks whose evidence is one site-wide acquisition rather than a page's. */
export const SITE_OBSERVATION_CHECK_IDS: ReadonlySet<string> = new Set([
  CRAWL_INVENTORY_CHECK_ID,
  ROBOTS_POLICY_CHECK_ID,
  'sitemap-check',
  'llms-txt-check',
  'security-headers',
  'cookie-consent',
  'accessibility-statement',
  'crux-field-data',
]);

export type FindingDisposition = 'confirmed' | 'signal';

/**
 * Section 5.13's disposition registry. A heuristic rule is a red flag that
 * needs a person to confirm it, so it is a signal and never part of a
 * confirmed total, whatever the report later does with it.
 */
export function findingDisposition(finding: Pick<Finding, 'ruleId'>): FindingDisposition {
  return HEURISTIC_RULE_IDS.has(finding.ruleId) ? 'signal' : 'confirmed';
}
