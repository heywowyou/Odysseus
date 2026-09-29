import { classifyDocumentWall } from '../acquisition/host-signal.js';
import type { ManifestPageEntry } from '../types/manifest.js';
import { normalizeUrlIdentity } from './url-identity.js';
import type { RenderDiffResult } from '../types/findings.js';

/**
 * Plan 075 K3: a link the crawl admitted that answers 404 or 410 with the
 * site's own error template is a dead link, not a page that refused us.
 * domaine-d-auriac wrote its email address as a relative link and
 * yonahotel wrapped three hrefs in literal quotes; each answered « Page non
 * trouvée » and was recorded `blocked`, which held both reports behind the
 * blocked-page gate and kept the links out of `broken-internal-link`.
 */
const DEAD_LINK_STATUSES = new Set([404, 410]);

export function isDeadLinkRender(result: RenderDiffResult | undefined): boolean {
  if (result === undefined) return false;
  const renderedStatus = result.renderedHttpStatus ?? result.httpStatus;
  if (!DEAD_LINK_STATUSES.has(renderedStatus) || !DEAD_LINK_STATUSES.has(result.httpStatus)) {
    return false;
  }
  const rendered = classifyDocumentWall({
    status: renderedStatus,
    visibleTextLength: result.renderedTextLength,
    ...(result.renderedTitle !== undefined ? { title: result.renderedTitle } : {}),
    ...(result.renderedInterstitialMarkers !== undefined
      ? { markers: result.renderedInterstitialMarkers }
      : {}),
  });
  const raw = classifyDocumentWall({
    status: result.httpStatus,
    visibleTextLength: result.rawTextLength,
    ...(result.rawDocument !== undefined
      ? {
          markupLength: result.rawDocument.markupLength,
          markers: result.rawDocument.interstitialMarkers,
        }
      : {}),
  });
  return rendered.classification === 'content' && raw.classification === 'content';
}

export interface DeadLinkReferrerInput {
  url: string;
  /** Links the page's post-render passes found, with the page as referrer. */
  surfaceLinks?: readonly { url: string }[];
}

/** Names the page that links to each dead link when the crawl did not record
 *  one: links found after rendering were admitted without their referrer
 *  before plan 075 K3, and the stored post-render links still show it. Only
 *  the entries in `deadLinkUrls` are touched, the pages a verdict just
 *  decided were dead links. */
export function nameDeadLinkReferrers(
  entries: readonly ManifestPageEntry[],
  pages: readonly DeadLinkReferrerInput[],
  deadLinkUrls: ReadonlySet<string>,
): ManifestPageEntry[] {
  const identity = (url: string): string => normalizeUrlIdentity(url) ?? url;
  const referrerByIdentity = new Map<string, string>();
  for (const page of [...pages].sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))) {
    for (const link of page.surfaceLinks ?? []) {
      const key = identity(link.url);
      if (!referrerByIdentity.has(key)) referrerByIdentity.set(key, page.url);
    }
  }
  return entries.map((entry) => {
    if (entry.status !== 'http-error-status' || !deadLinkUrls.has(entry.url)) return entry;
    if (entry.discoveredFrom !== undefined) return entry;
    const referrer = referrerByIdentity.get(identity(entry.url));
    return referrer !== undefined ? { ...entry, discoveredFrom: referrer } : entry;
  });
}
