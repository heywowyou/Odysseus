import type { AuditManifest, Finding } from '@odysseus/core';
import { isConfinedToThirdPartyFrame } from './third-party-attribution.js';

/**
 * Plan 075, Q4. A site whose sitemap publishes many pages that no page of the
 * site links to has two populations: the site a visitor can walk, and a
 * backlog only a search engine reaches. When that backlog is most of what was
 * analysed, findings that exist only there describe it, not the site, and
 * letting them drive the grade and the cover totals misstates both.
 *
 * Measured on the ten stored audits of 2026-09-22: one site had 74% of its
 * analysed pages reachable only through the sitemap; every other site had 21%
 * or less. Half separates the two cleanly. Below it, sitemap-only pages count
 * like any other page, as before.
 *
 * Like third-party frame content (Q1), such findings stay in the technical
 * annex and are named in a statistics note; `sitemap-orphan-page` reports the
 * backlog itself as one site-level finding.
 */
const UNLINKED_SITEMAP_SHARE_THRESHOLD = 0.5;

export function unlinkedSitemapPageUrls(manifest: AuditManifest): ReadonlySet<string> {
  const visited = manifest.pages.filter((page) => page.status === 'visited');
  const sitemapOnly = visited.filter((page) => page.discoveryMethod === 'sitemap-only');
  if (visited.length === 0) return new Set();
  if (sitemapOnly.length / visited.length < UNLINKED_SITEMAP_SHARE_THRESHOLD) return new Set();
  return new Set(sitemapOnly.map((page) => page.url));
}

export function isConfinedToUnlinkedSitemapPages(
  finding: Pick<Finding, 'pageUrls'>,
  unlinkedUrls: ReadonlySet<string>,
): boolean {
  return (
    unlinkedUrls.size > 0 &&
    finding.pageUrls.length > 0 &&
    finding.pageUrls.every((url) => unlinkedUrls.has(url))
  );
}

/** The findings every headline count, priority and grade is built from. */
export function primaryFindingFilter(
  manifest: AuditManifest | undefined,
): (finding: Pick<Finding, 'elements' | 'pageUrls'>) => boolean {
  const unlinked = manifest === undefined ? new Set<string>() : unlinkedSitemapPageUrls(manifest);
  return (finding) =>
    !isConfinedToThirdPartyFrame(finding) && !isConfinedToUnlinkedSitemapPages(finding, unlinked);
}
