/**
 * Shared by the full-audit write path (write-audit.ts) and the hotel prescan
 * (prescan/prescan-site.ts): a page is a redirect interstitial when the URL
 * a browser actually settles on after JavaScript runs differs from the URL
 * that was requested. Extracted from write-audit.ts (issue #85) so the two
 * pipelines cannot drift on what counts as one - detecting a client-side
 * redirect stub needs render-diff's settled rendered URL, and both
 * pipelines run the exact same render-diff primitive against the exact
 * same requested URL, so they must reach the exact same verdict.
 */

import { normalizePageUrl } from './links.js';

export function isRedirectInterstitial(requestedUrl: string, renderedLandedUrl: string): boolean {
  const requested = normalizePageUrl(requestedUrl, requestedUrl);
  const landed = normalizePageUrl(renderedLandedUrl, requestedUrl);
  return requested !== landed;
}
