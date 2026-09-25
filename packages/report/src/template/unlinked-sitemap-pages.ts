import type { AuditManifest, Finding, Severity } from '@odysseus/core';
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

/** Only the page list is read, so a stored audit row serves as well as a
 *  manifest. */
type PopulationManifest = Pick<AuditManifest, 'pages'>;

export function unlinkedSitemapPageUrls(manifest: PopulationManifest): ReadonlySet<string> {
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
  manifest: PopulationManifest | undefined,
): (finding: Pick<Finding, 'elements' | 'pageUrls'>) => boolean {
  const unlinked = manifest === undefined ? new Set<string>() : unlinkedSitemapPageUrls(manifest);
  return (finding) =>
    !isConfinedToThirdPartyFrame(finding) && !isConfinedToUnlinkedSitemapPages(finding, unlinked);
}

type PopulationFinding = Pick<Finding, 'elements' | 'pageUrls'>;

/** The report's one split of an audit's findings (issue #508): the primary
 *  population every headline count, grade and priority reads, and the two
 *  buckets it leaves out, in the order they are tested. The Audits list, the
 *  audit page, the report statistics and the outreach preview all start from
 *  this, so no surface rebuilds the population its own way; a surface that
 *  narrows it further (the preview's proof filter) says so on top. */
export interface ReportPopulation<F extends PopulationFinding> {
  primary: F[];
  thirdPartyFrame: F[];
  unlinkedSitemap: F[];
}

export function reportPopulation<F extends PopulationFinding>(
  manifest: PopulationManifest | undefined,
  findings: readonly F[],
): ReportPopulation<F> {
  const unlinked = manifest === undefined ? new Set<string>() : unlinkedSitemapPageUrls(manifest);
  const population: ReportPopulation<F> = { primary: [], thirdPartyFrame: [], unlinkedSitemap: [] };
  for (const finding of findings) {
    if (isConfinedToThirdPartyFrame(finding)) population.thirdPartyFrame.push(finding);
    else if (isConfinedToUnlinkedSitemapPages(finding, unlinked)) {
      population.unlinkedSitemap.push(finding);
    } else population.primary.push(finding);
  }
  return population;
}

/** Distinct findings per severity over the primary population: the counts
 *  the Audits list and the audit page show. */
export function primarySeverityRollup(
  manifest: PopulationManifest | undefined,
  findings: readonly (PopulationFinding & Pick<Finding, 'severity'>)[],
): Record<Severity, number> {
  const rollup: Record<Severity, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const finding of reportPopulation(manifest, findings).primary) rollup[finding.severity] += 1;
  return rollup;
}
