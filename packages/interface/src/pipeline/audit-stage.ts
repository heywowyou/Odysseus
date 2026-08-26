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
  getRenderSettleTimeoutMs,
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
import {
  normalizeAudit,
  type AuditConfigSnapshot,
  type AuditManifest,
  type Finding,
  type ObligationAssessment,
  type SiteSignalOverrides,
  normalizeRegistryDisplayName,
} from '@odysseus/core';
import { persistAudit, prefillAuditManualFields } from '@odysseus/store';
import { runObligationStage } from './obligation-stage.js';

export interface RunAuditStageOptions {
  maxPages?: number;
  maxDepth?: number;
  /** Not exposed by the `odysseus audit` CLI flags today, but needed by
   *  the interface's advanced-options delay override (brief section
   *  7.1) - a real, disclosed extension of this stage's scope beyond
   *  what the CLI command it was extracted from did. */
  delayMs?: number;
  onProgress?: (event: ScanProgressEvent) => void;
  /** Checksum-validated at the CLI/interface boundary before it ever
   *  reaches this stage (see the manual-SIREN milestone) - runObligationStage
   *  re-checks defensively but trusts the caller for the primary
   *  validation. Never suppresses the LCEN finding: that is a fact about
   *  the site's own mentions-legales page, decided entirely by the scan,
   *  independent of anything supplied here. */
  manualSiren?: string;
  /** Manual site-signal override milestone. Only 'hasTransactionalFlow'
   *  is exposed by the CLI/interface today - see obligation-stage.ts's
   *  resolveSiteSignals for why the mechanism itself stays generic. */
  siteSignalOverrides?: SiteSignalOverrides;
  /** Manual-input-layer milestone, pre-scan fields - see
   *  JobOptionsSnapshot in @odysseus/store for why these invalidate a
   *  crawl and therefore live at this stage rather than at report time. */
  seeds?: string[];
  exclusions?: string[];
  bookingEngineUrl?: string;
  /** Milestone 9b: forwarded to scanSite. Full audits never set this -
   *  see ScanPageOptions.skipLighthouse's doc comment for why the
   *  prospecting pipeline does. */
  skipLighthouse?: boolean;
}

export interface AuditStageResult {
  auditId: string;
  manifest: AuditManifest;
  findings: Finding[];
  auditDir: string;
  visitedCount: number;
  prunedPageDirCount: number;
  obligationAssessment: ObligationAssessment;
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
      ...(options.seeds !== undefined ? { seeds: options.seeds } : {}),
      ...(options.exclusions !== undefined ? { exclusions: options.exclusions } : {}),
      ...(options.bookingEngineUrl !== undefined ? { bookingEngineUrl: options.bookingEngineUrl } : {}),
      ...(options.skipLighthouse ? { skipLighthouse: options.skipLighthouse } : {}),
    });

    const finishedAt = new Date();

    const config: AuditConfigSnapshot = {
      maxPages: options.maxPages ?? getMaxPages(),
      maxDepth: options.maxDepth ?? getMaxCrawlDepth(),
      crawlDelayMs: options.delayMs ?? getCrawlDelayMs(),
      pageTimeoutMs: getPageTimeoutMs(),
      lighthouseTimeoutMs: getLighthouseTimeoutMs(),
      renderSettleTimeoutMs: getRenderSettleTimeoutMs(),
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

    // Runs before normalizeAudit deliberately: it only needs manifest.
    // siteSignals (populated by writeAuditArtifacts above), never
    // findings.json, so a failed or slow Sirene lookup can never block
    // normalization.
    const obligationAssessment = await runObligationStage(
      artifacts.manifest,
      connection,
      options.manualSiren,
      options.siteSignalOverrides,
    );

    const findings = normalizeAudit({
      // B2 (2026-08-24): collapses language-variant duplicates. Absent
      // on manifests predating the field, which simply yields no
      // collapsing - the behaviour before this existed.
      ...(artifacts.manifest.translationClusters !== undefined
        ? { translationClusters: artifacts.manifest.translationClusters }
        : {}),
      auditId: artifacts.auditId,
      startedAt,
      pages: artifacts.pages,
      crawl: {
        startUrl: artifacts.manifest.crawl.startUrl,
        pages: artifacts.manifest.pages.map((page) => ({
          url: page.url,
          status: page.status,
          ...(page.httpStatus !== undefined ? { httpStatus: page.httpStatus } : {}),
          ...(page.discoveredFrom !== undefined ? { discoveredFrom: page.discoveredFrom } : {}),
        })),
        ...(artifacts.manifest.crawl.robotsDisallowMatches !== undefined
          ? { robotsDisallowMatches: artifacts.manifest.crawl.robotsDisallowMatches }
          : {}),
        ...(artifacts.manifest.crawl.aiCrawlerBlocks !== undefined
          ? { aiCrawlerBlocks: artifacts.manifest.crawl.aiCrawlerBlocks }
          : {}),
      },
      ...(artifacts.manifest.cruxFieldData !== undefined
        ? { cruxFieldData: artifacts.manifest.cruxFieldData }
        : {}),
    });
    await writeFindingsFile(artifacts.auditDir, findings);

    const { prunedPageDirs } = await pruneScreenshots(
      artifacts.auditDir,
      prunePageInfoFromManifest(artifacts.manifest),
    );

    await persistAudit(connection, artifacts.manifest, findings);

    // 2026-08-22, La Corniche report review: the audit doc must exist
    // before this (persistAudit upserts by auditId above), and
    // fill-if-absent never overwrites a manual field an operator already
    // entered - see prefillAuditManualFields's own doc comment. Reuses
    // obligationAssessment's already-resolved registrySnapshot rather
    // than a second Sirene lookup; siteSignals.siteName is populated by
    // writeAuditArtifacts (write-audit.ts's deriveSiteName) from the
    // homepage's own head metadata, since Sirene frequently has no
    // commercial/brand name on file at all.
    const normalisedRaisonSociale =
      obligationAssessment.registrySnapshot?.denomination !== undefined
        ? normalizeRegistryDisplayName(obligationAssessment.registrySnapshot.denomination)
        : undefined;

    await prefillAuditManualFields(connection, artifacts.auditId, {
      ...(artifacts.manifest.siteSignals?.siteName !== undefined
        ? { nomCommercial: artifacts.manifest.siteSignals.siteName }
        : {}),
      // A2 (2026-08-24): normalised for display only. The legal-exposure
      // section keeps reading registrySnapshot.denomination byte-exact,
      // because its own copy claims the name is reproduced as Sirene
      // holds it - see normalizeRegistryDisplayName's doc comment for
      // why the two surfaces deliberately differ.
      ...(normalisedRaisonSociale !== undefined ? { raisonSociale: normalisedRaisonSociale } : {}),
      ...(artifacts.manifest.siteSignals?.siren !== undefined
        ? { siren: artifacts.manifest.siteSignals.siren }
        : {}),
    });

    return {
      auditId: artifacts.auditId,
      manifest: artifacts.manifest,
      findings,
      auditDir: artifacts.auditDir,
      visitedCount: siteResult.crawl.visitedCount,
      prunedPageDirCount: prunedPageDirs.length,
      obligationAssessment,
    };
  } finally {
    await browser.close();
  }
}
