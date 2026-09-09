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
  deleteCrawlCheckpoint,
  deleteCrawlStateFile,
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
  writeManifestFile,
  type PrunePageInfo,
  type ScanProgressEvent,
} from '@odysseus/scanner';
import {
  normalizeAudit,
  buildFindingsProvenance,
  type AuditConfigSnapshot,
  type AuditManifest,
  type Finding,
  type ObligationAssessment,
  type SiteSignalOverrides,
  type SitemapMode,
  normalizeRegistryDisplayName,
  summarizeAuditCoverage,
  type AuditCoverageSummary,
} from '@odysseus/core';
import { persistAudit, prefillAuditManualFields } from '@odysseus/store';
import { runObligationStage } from './obligation-stage.js';
import { createConfiguredArtifactStore } from '../artifacts/configured-artifact-store.js';
import { syncAuditDirToBucket } from '../artifacts/sync-audit-artifacts.js';
import { logger } from '../logger.js';

export interface RunAuditStageOptions {
  maxPages?: number;
  maxDepth?: number;
  /** Per-job crawl pacing (issue #111). Exposed by the `odysseus audit`
   *  CLI (--crawl-delay-ms) and the interface's advanced-options delay
   *  override (brief section 7.1). Clamped up to the configured
   *  CRAWL_DELAY_MS before it reaches scanSite, so a job can slow its own
   *  crawl below production defaults but never speed it up; robots.txt's
   *  own crawl-delay stays a further floor inside crawlSite. */
  delayMs?: number;
  /** Per-job scan-lane bound (issue #111, --scan-concurrency on the CLI).
   *  Clamped down to the configured SCAN_CONCURRENCY for the same reason:
   *  the option can only reduce load, never raise it. */
  scanConcurrency?: number;
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
  /** Full audits default to `supplement`; prospecting passes `inspect`. */
  sitemapMode?: Exclude<SitemapMode, 'none'>;
  /** Plan 035 (issue #124): the job's stable run identity. When present,
   *  its startedAt drives buildAuditDir and the manifest, so the audit
   *  directory (keyed by hostname plus timestamp) is stable across orphan
   *  re-claims and every per-page result already on disk stays reusable;
   *  its auditId becomes the persisted audit's id. When absent (the CLI
   *  path) the stage mints a fresh startedAt exactly as before. */
  runIdentity?: { startedAt: Date; auditId: string };
}

export interface AuditStageResult {
  auditId: string;
  manifest: AuditManifest;
  findings: Finding[];
  auditDir: string;
  visitedCount: number;
  prunedPageDirCount: number;
  coverageSummary: AuditCoverageSummary;
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
  // Plan 035: the run identity's startedAt (or a minted one on the CLI
  // path) is the audit's timestamp end to end: directory name, manifest,
  // and normalize input all come from this one value.
  const startedAt = options.runIdentity?.startedAt ?? new Date();
  const { browser, debugPort } = await launchBrowser();

  try {
    const hostname = new URL(url).hostname;
    const auditDir = buildAuditDir(getArtifactsRoot(), hostname, startedAt);
    const screenshotDir = path.join(auditDir, 'pages');

    // Issue #111: a per-job pacing option may only ever slow the crawl
    // down, so it can also serve as the coverage gate's "slow the crawl"
    // remediation for one site without reconfiguring production. The delay
    // is raised to the configured default (robots.txt's crawl-delay stays a
    // further floor inside crawlSite); the scan concurrency is lowered to
    // the configured default. The config snapshot below records these
    // effective values, keeping a report generated under per-site slow
    // pacing self-documenting, like a MAX_PAGES cap today.
    const effectiveDelayMs =
      options.delayMs !== undefined ? Math.max(options.delayMs, getCrawlDelayMs()) : undefined;
    const effectiveScanConcurrency =
      options.scanConcurrency !== undefined
        ? Math.min(options.scanConcurrency, getScanConcurrency())
        : undefined;

    // Plan 035: assembled before the scan so the crawl checkpoint can
    // record the exact configuration the crawl ran under; the same object
    // is reused for writeAuditArtifacts, so the manifest and the
    // checkpoint can never disagree.
    const config: AuditConfigSnapshot = {
      maxPages: options.maxPages ?? getMaxPages(),
      maxDepth: options.maxDepth ?? getMaxCrawlDepth(),
      crawlDelayMs: effectiveDelayMs ?? getCrawlDelayMs(),
      pageTimeoutMs: getPageTimeoutMs(),
      lighthouseTimeoutMs: getLighthouseTimeoutMs(),
      renderSettleTimeoutMs: getRenderSettleTimeoutMs(),
      userAgent: getCrawlerUserAgent(),
      scanConcurrency: effectiveScanConcurrency ?? getScanConcurrency(),
      sitemapMode: options.sitemapMode ?? 'supplement',
    };

    const siteResult = await scanSite(url, {
      browser,
      debugPort,
      screenshotDir,
      auditDir,
      // Issue #64: a real full audit can run for hours over thousands of
      // pages. Without this, every page's full result (axe/Lighthouse
      // JSON, evidence arrays) stayed in memory for the run's whole
      // duration and eventually exhausted the Node heap, losing the
      // entire run even though screenshots had already streamed to disk.
      // writeAuditArtifacts below reads pages back from disk instead.
      writePagesAsScanned: true,
      ...(options.maxPages !== undefined ? { maxPages: options.maxPages } : {}),
      ...(options.maxDepth !== undefined ? { maxDepth: options.maxDepth } : {}),
      ...(effectiveDelayMs !== undefined ? { delayMs: effectiveDelayMs } : {}),
      ...(effectiveScanConcurrency !== undefined ? { concurrency: effectiveScanConcurrency } : {}),
      ...(options.onProgress !== undefined ? { onProgress: options.onProgress } : {}),
      ...(options.seeds !== undefined ? { seeds: options.seeds } : {}),
      ...(options.exclusions !== undefined ? { exclusions: options.exclusions } : {}),
      ...(options.bookingEngineUrl !== undefined
        ? { bookingEngineUrl: options.bookingEngineUrl }
        : {}),
      ...(options.skipLighthouse ? { skipLighthouse: options.skipLighthouse } : {}),
      ...(options.sitemapMode !== undefined ? { sitemapMode: options.sitemapMode } : {}),
      // Plan 021: the staged full-audit planner (family-stratified
      // Lighthouse selection) is gated on Lighthouse actually running.
      // Prospecting always sets skipLighthouse, so it stays on the
      // legacy per-page path and never acquires full-audit
      // representative policy, per Step 5's explicit requirement -
      // rather than an unconditional flag whose "harmless because
      // Lighthouse never fires anyway" reasoning is a weaker guarantee
      // than simply never entering that code path at all.
      fullAuditPlanning: !options.skipLighthouse,
      // Plan 035: full audits stamp the crawl checkpoint with this run's
      // identity and config, and resume from one when a previous attempt
      // left it behind. Never set on the prospecting path.
      ...(!options.skipLighthouse
        ? {
            checkpointContext: { startedAt, config },
            onResumeDecision: (decision) => {
              if (decision.mode === 'resumed') {
                logger.info(
                  {
                    reusedPages: decision.reusedPages,
                    // Plan 035 step 4: distinguishes a mid-crawl frontier
                    // resume (crawl-state.json) from a post-gate checkpoint
                    // resume; absent on the checkpoint path.
                    ...(decision.frontierResumed === true ? { frontierResumed: true } : {}),
                  },
                  'full audit resumed from the crawl checkpoint',
                );
              } else {
                // A mismatch after a config or scanner upgrade is normal
                // operation, not an error.
                logger.info(
                  { reason: decision.reason },
                  'full audit starting a fresh crawl (no reusable checkpoint)',
                );
              }
            },
          }
        : {}),
    });

    const finishedAt = new Date();

    const artifacts = await writeAuditArtifacts({
      kind: 'audit',
      siteResult,
      browser,
      startedAt,
      finishedAt,
      config,
      // Plan 035: a queued run's auditId is the job's run identity stamp,
      // minted once per job; writeAuditArtifacts keeps its own randomUUID
      // mint as the fallback when no run identity was supplied (CLI path).
      ...(options.runIdentity !== undefined ? { auditId: options.runIdentity.auditId } : {}),
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
          ...(page.depth !== undefined ? { depth: page.depth } : {}),
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
    const manifest: AuditManifest = {
      ...artifacts.manifest,
      findingsProvenance: buildFindingsProvenance(findings),
    };
    await writeManifestFile(artifacts.auditDir, manifest);

    const { prunedPageDirs } = await pruneScreenshots(
      artifacts.auditDir,
      prunePageInfoFromManifest(manifest),
    );

    await persistAudit(connection, manifest, findings);

    // Plan 035: the checkpoint's job is done once the audit is persisted;
    // a crash after this point re-runs the post-scan stages idempotently
    // (persistAudit upserts by auditId, analyses are insert-only and
    // reuse-existing on disk), never re-crawling.
    deleteCrawlCheckpoint(artifacts.auditDir);
    deleteCrawlStateFile(artifacts.auditDir);

    // Issue #63: sync after the local write and the DB row both succeeded,
    // never before - a bucket failure must not block an already-valid
    // local deliverable. Runs after pruneScreenshots so a pruned page's
    // screenshot is never uploaded only to be orphaned in the bucket.
    await syncAuditDirToBucket(
      createConfiguredArtifactStore(),
      artifacts.auditDir,
      hostname,
      startedAt,
    );

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
      manifest,
      findings,
      auditDir: artifacts.auditDir,
      visitedCount: siteResult.crawl.visitedCount,
      prunedPageDirCount: prunedPageDirs.length,
      coverageSummary: summarizeAuditCoverage(manifest),
      obligationAssessment,
    };
  } finally {
    await browser.close();
  }
}
