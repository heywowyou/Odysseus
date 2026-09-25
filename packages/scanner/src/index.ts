export { renderDiff } from './render-diff.js';
export { launchBrowser } from './browser.js';
export { crawlSite } from './crawl.js';
export {
  checkFetchTarget,
  classifyIpAddress,
  type FetchTargetVerdict,
  type LookupAddresses,
  type ResolvedAddress,
} from './address-guard.js';
export {
  PUBLIC_SITE_NETWORK_POLICY,
  PUBLIC_SITE_NETWORK_POLICY_ID,
} from './network-target-policy.js';
export { type HostPushbackEvent, type HostPacingRecoveredEvent } from './host-request-scheduler.js';
export * from './bounded-body.js';
export * from './inventory-ledger.js';
export * from './check-attempt-ledger.js';
export * from './performance-measurement-set.js';
export * from './audit-environment-fingerprint.js';
export * from './evidence-surfaces.js';
export * from './evidence-ledger.js';
export * from './evidence-snapshots.js';
export type { CrawlResult } from './crawl.js';
export { OriginLock, serverLockKeys } from './origin-lock.js';
export type { PageScanResult } from './scan-page.js';
export { scanSite } from './scan-site.js';
export type { ScanProgressEvent } from './scan-site.js';
export type { PageWorkGuard } from './page-work-guard.js';
export { findMentionsLegalesUrl, extractMentionsLegales } from './checks/mentions-legales.js';
export { isAllowedByRobots, fetchRobotsRules } from './robots.js';
export {
  findWorkspaceRoot,
  ensureEnvLoaded,
  getArtifactsRoot,
  getMaxPages,
  getMaxCrawlDepth,
  getCrawlDelayMs,
  getPageTimeoutMs,
  UNLIMITED_MAX_PAGES,
  getRenderSettleTimeoutMs,
  getLighthouseTimeoutMs,
  getScanConcurrency,
  getCrawlerUserAgent,
} from './config.js';
export {
  buildAuditTimestampDir,
  buildAuditDir,
  buildArtifactBucketKey,
  buildAuditArtifactBucketPrefix,
  parseAuditTimestampDir,
} from './artifacts/paths.js';
// Plan 035: the crawl checkpoint files (crawl-checkpoint.json, and the
// crawl-state.json name consumed by a later slice) and their resume verdict.
export {
  CRAWL_CHECKPOINT_FILENAME,
  CRAWL_STATE_FILENAME,
  deleteCrawlCheckpoint,
  deleteCrawlStateFile,
} from './artifacts/crawl-checkpoint-io.js';
export {
  StaleAcquisitionLeaseError,
  assertAcquisitionLease,
  writeAcquisitionLease,
} from './artifacts/acquisition-lease-io.js';
export { readOdysseusBuildId } from './artifacts/manifest.js';
export {
  APPROVED_AUDIT_EVIDENCE_PATH,
  AUDIT_EVIDENCE_SNAPSHOT_PATH,
  EVIDENCE_QUALITY_ASSESSMENT_PATH,
  hasAssessedEvidenceGraph,
  readApprovedAuditEvidence,
  readAuditEvidenceSnapshot,
  readEvidenceQualityAssessment,
} from './artifacts/evidence-graph-io.js';
export { runEvidenceGraphStage } from './artifacts/evidence-graph-stage.js';
export { confirmedFindingsDigest, type AuditEvidenceGraph } from './evidence-graph.js';
export { selectPageDirsToKeep, pruneScreenshots } from './artifacts/prune-screenshots.js';
export type { PrunePageInfo } from './artifacts/prune-screenshots.js';
export { writeAuditArtifacts } from './artifacts/write-audit.js';
export { compactScanJson } from './artifacts/page-scan-io.js';
export { writeFindingsFile } from './artifacts/write-findings.js';
export { writeManifestFile } from './artifacts/write-manifest.js';
export { writeJsonAtomicSync, type AtomicJsonFileOps } from './artifacts/write-json-atomic-sync.js';
