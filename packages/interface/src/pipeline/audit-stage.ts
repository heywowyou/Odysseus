/**
 * Scan a site, normalize its findings, and persist both, exactly as the
 * `odysseus audit` CLI command does today - this is that command's body,
 * extracted so both `cli` and the queued pipeline call one implementation
 * rather than maintaining two. See CLAUDE.md's "Pipeline stage
 * extraction" note in the milestone-7 plan for why this was extracted
 * rather than left as accepted duplication.
 */

import path from 'node:path';
import type { Connection } from 'mongoose';
import {
  buildAuditDir,
  getArtifactsRoot,
  getCrawlDelayMs,
  getCrawlerUserAgent,
  getLighthouseTimeoutMs,
  getMaxCrawlDepth,
  getMaxPages,
  getPageTimeoutMs,
  getScanConcurrency,
  launchBrowser,
  pruneScreenshots,
  scanSite,
  writeAuditArtifacts,
  writeFindingsFile,
  type PrunePageInfo,
  type ScanProgressEvent,
} from '@odysseus/scanner';
import { normalizeAudit, type AuditConfigSnapshot, type AuditManifest, type Finding } from '@odysseus/core';
import { persistAudit } from '@odysseus/store';

export interface RunAuditStageOptions {
  maxPages?: number;
  maxDepth?: number;
  /** Not exposed by the `odysseus audit` CLI flags today, but needed by
   *  the interface's advanced-options delay override (brief section
   *  7.1) - a real, disclosed extension of this stage's scope beyond
   *  what the CLI command it was extracted from did. */
  delayMs?: number;
  onProgress?: (event: ScanProgressEvent) => void;
}

export interface AuditStageResult {
  auditId: string;
  manifest: AuditManifest;
  findings: Finding[];
  auditDir: string;
  visitedCount: number;
  prunedPageDirCount: number;
}

/** Derives pruneScreenshots' page list from the manifest it already
 *  produced, rather than re-deriving it from raw scan results, so the
 *  manifest stays the single source of truth for what was scanned. */
function prunePageInfoFromManifest(manifest: AuditManifest): PrunePageInfo[] {
  return manifest.pages
    .filter((page): page is typeof page & { pageDir: string } => page.pageDir !== undefined)
    .map((page) => ({
      pageUrl: page.url,
      pageDir: page.pageDir,
      missingPercent: page.renderDiffMissingPercent,
      isHomepage: page.url === manifest.crawl.startUrl,
    }));
}

export async function runAuditStage(
  url: string,
  options: RunAuditStageOptions,
  connection: Connection,
): Promise<AuditStageResult> {
  const startedAt = new Date();
  const { browser, debugPort } = await launchBrowser();

  try {
    const hostname = new URL(url).hostname;
    const screenshotDir = path.join(buildAuditDir(getArtifactsRoot(), hostname, startedAt), 'pages');

    const siteResult = await scanSite(url, {
      browser,
      debugPort,
      screenshotDir,
      ...(options.maxPages !== undefined ? { maxPages: options.maxPages } : {}),
      ...(options.maxDepth !== undefined ? { maxDepth: options.maxDepth } : {}),
      ...(options.delayMs !== undefined ? { delayMs: options.delayMs } : {}),
      ...(options.onProgress !== undefined ? { onProgress: options.onProgress } : {}),
    });

    const finishedAt = new Date();

    const config: AuditConfigSnapshot = {
      maxPages: options.maxPages ?? getMaxPages(),
      maxDepth: options.maxDepth ?? getMaxCrawlDepth(),
      crawlDelayMs: options.delayMs ?? getCrawlDelayMs(),
      pageTimeoutMs: getPageTimeoutMs(),
      lighthouseTimeoutMs: getLighthouseTimeoutMs(),
      userAgent: getCrawlerUserAgent(),
      scanConcurrency: getScanConcurrency(),
    };

    const artifacts = await writeAuditArtifacts({
      kind: 'audit',
      siteResult,
      browser,
      startedAt,
      finishedAt,
      config,
    });

    const findings = normalizeAudit({
      auditId: artifacts.auditId,
      startedAt,
      pages: artifacts.pages,
    });
    await writeFindingsFile(artifacts.auditDir, findings);

    const { prunedPageDirs } = await pruneScreenshots(
      artifacts.auditDir,
      prunePageInfoFromManifest(artifacts.manifest),
    );

    await persistAudit(connection, artifacts.manifest, findings);

    return {
      auditId: artifacts.auditId,
      manifest: artifacts.manifest,
      findings,
      auditDir: artifacts.auditDir,
      visitedCount: siteResult.crawl.visitedCount,
      prunedPageDirCount: prunedPageDirs.length,
    };
  } finally {
    await browser.close();
  }
}
