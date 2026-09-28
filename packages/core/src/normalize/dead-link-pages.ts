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

export interface DeadLinkPageInput {
  url: string;
  renderDiff?: RenderDiffResult;
  /** Links the page's post-render passes found, with the page as referrer. */
  surfaceLinks?: readonly { url: string }[];
}

/** Reclassifies stored `blocked` pages that are dead links, and names the
 *  page that links to them when the crawl did not record it (links found
 *  after rendering were admitted without their referrer before K3). */
export function reclassifyDeadLinkPages(
  entries: readonly ManifestPageEntry[],
  pages: readonly DeadLinkPageInput[],
): ManifestPageEntry[] {
  const byUrl = new Map(pages.map((page) => [page.url, page]));
  const identity = (url: string): string => normalizeUrlIdentity(url) ?? url;
  const referrerByIdentity = new Map<string, string>();
  for (const page of [...pages].sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))) {
    for (const link of page.surfaceLinks ?? []) {
      const key = identity(link.url);
      if (!referrerByIdentity.has(key)) referrerByIdentity.set(key, page.url);
    }
  }
  return entries.map((entry) => {
    if (entry.status !== 'blocked') return entry;
    const renderDiff = byUrl.get(entry.url)?.renderDiff;
    if (!isDeadLinkRender(renderDiff)) return entry;
    const referrer = entry.discoveredFrom ?? referrerByIdentity.get(identity(entry.url));
    return {
      ...entry,
      status: 'http-error-status' as const,
      httpStatus: renderDiff!.renderedHttpStatus ?? renderDiff!.httpStatus,
      ...(referrer !== undefined ? { discoveredFrom: referrer } : {}),
    };
  });
}
