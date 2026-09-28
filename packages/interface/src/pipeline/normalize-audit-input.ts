/**
 * The one builder of `normalizeAudit`'s input from a stored audit (issue
 * #502). The live audit stage and a refresh (fingerprint bump,
 * make-report-ready, CLI normalize, scripts/renormalize-audits.mjs) used to
 * build it separately, and the refresh copy dropped `crawl.homepageUrl`, so
 * every refresh of an audit whose start URL was not the homepage re-anchored
 * site-level findings to another page and changed their identity. Both paths
 * call this now, so a field cannot again reach one and miss the other.
 *
 * Pure. Listed in scripts/fixture-fingerprint.mjs, because what it passes
 * changes what normalization writes.
 */

import {
  deriveCoverageLimitations,
  type AuditManifest,
  type ManifestPageEntry,
  type NormalizeAuditInput,
  type NormalizePageInput,
  type TranslationCluster,
} from '@odysseus/core';

export interface BuildNormalizeAuditInputOptions {
  auditId: string;
  startedAt: Date;
  manifest: Pick<AuditManifest, 'crawl' | 'relativeLinkNestingSummary' | 'cruxFieldData'>;
  /** The manifest's page entries, as the calling path classifies them. */
  manifestPages: readonly ManifestPageEntry[];
  /** The stored per-page scanner output to normalize. */
  pages: readonly NormalizePageInput[];
  translationClusters?: readonly TranslationCluster[];
}

export function buildNormalizeAuditInput(
  options: BuildNormalizeAuditInputOptions,
): NormalizeAuditInput & { coverageLimitations: ReturnType<typeof deriveCoverageLimitations> } {
  const { manifest, manifestPages } = options;
  const crawl = manifest.crawl;

  // A page that redirected elsewhere is not a missing sitemap target: every
  // sitemap check learns the audit's redirected URLs.
  const sitemapRedirectedUrls = manifestPages
    .filter(
      (page) =>
        page.status === 'redirect-interstitial' || page.status === 'skipped-external-redirect',
    )
    .map((page) => page.url);
  // Plan 075 I1: another-language pages the site sent our French browser
  // away from are neither redirects nor missing. The scanner's own
  // redirected list can hold them too, so they are passed separately and
  // the sitemap check drops them from every count and comparison.
  const languageAlternateUrls = manifestPages
    .filter((page) => page.status === 'language-redirect')
    .map((page) => page.url);
  const pages =
    sitemapRedirectedUrls.length === 0 && languageAlternateUrls.length === 0
      ? [...options.pages]
      : options.pages.map((page) =>
          page.sitemapCheck === undefined
            ? page
            : {
                ...page,
                sitemapCheck: {
                  ...page.sitemapCheck,
                  redirectedUrls: [
                    ...new Set([
                      ...(page.sitemapCheck.redirectedUrls ?? []),
                      ...sitemapRedirectedUrls,
                    ]),
                  ],
                  ...(languageAlternateUrls.length > 0 ? { languageAlternateUrls } : {}),
                },
              },
        );

  return {
    // B2 (2026-08-24): collapses language-variant duplicates. Absent on
    // manifests predating the field, which simply yields no collapsing.
    ...(options.translationClusters !== undefined
      ? { translationClusters: options.translationClusters }
      : {}),
    // Re-derived rather than read back: a persisted copy may come from an
    // older, broader derivation that silenced absence rules on redirects.
    coverageLimitations: deriveCoverageLimitations([...manifestPages], {
      ...(crawl.homepageUrl !== undefined ? { homepageUrl: crawl.homepageUrl } : {}),
      capOmittedPageCount: crawl.sitemapCoverage?.capOmittedPageCount ?? 0,
    }),
    auditId: options.auditId,
    startedAt: options.startedAt,
    pages,
    crawl: {
      startUrl: crawl.startUrl,
      ...(crawl.homepageUrl !== undefined ? { homepageUrl: crawl.homepageUrl } : {}),
      robotsTxtFound: crawl.robotsTxtFound,
      pages: manifestPages.map((page) => ({
        url: page.url,
        status: page.status,
        ...(page.depth !== undefined ? { depth: page.depth } : {}),
        ...(page.httpStatus !== undefined ? { httpStatus: page.httpStatus } : {}),
        ...(page.discoveredFrom !== undefined ? { discoveredFrom: page.discoveredFrom } : {}),
      })),
      ...(crawl.robotsDisallowMatches !== undefined
        ? { robotsDisallowMatches: crawl.robotsDisallowMatches }
        : {}),
      ...(crawl.aiCrawlerBlocks !== undefined ? { aiCrawlerBlocks: crawl.aiCrawlerBlocks } : {}),
      ...(crawl.sitemapUrls !== undefined ? { sitemapUrls: crawl.sitemapUrls } : {}),
      ...(manifest.relativeLinkNestingSummary !== undefined
        ? { relativeLinkNestingSummary: manifest.relativeLinkNestingSummary }
        : {}),
    },
    ...(manifest.cruxFieldData !== undefined ? { cruxFieldData: manifest.cruxFieldData } : {}),
  };
}
