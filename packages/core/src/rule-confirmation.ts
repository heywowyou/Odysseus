/**
 * Which custom rules have been confirmed on real audits (after plan 075 sweep
 * 9). A rule we wrote ourselves can be wrong in ways its unit tests do not
 * show: `focus-order-mismatch` shipped in August, never had a finding read
 * until sweep 9, and every one of its production findings turned out false
 * (a consent banner holding the Tab walk, J3). It counted in the totals of
 * three reports the whole time.
 *
 * So a custom rule is `unconfirmed` until a real finding of it has been read
 * and found true. Its findings are still reported, in the annex as points to
 * verify, but they stay out of the grade, the totals, the priorities and the
 * outreach proof cards (report's `reportPopulation`). Confirming a rule is a
 * one-line change here, with the audit and finding that confirmed it as its
 * basis. axe and Lighthouse rules are the vendors' and are not listed.
 *
 * The registry is exhaustive over CUSTOM_CHECK_SEVERITY
 * (rule-confirmation.test.ts), so a new custom rule cannot ship without
 * taking a side, and it starts unconfirmed.
 */
import { CUSTOM_CHECK_SEVERITY } from './normalize/severity.js';

export type RuleConfirmationStatus = 'confirmed' | 'unconfirmed';

export interface RuleConfirmation {
  status: RuleConfirmationStatus;
  /** What confirmed it, or why it is not confirmed yet. */
  basis: string;
}

const READ_IN_SWEEPS =
  'Fired on the production audits and read in the defect-hunt sweeps (plans/defect-hunt-ledger.md, sweeps 4 to 9).';
const NEVER_FIRED =
  'Never fired on the 21 latest production audits (2026-09-28): no real finding has been read.';

const confirmed = (basis = READ_IN_SWEEPS): RuleConfirmation => ({ status: 'confirmed', basis });
const unconfirmed = (basis = NEVER_FIRED): RuleConfirmation => ({ status: 'unconfirmed', basis });

export const CUSTOM_RULE_CONFIRMATION: Readonly<Record<string, RuleConfirmation>> = {
  'robots-blocks-indexing': unconfirmed(),
  'noindex-on-public-page': confirmed(),
  'redirect-chain-excessive': unconfirmed(),
  'broken-internal-link': confirmed(),
  'mixed-content': unconfirmed(),
  'http-error-status': unconfirmed(),
  'meta-title-missing': unconfirmed(),
  'meta-title-length': confirmed(),
  'meta-description-missing': confirmed(),
  'meta-description-length': confirmed(),
  'canonical-missing': confirmed(),
  'canonical-conflicting': unconfirmed(),
  'sitemap-missing': confirmed(),
  'sitemap-stale': confirmed(),
  'jsonld-missing': confirmed(),
  'jsonld-invalid': confirmed(),
  'hreflang-missing': confirmed(),
  'hreflang-invalid': unconfirmed(),
  'hreflang-no-return-link': confirmed(),
  'hreflang-target-invalid': confirmed(),
  'title-not-translated': confirmed(),
  // Read true on aflatta's offer pages (live probe, 2026-09-29).
  'title-announces-error': confirmed(),
  // Read true on clos-sainte-marie's `/?lang=en` (live probe, 2026-09-29).
  'hreflang-target-language-mismatch': confirmed(),
  // Read true on regina-hotel's Portuguese pages declared Breton (2026-09-29).
  'html-lang-content-mismatch': confirmed(),
  'heading-hierarchy-skip': confirmed(),
  'multiple-h1': confirmed(),
  'no-h1': confirmed(),
  'opengraph-missing': confirmed(),
  'link-text': confirmed(),
  'crawlable-anchors': confirmed(),
  'image-oversized': unconfirmed(),
  'image-legacy-format': unconfirmed(),
  'lcen-mentions-legales-missing': confirmed(),
  'keyboard-trap': confirmed(
    'Hotel Europe\'s #date_evenement blocks Tab with onkeydown="return false;" (sweep 9).',
  ),
  'focus-order-mismatch': unconfirmed(
    'Every production finding was false, a consent banner holding the Tab walk (sweep 9, plan 075 J3); none has been read since the fix.',
  ),
  'form-error-not-associated': confirmed(),
  'video-missing-captions': unconfirmed(
    'Fired only falsely before plan 075 B3 (muted videos with no loaded source); none has been read since the fix.',
  ),
  'placeholder-only-label': confirmed(),
  'alt-text-quality-heuristic': confirmed(),
  'canonical-target-unreachable': confirmed(),
  'canonical-target-noindex': unconfirmed(),
  'sitemap-orphan-page': confirmed(),
  'sitemap-lists-redirects': confirmed(),
  'sitemap-lists-noindex': confirmed(),
  'robots-disallow-broad': confirmed(),
  'relative-link-nesting': confirmed(),
  'llms-txt-missing': confirmed(),
  'ai-crawler-blocked': unconfirmed(),
  'structured-data-entity-missing': confirmed(),
  'entity-data-incomplete': confirmed(),
  'faq-content-without-schema': confirmed(),
  'structured-data-invalid': unconfirmed(
    'Fired only falsely before plan 075 E10 (unresolved @graph references); none has been read since the fix.',
  ),
  'security-header-missing-csp': confirmed(),
  'security-header-missing-hsts': confirmed(),
  'security-header-missing-x-frame-options': confirmed(),
  'security-header-missing-referrer-policy': confirmed(),
  'security-header-missing-permissions-policy': confirmed(),
  'cookie-non-essential-before-consent': confirmed(),
  'tracker-request-before-consent': confirmed(),
  'consent-mechanism-absent': confirmed(),
  'youtube-tracking-embed': confirmed(),
  'third-party-data-transfer': confirmed(),
  'accessibility-statement-missing': confirmed(),
  'nap-phone-mismatch': confirmed(),
  'nap-postal-code-mismatch': confirmed(),
  'reflow-horizontal-scroll': confirmed(),
  'html-structural-validity': confirmed(),
  'crux-lcp-poor': confirmed(),
  'crux-cls-poor': confirmed(),
  'crux-inp-poor': unconfirmed(),
};

/** True for a custom rule no real finding has confirmed yet. Vendor rules
 *  (axe, Lighthouse) and unknown ids are never unconfirmed here. */
export function isUnconfirmedRule(ruleId: string): boolean {
  return (
    Object.hasOwn(CUSTOM_CHECK_SEVERITY, ruleId) &&
    CUSTOM_RULE_CONFIRMATION[ruleId]?.status === 'unconfirmed'
  );
}
