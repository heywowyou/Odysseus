/**
 * Scan a site, normalize its findings, and persist both, exactly as the
 * `odysseus audit` CLI command does today - this is that command's body,
 * extracted so both `cli` and the queued pipeline call one implementation
 * rather than maintaining two. See CLAUDE.md's "Pipeline stage
 * extraction" note in the milestone-7 plan for why this was extracted
 * rather than left as accepted duplication.
 */

import * as fs from 'node:fs';
import path from 'node:path';
import type { Connection } from 'mongoose';
import {
  assertAcquisitionLease,
  buildAuditDir,
  type AuditEvidenceGraph,
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
  PUBLIC_SITE_NETWORK_POLICY,
  runEvidenceGraphStage,
  scanSite,
  StaleAcquisitionLeaseError,
  writeAcquisitionLease,
  writeAuditArtifacts,
  writeFindingsFile,
  writeManifestFile,
  type PageWorkGuard,
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
  type ScanIntent,
  type SiteSignalOverrides,
  type SitemapMode,
  summarizeAuditCoverage,
  type AuditCoverageSummary,
} from '@odysseus/core';
import {
  auditIdentityFromProspect,
  confirmedIdentityFromManualFields,
  fillMissingProspectIdentity,
  getProspectHub,
  getAuditManualFields,
  syncProspectIdentityIntoAudit,
  persistAudit,
  prefillAuditManualFields,
  replaceDetectedManualFields,
} from '@odysseus/store';
import { runObligationStage } from './obligation-stage.js';
import { buildRunAuditScope } from './audit-scope-stage.js';
import { createConfiguredArtifactStore } from '../artifacts/configured-artifact-store.js';
import { syncAuditDirToBucket } from '../artifacts/sync-audit-artifacts.js';
import { logger } from '../logger.js';

export interface RunAuditStageOptions {
  /** Durable prospect hub link for scans launched from the prospect page. */
  prospectId?: string;
  /** Durable reason for this single-site scan. Internal bounded prospecting
   *  calls leave it absent so their audits cannot qualify for outreach. */
  scanIntent?: ScanIntent;
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
  /** Issue #200: forwarded to scanSite's own onGuardReady, so a caller
   *  (the queued full-audit job) can force-close this run's live
   *  Chromium contexts on cancellation rather than only marking the job
   *  document cancelled. */
  onGuardReady?: (guard: PageWorkGuard) => void;
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
  /** Plan 059 step 22: the queue claim this run holds. Its id becomes the
   *  audit directory's acquisition lease, and the run confirms both the lease
   *  and the claim before each evidence write, so a worker whose job was
   *  requeued and re-claimed stops instead of overwriting the new worker's
   *  evidence. Absent on the CLI path, which has no queue. */
  acquisitionClaim?: AcquisitionClaim;
}

export interface AcquisitionClaim {
  claimId: string;
  isCurrent: () => Promise<boolean>;
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

/** Fills only the audit's own detected name and registry snapshot. The former
 * catalogue/candidate join is intentionally gone with the retired pipeline. */
function resolveCoverPrefill(
  obligationAssessment: ObligationAssessment,
  siteName: string | undefined,
): { nomCommercial?: string; raisonSociale?: string } {
  return {
    ...(siteName === undefined ? {} : { nomCommercial: siteName }),
    ...(obligationAssessment.registrySnapshot === undefined
      ? {}
      : { raisonSociale: obligationAssessment.registrySnapshot.denomination }),
  };
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
  // Plan 059: the browser dials only through the policy-enforcing egress
  // proxy, so Lighthouse and every subresource obey the same address rule
  // as the page routes.
  const { browser, debugPort, launchArgs } = await launchBrowser({
    networkPolicy: PUBLIC_SITE_NETWORK_POLICY,
  });

  try {
    const hostname = new URL(url).hostname;
    const auditDir = buildAuditDir(getArtifactsRoot(), hostname, startedAt);
    const screenshotDir = path.join(auditDir, 'pages');

    // The resumable crawl writes its frontier snapshot before
    // writeAuditArtifacts runs. Create the stable run directory first so
    // its atomic temp-file write cannot fail on a fresh full audit (#129).
    fs.mkdirSync(auditDir, { recursive: true });
    const claim = options.acquisitionClaim;
    if (claim !== undefined) writeAcquisitionLease(auditDir, claim.claimId);
    const holdClaim = async (): Promise<void> => {
      if (claim === undefined) return;
      assertAcquisitionLease(auditDir, claim.claimId);
      if (!(await claim.isCurrent())) throw new StaleAcquisitionLeaseError(auditDir);
    };

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

    const auditScope = buildRunAuditScope({
      url,
      scanIntent: options.scanIntent ?? (options.skipLighthouse ? 'quick-check' : 'full-audit'),
      config,
      maxPagesWasExplicit: options.maxPages !== undefined,
      maxDepthWasExplicit: options.maxDepth !== undefined,
      ...(options.seeds !== undefined ? { seeds: options.seeds } : {}),
      ...(options.exclusions !== undefined ? { exclusions: options.exclusions } : {}),
      ...(options.bookingEngineUrl !== undefined
        ? { bookingEngineUrl: options.bookingEngineUrl }
        : {}),
    });
    fs.writeFileSync(
      path.join(auditDir, 'audit-scope.json'),
      `${JSON.stringify(auditScope, null, 2)}\n`,
      'utf8',
    );

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
      ...(claim !== undefined ? { acquisitionLeaseId: claim.claimId } : {}),
      ...(options.maxPages !== undefined ? { maxPages: options.maxPages } : {}),
      ...(options.maxDepth !== undefined ? { maxDepth: options.maxDepth } : {}),
      ...(effectiveDelayMs !== undefined ? { delayMs: effectiveDelayMs } : {}),
      ...(effectiveScanConcurrency !== undefined ? { concurrency: effectiveScanConcurrency } : {}),
      ...(options.onProgress !== undefined ? { onProgress: options.onProgress } : {}),
      ...(options.onGuardReady !== undefined ? { onGuardReady: options.onGuardReady } : {}),
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
      networkPolicy: PUBLIC_SITE_NETWORK_POLICY,
      ...(!options.skipLighthouse ? { scopeDigest: auditScope.digest } : {}),
      // Plan 059: a diagnostic retry runs in a browser of its own, under the
      // same connection-time network policy as the main one.
      ...(!options.skipLighthouse
        ? {
            launchRecoveryBrowser: () =>
              launchBrowser({ networkPolicy: PUBLIC_SITE_NETWORK_POLICY }),
          }
        : {}),
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

    await holdClaim();
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
    // Issue #379: the linked prospect is read once. A SIREN the operator
    // typed on it is the manual SIREN whenever the launch did not supply
    // one, so it is never asked for twice.
    const prospect =
      options.prospectId === undefined
        ? null
        : await getProspectHub(connection, options.prospectId);
    const prospectIdentity = prospect === null ? undefined : auditIdentityFromProspect(prospect);
    const obligationAssessment = await runObligationStage(
      artifacts.manifest,
      connection,
      options.manualSiren ?? prospectIdentity?.confirmed.siren,
      options.siteSignalOverrides,
    );

    const sitemapRedirectedUrls = artifacts.manifest.pages
      .filter(
        (page) =>
          page.status === 'redirect-interstitial' || page.status === 'skipped-external-redirect',
      )
      .map((page) => page.url);
    const pagesForNormalization =
      sitemapRedirectedUrls.length === 0
        ? artifacts.pages
        : artifacts.pages.map((page) =>
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

    const findings = normalizeAudit({
      // B2 (2026-08-24): collapses language-variant duplicates. Absent
      // on manifests predating the field, which simply yields no
      // collapsing - the behaviour before this existed.
      ...(artifacts.manifest.translationClusters !== undefined
        ? { translationClusters: artifacts.manifest.translationClusters }
        : {}),
      ...(artifacts.manifest.coverageLimitations !== undefined
        ? { coverageLimitations: artifacts.manifest.coverageLimitations }
        : {}),
      auditId: artifacts.auditId,
      startedAt,
      pages: pagesForNormalization,
      crawl: {
        startUrl: artifacts.manifest.crawl.startUrl,
        ...(artifacts.manifest.crawl.homepageUrl !== undefined
          ? { homepageUrl: artifacts.manifest.crawl.homepageUrl }
          : {}),
        robotsTxtFound: artifacts.manifest.crawl.robotsTxtFound,
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
        ...(artifacts.manifest.crawl.sitemapUrls !== undefined
          ? { sitemapUrls: artifacts.manifest.crawl.sitemapUrls }
          : {}),
        ...(artifacts.manifest.relativeLinkNestingSummary !== undefined
          ? { relativeLinkNestingSummary: artifacts.manifest.relativeLinkNestingSummary }
          : {}),
      },
      ...(artifacts.manifest.cruxFieldData !== undefined
        ? { cruxFieldData: artifacts.manifest.cruxFieldData }
        : {}),
    });
    await holdClaim();
    await writeFindingsFile(artifacts.auditDir, findings);
    const manifest: AuditManifest = {
      ...artifacts.manifest,
      findingsProvenance: buildFindingsProvenance(findings),
      ...(options.prospectId !== undefined ? { prospectId: options.prospectId } : {}),
      ...(options.scanIntent !== undefined ? { scanIntent: options.scanIntent } : {}),
    };
    await writeManifestFile(artifacts.auditDir, manifest);

    // Plan 068 keeps Plan 059's evidence graph as diagnostic material, not
    // as global report approval. A failure here must not cost an audit that
    // took hours: it is logged and the normal report path continues with
    // detailed diagnostics unavailable. Normalized findings remain the
    // finding authority.
    let evidenceGraph: AuditEvidenceGraph | undefined;
    if (!options.skipLighthouse) {
      await holdClaim();
      try {
        evidenceGraph = runEvidenceGraphStage({
          auditDir: artifacts.auditDir,
          auditId: artifacts.auditId,
          scannedUrls: manifest.pages
            .filter((page) => page.status === 'visited')
            .map((page) => page.url),
          findings,
          config,
          timings: {
            pageTimeoutMs: config.pageTimeoutMs,
            renderSettleTimeoutMs: config.renderSettleTimeoutMs ?? 0,
            lighthouseTimeoutMs: config.lighthouseTimeoutMs,
            crawlDelayMs: config.crawlDelayMs,
            scanConcurrency: config.scanConcurrency,
          },
          tool: manifest.tool,
          launchArgs,
          networkPolicy: PUBLIC_SITE_NETWORK_POLICY,
          userAgent: config.userAgent,
          assessedAt: new Date(),
        });
        if (evidenceGraph !== undefined) {
          logger.info(
            {
              auditId: artifacts.auditId,
              verdict: evidenceGraph.quality.verdict,
              blocking: [
                ...new Set(
                  evidenceGraph.quality.issues
                    .filter((issue) => issue.severity === 'blocking')
                    .map((issue) => issue.code),
                ),
              ],
            },
            'full audit evidence assessed',
          );
        }
      } catch (error) {
        logger.error(
          { auditId: artifacts.auditId, err: error },
          'full audit evidence diagnostics could not be assembled; the audit remains usable with detailed diagnostics unavailable',
        );
      }
    }

    await holdClaim();
    const { prunedPageDirs } = await pruneScreenshots(
      artifacts.auditDir,
      prunePageInfoFromManifest(manifest),
    );

    // Plan 059 step 35: the run's coverage signature rides to the audit's
    // persisted record, so a later re-audit's delta can judge what each
    // run could observe. No graph, no signature: the delta then degrades
    // to unknown-legacy instead of inventing comparability.
    await persistAudit(connection, manifest, findings, evidenceGraph?.deltaCoverage);

    // Plan 002 (issue #132): no checkpoint deletion here. The checkpoint
    // must survive until the JOB reaches its terminal state, because a
    // crash in the analysis or report stages of the same job re-runs this
    // stage (persistAudit upserts by auditId, so that re-persist is
    // harmless), and the checkpoint is the only thing that keeps that
    // re-run from re-crawling the whole site. Deleting it at persist time
    // turned every post-audit crash into exactly the full second crawl the
    // resume feature exists to prevent. The job runner and the CLI audit
    // command delete it once their run is complete.

    // Issue #63: sync after the local write and the DB row both succeeded,
    // never before - a bucket failure must not block an already-valid
    // local deliverable. Runs after pruneScreenshots so a pruned page's
    // screenshot is never uploaded only to be orphaned in the bucket.
    // One store instance serves the whole-directory sync. Plan 068 removed
    // approval read-back/write work from the normal scan path.
    const artifactStore = createConfiguredArtifactStore();
    await syncAuditDirToBucket(artifactStore, artifacts.auditDir, hostname, startedAt);

    // Plan 068: the evidence graph and its diagnostic assessment remain durable,
    // but the normal scan path performs no approval read-back/write/delete work.
    // Report generation consumes scoped diagnostics directly; artifact sync above
    // already preserves the graph for that deterministic projection.

    // 2026-08-22, La Corniche report review: the audit doc must exist
    // before this (persistAudit upserts by auditId above). siren is a
    // plain fill-if-absent, per prefillAuditManualFields's own doc
    // comment: it never overwrites a manual field an operator already
    // entered, detected or not, and there is only one detector for it.
    // Issue #379: operator-confirmed prospect identity lands first, as
    // operator provenance, so the detected fills below can never replace or
    // downgrade it.
    if (options.prospectId !== undefined) {
      await syncProspectIdentityIntoAudit(connection, artifacts.auditId, options.prospectId);
    }
    await prefillAuditManualFields(connection, artifacts.auditId, {
      ...(artifacts.manifest.siteSignals?.siren !== undefined
        ? { siren: artifacts.manifest.siteSignals.siren }
        : {}),
    });

    // Plan 045 slice 1.5: nomCommercial/raisonSociale get the better of
    // two sources. siteSignals.siteName (writeAuditArtifacts's own
    // deriveSiteName, off the homepage's head metadata) and
    // registrySnapshot.denomination (Sirene, via obligation-stage.ts) are
    // the audit's own guesses and can be junk - a nav-link fragment, or
    // the site's web host's own registered name (plan 045's context: "Site
    // Officiel", "O2SWITCH"). A linked audit's catalogue name and its
    // qualification pass's own Sirene join are better evidence, gated to
    // hotels only so a non-hotel denomination is never printed as the
    // client's raison sociale. Unlike the siren fill-if-absent above,
    // this uses replaceDetectedManualFields: it may overwrite an already-
    // detected value with the better one (that is the whole point for an
    // existing stuck audit relinked by the plan 045 backfill), but never
    // an operator-confirmed one.
    const coverPrefill = resolveCoverPrefill(
      obligationAssessment,
      artifacts.manifest.siteSignals?.siteName,
    );
    // Detected tier only (issue #379 precedence): a non-operator prospect
    // identity value, then the audit's own site/registry guesses, then the
    // prospect's generic name. Operator values were written above and
    // replaceDetectedManualFields never touches them.
    const preferredNomCommercial =
      prospectIdentity?.suggested.nomCommercial ?? coverPrefill.nomCommercial ?? prospect?.name;
    const preferredRaisonSociale =
      coverPrefill.raisonSociale ?? prospectIdentity?.suggested.raisonSociale;
    await replaceDetectedManualFields(connection, artifacts.auditId, {
      ...(preferredNomCommercial !== undefined ? { nomCommercial: preferredNomCommercial } : {}),
      ...(preferredRaisonSociale !== undefined ? { raisonSociale: preferredRaisonSociale } : {}),
    });

    // Issue #289: a scan launched from the prospect page seeds the
    // prospect record's still-missing identity fields from this audit:
    // the checksum-validated SIREN the mentions-legales check extracted,
    // plus any identity field the operator confirmed on a previous run of
    // this audit. Fill-if-absent only (see fillMissingProspectIdentity):
    // what the operator typed before the scan is never overwritten, and
    // the audit's own unconfirmed name guesses stay audit-local until a
    // human confirms them.
    if (options.prospectId !== undefined) {
      const manualFields = await getAuditManualFields(connection, artifacts.auditId);
      await fillMissingProspectIdentity(
        connection,
        options.prospectId,
        {
          siren: artifacts.manifest.siteSignals?.siren,
          ...confirmedIdentityFromManualFields(manualFields),
        },
        'scan',
      );
    }

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
