import type { Finding } from './types/findings.js';

/** A shadow-piercing selector (Playwright's `>>>` combinator) means the
 *  matched element sits inside a nested, usually cross-origin iframe -
 *  by definition not markup on the page the client's own agency can
 *  edit. */
export function crossesFrameBoundary(selector: string): boolean {
  return selector.includes('>>>');
}

/** Q1 (plan 075): whether every captured element of the finding sits inside
 *  an embedded frame. Only this population leaves the grade, the totals,
 *  the priorities and the preview. A vendor widget rendered into the page's
 *  own DOM (a form plugin, a consent banner, a booking SDK) is still what
 *  the site serves and chose to configure, so it keeps counting; it is only
 *  labelled with its vendor in the annex. A finding with no captured
 *  element is never confined. */
export function isConfinedToThirdPartyFrame(finding: Pick<Finding, 'elements'>): boolean {
  return (
    finding.elements.length > 0 && finding.elements.every((el) => crossesFrameBoundary(el.selector))
  );
}
