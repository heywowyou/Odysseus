/**
 * Plan 045 slice 1.1: the CLI `odysseus normalize <dir>` command's body,
 * extracted so `makeReportReady` (make-report-ready.ts) can renormalize a
 * stale audit from the dashboard, not only from a terminal. Behavior is
 * unchanged: re-runs normalization offline from stored scan.json files
 * only (local disk, falling back to the bucket - issue #63), overwrites
 * findings.json and re-stamps manifest.json. Never scans, never touches
 * the network, never touches MongoDB - the CLI command still doesn't
 * either; only backfillAuditRow (called separately by callers of this
 * function) writes to the audits collection.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  buildTranslationClusters,
  buildFindingsProvenance,
  attributableCoreWebVitals,
  unstableLabMetricsOf,
  deriveCoverageLimitations,
  isBlockedRender,
  lighthouseFinalUrl,
  lighthouseLandedOffSite,
  normalizeAudit,
  type AuditManifest,
  type NormalizePageInput,
  type TranslationCluster,
} from '@odysseus/core';
import { buildArtifactBucketKey, parseAuditTimestampDir } from '@odysseus/scanner';
import { resolveArtifactFile } from '../artifacts/resolve-artifact.js';
import type { ArtifactStore } from '../artifacts/artifact-store.js';

/** Issue #63: the bucket key needs hostname and startedAt, which
 *  buildAuditDir encodes into a real audit directory's own
 *  `<hostname>/<timestamp>` layout - read from the path rather than from
 *  manifest.json, since that read is exactly the one that might need the
 *  bucket fallback below. Returns undefined for a directory that isn't in
 *  that shape (a de-identified test fixture, a renamed local copy),
 *  matching this command's original directory-name-agnostic behaviour:
 *  no identity means no bucket key, so every read below falls back to a
 *  plain local read exactly as it always has. */
function tryReadAuditDirIdentity(
  resolvedDir: string,
): { hostname: string; startedAt: Date } | undefined {
  try {
    return {
      hostname: path.basename(path.dirname(resolvedDir)),
      startedAt: parseAuditTimestampDir(path.basename(resolvedDir)),
    };
  } catch {
    return undefined;
  }
}

/** Reads one artifact file, going through the bucket fallback only when
 *  `identity` is known - see tryReadAuditDirIdentity. */
async function readArtifact(
  localPath: string,
  relativePath: string,
  identity: { hostname: string; startedAt: Date } | undefined,
  artifactStore: ArtifactStore | undefined,
): Promise<Buffer> {
  if (!identity) return fs.readFile(localPath);
  return resolveArtifactFile(
    localPath,
    buildArtifactBucketKey(identity.hostname, identity.startedAt, relativePath),
    artifactStore,
  );
}

async function readPageInputs(
  artifactsDir: string,
  identity: { hostname: string; startedAt: Date } | undefined,
  artifactStore: ArtifactStore | undefined,
): Promise<NormalizePageInput[]> {
  const pagesDir = path.join(artifactsDir, 'pages');
  const entries = await fs.readdir(pagesDir, { withFileTypes: true });

  const pages: NormalizePageInput[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const relativePath = path.join('pages', entry.name, 'scan.json');
    try {
      const raw = await readArtifact(
        path.join(artifactsDir, relativePath),
        relativePath,
        identity,
        artifactStore,
      );
      pages.push(JSON.parse(raw.toString('utf-8')) as NormalizePageInput);
    } catch (error) {
      // A page directory with no scan.json (neither locally nor, if a
      // bucket is configured, in it) is skipped exactly as before this
      // issue - resolveArtifactFile's own "not found" error is the bucket-
      // aware equivalent of the plain ENOENT this loop always tolerated.
      const isEnoent = (error as NodeJS.ErrnoException).code === 'ENOENT';
      const isBucketMiss =
        error instanceof Error && /artifact not found locally/u.test(error.message);
      if (!isEnoent && !isBucketMiss) throw error;
    }
  }
  return pages;
}

export interface RenormalizeAuditResult {
  auditId: string;
  pageCount: number;
  findingCount: number;
  manifest: AuditManifest;
}

/**
 * Re-runs normalization offline against stored scan.json files in
 * `artifactsDir`, overwrites findings.json, and re-stamps manifest.json
 * with the recomputed findings provenance. Never scans, never touches the
 * network or MongoDB - callers that need the audits collection updated
 * too call backfillAuditRow separately, same as before this extraction.
 */
export async function renormalizeAudit(
  artifactsDir: string,
  artifactStore: ArtifactStore | undefined,
): Promise<RenormalizeAuditResult> {
  const resolvedDir = path.resolve(artifactsDir);
  await fs.mkdir(resolvedDir, { recursive: true });

  const identity = tryReadAuditDirIdentity(resolvedDir);
  const manifestPath = path.join(resolvedDir, 'manifest.json');
  const manifestBytes = await readArtifact(manifestPath, 'manifest.json', identity, artifactStore);
  const manifest = JSON.parse(manifestBytes.toString('utf-8')) as AuditManifest;

  // Only the pages the manifest lists. A scan folder can outlive its page's
  // place in the audit: a real resumed scan kept 68 folders (date archives,
  // paginated categories) for pages the crawl later left out, and reading
  // the whole directory brought them back on every report regeneration,
  // turning 106 findings into 136.
  const listedUrls = new Set(manifest.pages.map((entry) => entry.url));
  const pages = (await readPageInputs(resolvedDir, identity, artifactStore)).filter((page) =>
    listedUrls.has(page.url),
  );

  // B2 (2026-08-24): collapses language-variant duplicates. Manifests
  // written before the field existed carry no clusters, so they are
  // rebuilt here from the same stored head metadata writeAuditArtifacts
  // itself reads - the whole point of this command is that a stored
  // audit gets today's normalization rules without being re-scanned, and
  // a clustering rule that only ever applied to fresh scans would have
  // broken that promise. Recomputed clusters are written back to the
  // manifest below, because the report layer reads them from there
  // rather than from findings.json.
  // A stored page whose Lighthouse run ended on another site was a doorway
  // to a booking engine that our render did not follow; newer scans record
  // it as a redirect, and a refresh applies the same reading to older ones.
  const scanForUrl = new Map(pages.map((page) => [page.url, page]));
  const classifiedPages = manifest.pages.map((entry) => {
    const lighthouse = scanForUrl.get(entry.url)?.lighthouse;
    if (entry.status !== 'visited' || lighthouse === undefined) return entry;
    if (!lighthouseLandedOffSite(lighthouse, entry.url)) return entry;
    const { analysisCoverage: _coverage, ...rest } = entry;
    const target = lighthouseFinalUrl(lighthouse);
    return {
      ...rest,
      status: 'redirect-interstitial' as const,
      ...(target !== undefined ? { redirectTargetUrl: target } : {}),
    };
  });

  const manifestPageByUrl = new Map(classifiedPages.map((entry) => [entry.url, entry]));
  const translationClusters: TranslationCluster[] = buildTranslationClusters(
    pages.map((page) => {
      const manifestPage = manifestPageByUrl.get(page.url);
      return {
        pageUrl: page.url,
        ...(manifestPage?.language !== undefined ? { language: manifestPage.language } : {}),
        hreflangLinks: page.headMetadata?.hreflangLinks ?? [],
        languageSwitcherLinks: page.headMetadata?.languageSwitcherLinks ?? [],
      };
    }),
  );

  const sitemapRedirectedUrls = classifiedPages
    .filter(
      (page) =>
        page.status === 'redirect-interstitial' || page.status === 'skipped-external-redirect',
    )
    .map((page) => page.url);
  const pagesForNormalization =
    sitemapRedirectedUrls.length === 0
      ? pages
      : pages.map((page) =>
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
                },
              },
        );

  // Re-derived rather than read back: a persisted copy may come from an
  // older, broader derivation that silenced absence rules on redirects.
  const coverageLimitations = deriveCoverageLimitations(classifiedPages, {
    ...(manifest.crawl.homepageUrl !== undefined
      ? { homepageUrl: manifest.crawl.homepageUrl }
      : {}),
    capOmittedPageCount: manifest.crawl.sitemapCoverage?.capOmittedPageCount ?? 0,
  });
  const findings = normalizeAudit({
    translationClusters,
    coverageLimitations,
    auditId: manifest.auditId,
    startedAt: new Date(manifest.startedAt),
    pages: pagesForNormalization,
    crawl: {
      startUrl: manifest.crawl.startUrl,
      robotsTxtFound: manifest.crawl.robotsTxtFound,
      pages: classifiedPages.map((page) => ({
        url: page.url,
        status: page.status,
        ...(page.depth !== undefined ? { depth: page.depth } : {}),
        ...(page.httpStatus !== undefined ? { httpStatus: page.httpStatus } : {}),
        ...(page.discoveredFrom !== undefined ? { discoveredFrom: page.discoveredFrom } : {}),
      })),
      ...(manifest.crawl.robotsDisallowMatches !== undefined
        ? { robotsDisallowMatches: manifest.crawl.robotsDisallowMatches }
        : {}),
      ...(manifest.crawl.aiCrawlerBlocks !== undefined
        ? { aiCrawlerBlocks: manifest.crawl.aiCrawlerBlocks }
        : {}),
      ...(manifest.crawl.sitemapUrls !== undefined
        ? { sitemapUrls: manifest.crawl.sitemapUrls }
        : {}),
      ...(manifest.relativeLinkNestingSummary !== undefined
        ? { relativeLinkNestingSummary: manifest.relativeLinkNestingSummary }
        : {}),
    },
    ...(manifest.cruxFieldData !== undefined ? { cruxFieldData: manifest.cruxFieldData } : {}),
  });

  await fs.writeFile(path.join(resolvedDir, 'findings.json'), JSON.stringify(findings, null, 2));

  // Lab metrics are frozen into the manifest when a scan is written. Stored
  // audits predate the rule that a challenge page, an error template or a
  // run that settled on another URL measures nothing about the page, so
  // they are recomputed here from each page's own stored Lighthouse run.
  const scanPageByUrl = new Map(pages.map((page) => [page.url, page]));
  const manifestPages = classifiedPages.map((entry) => {
    const scanPage = scanPageByUrl.get(entry.url);
    if (scanPage === undefined) return entry;
    const { coreWebVitals: _stored, unstableLabMetrics: _storedUnstable, ...rest } = entry;
    const isContent =
      entry.status === 'visited' &&
      !isBlockedRender(scanPage.renderDiff, scanPage.headMetadata?.title);
    const coreWebVitals = isContent
      ? attributableCoreWebVitals(scanPage.lighthouse, entry.url)
      : undefined;
    if (coreWebVitals === undefined) return rest;
    const unstableLabMetrics = unstableLabMetricsOf(scanPage.performanceMeasurement);
    return {
      ...rest,
      coreWebVitals,
      ...(unstableLabMetrics !== undefined ? { unstableLabMetrics } : {}),
    };
  });

  const renormalizedManifest: AuditManifest = {
    ...manifest,
    pages: manifestPages,
    translationClusters,
    coverageLimitations,
    renormalizedAt: new Date().toISOString(),
    findingsProvenance: buildFindingsProvenance(findings),
  };
  await fs.writeFile(manifestPath, JSON.stringify(renormalizedManifest, null, 2));

  return {
    auditId: manifest.auditId,
    pageCount: pages.length,
    findingCount: findings.length,
    manifest: renormalizedManifest,
  };
}
