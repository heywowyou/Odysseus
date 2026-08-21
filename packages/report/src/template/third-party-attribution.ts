import type { Finding } from '@odysseus/core';

/**
 * report-feedback-la-corniche.md item 1.4: a large share of a real
 * report's annex was markup the client cannot fix - a WordPress plugin
 * (Popup Maker, Gravity Forms), a booking-widget vendor's own iframe
 * content, a preview-panel embed, the cookie-consent banner (Complianz) -
 * presented with no distinction from the client's own defects. Their
 * agency cannot edit code inside a third-party iframe or plugin, and
 * presenting these as ordinary non-conformities the client "should have
 * fixed" invites the reasonable objection that the whole report is naive
 * about how the site is actually built. REGRESSION of report-feedback-
 * haaitza.md item D6.
 *
 * A small, explicit prefix table, not an inferred pattern match - same
 * "confirmed against real scanner output, not assumed" bar
 * constants.ts's Lighthouse dedupe list already documents. Vendor names
 * are the actual selector prefixes/plugin slugs seen in the real data
 * (lacoorniche.com), not guessed.
 */
const VENDOR_SELECTOR_PATTERNS: ReadonlyArray<{ pattern: RegExp; vendor: string }> = [
  { pattern: /popmake|pum-content/i, vendor: 'Popup Maker' },
  { pattern: /gform|gravity-theme/i, vendor: 'Gravity Forms' },
  { pattern: /smartpreview/i, vendor: 'SmartPreview' },
  { pattern: /diadao/i, vendor: 'Diadao' },
  { pattern: /cmplz/i, vendor: 'Complianz' },
];

/** A shadow-piercing selector (Playwright's `>>>` combinator) means the
 *  matched element sits inside a nested, usually cross-origin iframe -
 *  by definition not markup on the page the client's own agency can
 *  edit, whether or not the vendor is one of the named ones above. */
function crossesFrameBoundary(selector: string): boolean {
  return selector.includes('>>>');
}

/** Exported so any other caller with a raw selector but no Finding (e.g.
 *  legal-exposure.ts's TransactionalFlowEvidence, which carries the same
 *  kind of selector string) can reuse the same vendor table instead of
 *  re-deriving vendor names from scratch. */
export function detectVendor(selector: string): string | undefined {
  for (const { pattern, vendor } of VENDOR_SELECTOR_PATTERNS) {
    if (pattern.test(selector)) return vendor;
  }
  return undefined;
}

/** A finding is third-party if any of its captured element selectors
 *  either match a known vendor prefix or cross a frame boundary -
 *  matching classifyDiversion's own "any page/element is enough" scope,
 *  since a finding with even one third-party element still needs the
 *  same "talk to your vendor" framing for that instance. */
export function isThirdPartyFinding(finding: Pick<Finding, 'elements'>): boolean {
  return finding.elements.some((el) => detectVendor(el.selector) !== undefined || crossesFrameBoundary(el.selector));
}

/** The vendor name for a third-party finding, when one of the known
 *  prefixes matched; undefined for a frame-crossing selector matching no
 *  named vendor (still third-party, just not attributable to a specific
 *  product by name). */
export function detectFindingVendor(finding: Pick<Finding, 'elements'>): string | undefined {
  for (const el of finding.elements) {
    const vendor = detectVendor(el.selector);
    if (vendor) return vendor;
  }
  return undefined;
}
