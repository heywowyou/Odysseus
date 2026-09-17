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
 *
 * ZC_sdk__zc-iframe added from a real Domaine Lagnonu scan (`.ZC_sdk__zc-
 * iframe_k5FE3 >>> button`, `body.page > iframe.ZC_sdk__zc-iframe_k5FE3`):
 * the ZenChef booking-widget SDK. Without it, a theme confined entirely to
 * this vendor's markup rendered "provider not identified" in the annex
 * while section 03's transactional-flow note (which derives the vendor
 * from the redirect URL, not this table) correctly named ZenChef -
 * see the three-site review, 2026-08-25.
 */
const VENDOR_SELECTOR_PATTERNS: ReadonlyArray<{ pattern: RegExp; vendor: string }> = [
  { pattern: /popmake|pum-content/i, vendor: 'Popup Maker' },
  { pattern: /gform|gravity-theme/i, vendor: 'Gravity Forms' },
  { pattern: /smartpreview/i, vendor: 'SmartPreview' },
  // Issue #299: Diadao is a hotel web agency, and on haaitza.com it is
  // both the author of the site's own WordPress theme and the vendor of a
  // same-origin booking widget. A bare /diadao/ match filed the theme's
  // own navigation, header bar and layout shifts under "your agency
  // cannot modify this code directly", which is the exact opposite of
  // true: the agency wrote that code. Scoped to the widget's own markers,
  // so the transactional-flow case (#diadao-widget, the HSC SDK
  // packages/scanner's transactional-flow.ts already names) still
  // attributes, and site chrome does not. Omitting an attribution is
  // safe; making the wrong one is not.
  { pattern: /diadao[-_]?(widget|hsc)/i, vendor: 'Diadao' },
  { pattern: /cmplz/i, vendor: 'Complianz' },
  { pattern: /ZC_sdk|zc-iframe|zenchef/i, vendor: 'ZenChef' },
  // Issue #392: YouTube's embedded player markup (atlantichotel.fr,
  // `iframe[frameborder="0"] >>> .ytmVideoInfoChannelAvatar`). The `ytm`
  // prefix is matched case-sensitively with its capital so an ordinary
  // class such as `.ytmenu` never reads as YouTube.
  { pattern: /(^|[\s.#>])(ytp-|ytm[A-Z])|youtube(-nocookie)?\.com/, vendor: 'YouTube' },
  { pattern: /player\.vimeo\.com|vp-(controls|player)/i, vendor: 'Vimeo' },
];

/** A shadow-piercing selector (Playwright's `>>>` combinator) means the
 *  matched element sits inside a nested, usually cross-origin iframe -
 *  by definition not markup on the page the client's own agency can
 *  edit, whether or not the vendor is one of the named ones above. */
function crossesFrameBoundary(selector: string): boolean {
  return selector.includes('>>>');
}

/** Issue #299: a WordPress theme is the site's own code. Whoever authored
 *  it, it is what the client's agency is paid to maintain, so nothing
 *  under /wp-content/themes/ can be something they "cannot modify
 *  directly" - unlike /wp-content/plugins/, which is a third party's
 *  release the agency would have to fork to patch. Checked before the
 *  vendor table so a theme slug that happens to carry a vendor's name
 *  cannot be read as that vendor's component. */
const FIRST_PARTY_PATH_PATTERN = /wp-content\/themes\//i;

/** Exported so any other caller with a raw selector but no Finding (e.g.
 *  legal-exposure.ts's TransactionalFlowEvidence, which carries the same
 *  kind of selector string) can reuse the same vendor table instead of
 *  re-deriving vendor names from scratch. */
export function detectVendor(selector: string): string | undefined {
  if (FIRST_PARTY_PATH_PATTERN.test(selector)) return undefined;
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
  return finding.elements.some(
    (el) => detectVendor(el.selector) !== undefined || crossesFrameBoundary(el.selector),
  );
}

/** Issue #392: every captured element of the finding sits in third-party
 *  markup, so the finding is not one of the site's own defects at all (as
 *  opposed to isThirdPartyFinding, where one element is enough). A finding
 *  with no captured element is never confined. */
export function isConfinedToThirdParty(finding: Pick<Finding, 'elements'>): boolean {
  return (
    finding.elements.length > 0 &&
    finding.elements.every(
      (el) => detectVendor(el.selector) !== undefined || crossesFrameBoundary(el.selector),
    )
  );
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

/** Issue #392: the operator dashboard's view of third-party findings: each
 *  confined finding with its vendor (null when only the frame boundary
 *  identifies it), and how many of each severity they account for. */
export function summarizeThirdPartyFindings(
  findings: readonly Pick<Finding, 'findingId' | 'severity' | 'elements'>[],
): {
  byFindingId: Record<string, { vendor: string | null }>;
  severityRollup: Record<Finding['severity'], number>;
} {
  const byFindingId: Record<string, { vendor: string | null }> = {};
  const severityRollup = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const finding of findings) {
    if (!isConfinedToThirdParty(finding)) continue;
    byFindingId[finding.findingId] = { vendor: detectFindingVendor(finding) ?? null };
    severityRollup[finding.severity] += 1;
  }
  return { byFindingId, severityRollup };
}
