/**
 * Writes a completed site scan to disk in the layout described in
 * paths.ts: manifest.json plus one pages/<slug>-<hash>/scan.json per
 * scanned page. Screenshots themselves are written earlier, in place,
 * during scanSite (the caller passes the correct pages/ parent directory
 * into scanSite's screenshotDir option before scanning starts), so there
 * is no write-then-move step here.
 *
 * Deliberately never calls @odysseus/core's normalizeAudit or writes
 * findings.json: scanner is I/O, core is pure normalization, and only the
 * CLI composes the two together (plus persistence via @odysseus/store).
 * Keeping that boundary means scanner never has to know what a Finding
 * is.
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Browser } from 'playwright';
import {
  extractCoreWebVitals,
  extractLighthouseExcludedCategoryScores,
  type AuditConfigSnapshot,
  type AuditManifest,
  type AuditManifestSiteSignals,
  type ManifestKind,
  type ManifestPageEntry,
} from '@odysseus/core';
import { getArtifactsRoot } from '../config.js';
import type { CrawlResult } from '../crawl.js';
import type { PageScanResult } from '../scan-page.js';
import type { NormalizePageInput } from '@odysseus/core';
import { buildAuditDir, buildPageDir } from './paths.js';
import { toAuditRelativeRefs } from './relativize.js';
import { collectToolVersions } from './versions.js';
import { buildManifest } from './manifest.js';

export interface WriteAuditArtifactsInput {
  kind: ManifestKind;
  siteResult: { crawl: CrawlResult; pages: PageScanResult[] };
  browser: Browser;
  startedAt: Date;
  finishedAt: Date;
  config: AuditConfigSnapshot;
  /** Generated via crypto.randomUUID() if omitted. */
  auditId?: string;
}

export interface WriteAuditArtifactsResult {
  auditId: string;
  auditDir: string;
  manifest: AuditManifest;
  /** Relativized and ready to hand straight to @odysseus/core's
   *  normalizeAudit(). */
  pages: NormalizePageInput[];
}

function buildScanJson(
  scanResult: PageScanResult,
  relativizedRenderDiff: PageScanResult['renderDiff'],
): PageScanResult {
  return {
    url: scanResult.url,
    ...(relativizedRenderDiff !== undefined ? { renderDiff: relativizedRenderDiff } : {}),
    ...(scanResult.renderDiffError !== undefined ? { renderDiffError: scanResult.renderDiffError } : {}),
    ...(scanResult.axe !== undefined ? { axe: scanResult.axe } : {}),
    ...(scanResult.axeError !== undefined ? { axeError: scanResult.axeError } : {}),
    ...(scanResult.lighthouse !== undefined ? { lighthouse: scanResult.lighthouse } : {}),
    ...(scanResult.lighthouseError !== undefined ? { lighthouseError: scanResult.lighthouseError } : {}),
    ...(scanResult.mentionsLegales !== undefined ? { mentionsLegales: scanResult.mentionsLegales } : {}),
    ...(scanResult.mentionsLegalesError !== undefined ? { mentionsLegalesError: scanResult.mentionsLegalesError } : {}),
    ...(scanResult.transactionalFlowEvidence !== undefined
      ? { transactionalFlowEvidence: scanResult.transactionalFlowEvidence }
      : {}),
    ...(scanResult.transactionalFlowRedirectChecks !== undefined
      ? { transactionalFlowRedirectChecks: scanResult.transactionalFlowRedirectChecks }
      : {}),
    ...(scanResult.headMetadata !== undefined ? { headMetadata: scanResult.headMetadata } : {}),
    ...(scanResult.headMetadataError !== undefined ? { headMetadataError: scanResult.headMetadataError } : {}),
    ...(scanResult.sitemapCheck !== undefined ? { sitemapCheck: scanResult.sitemapCheck } : {}),
    ...(scanResult.mixedContent !== undefined ? { mixedContent: scanResult.mixedContent } : {}),
    ...(scanResult.mixedContentError !== undefined ? { mixedContentError: scanResult.mixedContentError } : {}),
  };
}

/** Accumulates the two site-level obligation-engine signals across every
 *  scanned page: the SIREN found on the identified mentions-legales page
 *  (if any), and whether any page anywhere on the site shows a
 *  first-party transactional flow. Always populated for an audit run
 *  under this milestone's code - AuditManifestSiteSignals is optional on
 *  AuditManifest only for backward compatibility with older manifests. */
function buildSiteSignals(siteResult: WriteAuditArtifactsInput['siteResult']): AuditManifestSiteSignals {
  const transactionalFlowEvidence = siteResult.pages.flatMap((page) => page.transactionalFlowEvidence ?? []);
  const transactionalFlowRedirectChecks = siteResult.pages.flatMap(
    (page) => page.transactionalFlowRedirectChecks ?? [],
  );
  const mentionsLegalesPageUrl = siteResult.crawl.mentionsLegalesPageUrl;
  const mentionsLegalesPage = mentionsLegalesPageUrl
    ? siteResult.pages.find((page) => page.url === mentionsLegalesPageUrl)
    : undefined;
  const siren = mentionsLegalesPage?.mentionsLegales?.siren;

  return {
    hasTransactionalFlow: transactionalFlowEvidence.length > 0,
    transactionalFlowEvidence,
    ...(transactionalFlowRedirectChecks.length > 0 ? { transactionalFlowRedirectChecks } : {}),
    ...(siren !== undefined ? { siren } : {}),
    ...(mentionsLegalesPageUrl !== undefined ? { mentionsLegalesPageUrl } : {}),
  };
}

export async function writeAuditArtifacts(
  input: WriteAuditArtifactsInput,
): Promise<WriteAuditArtifactsResult> {
  const auditId = input.auditId ?? randomUUID();
  const hostname = new URL(input.siteResult.crawl.startUrl).hostname;
  const auditDir = buildAuditDir(getArtifactsRoot(), hostname, input.startedAt);
  const pagesDir = path.join(auditDir, 'pages');
  await fs.mkdir(pagesDir, { recursive: true });

  const scanByUrl = new Map(input.siteResult.pages.map((page) => [page.url, page]));
  const manifestPages: ManifestPageEntry[] = [];
  const normalizePages: NormalizePageInput[] = [];

  for (const crawledPage of input.siteResult.crawl.pages) {
    const scanResult = scanByUrl.get(crawledPage.url);

    if (crawledPage.status !== 'visited' || !scanResult) {
      manifestPages.push({
        url: crawledPage.url,
        depth: crawledPage.depth,
        status: crawledPage.status,
        ...(crawledPage.httpStatus !== undefined ? { httpStatus: crawledPage.httpStatus } : {}),
        ...(crawledPage.error !== undefined ? { crawlError: crawledPage.error } : {}),
        ...(crawledPage.discoveredFrom !== undefined ? { discoveredFrom: crawledPage.discoveredFrom } : {}),
        errors: {},
      });
      continue;
    }

    const pageDir = buildPageDir(scanResult.url);
    const pageDirPath = path.join(pagesDir, pageDir);
    await fs.mkdir(pageDirPath, { recursive: true });

    const relativizedRenderDiff = scanResult.renderDiff
      ? toAuditRelativeRefs(scanResult.renderDiff, auditDir)
      : undefined;

    const scanJson = buildScanJson(scanResult, relativizedRenderDiff);
    await fs.writeFile(path.join(pageDirPath, 'scan.json'), JSON.stringify(scanJson, null, 2));

    manifestPages.push({
      url: scanResult.url,
      pageDir: path.join('pages', pageDir),
      depth: crawledPage.depth,
      status: 'visited',
      ...(crawledPage.httpStatus !== undefined ? { httpStatus: crawledPage.httpStatus } : {}),
      ...(crawledPage.discoveredFrom !== undefined ? { discoveredFrom: crawledPage.discoveredFrom } : {}),
      ...(scanResult.renderDiff !== undefined
        ? { renderDiffMissingPercent: scanResult.renderDiff.missingPercent }
        : {}),
      ...(scanResult.lighthouse !== undefined
        ? { lighthouseExcludedCategoryScores: extractLighthouseExcludedCategoryScores(scanResult.lighthouse) }
        : {}),
      ...(scanResult.lighthouse !== undefined
        ? { coreWebVitals: extractCoreWebVitals(scanResult.lighthouse) }
        : {}),
      errors: {
        ...(scanResult.renderDiffError !== undefined ? { renderDiff: scanResult.renderDiffError } : {}),
        ...(scanResult.axeError !== undefined ? { axe: scanResult.axeError } : {}),
        ...(scanResult.lighthouseError !== undefined ? { lighthouse: scanResult.lighthouseError } : {}),
      },
    });

    // Passed the relativized render-diff result too, so a Finding merged
    // from this page carries portable, directory-relative screenshot refs
    // in rawEvidence.perPage rather than machine-specific absolute paths.
    normalizePages.push(buildScanJson(scanResult, relativizedRenderDiff));
  }

  const tool = await collectToolVersions(input.browser, input.siteResult.pages);
  const manifest = buildManifest({
    auditId,
    kind: input.kind,
    siteUrl: input.siteResult.crawl.startUrl,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    tool,
    config: input.config,
    crawl: input.siteResult.crawl,
    pages: manifestPages,
    siteSignals: buildSiteSignals(input.siteResult),
  });

  await fs.writeFile(path.join(auditDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  return { auditId, auditDir, manifest, pages: normalizePages };
}
