/**
 * Public entry point for @odysseus/interface.
 */

export { runAuditStage } from './pipeline/audit-stage.js';
export { runAnalysisStage } from './pipeline/analysis-stage.js';
export { runReportStage, runAllReportsStage } from './pipeline/report-stage.js';
export { backfillAuditRow } from './pipeline/backfill-audit-row.js';
export { renormalizeAudit } from './pipeline/renormalize-audit.js';
export {
  loadCorpusManifest,
  runReportQualityCorpus,
  dryRunReportQualityCorpus,
} from './pipeline/report-quality-benchmark.js';
export type { ReportQualityCorpusManifest } from './pipeline/report-quality-benchmark.js';
export { createConfiguredArtifactStore } from './artifacts/configured-artifact-store.js';
export { LocalDirArtifactStore } from './artifacts/local-dir-artifact-store.js';
export { deleteAuditArtifacts } from './artifacts/delete-audit-artifacts.js';
export {
  DEFAULT_ORPHAN_MIN_AGE_MS,
  findRemoteArtifactOrphans,
} from './artifacts/remote-artifact-orphans.js';
export { purgeProspectAuditStorage } from './artifacts/purge-prospect-audit-storage.js';
export {
  RETENTION_RUN_CAP,
  runRetention,
  type RetentionRunResult,
} from './retention/apply-retention.js';
export { RETENTION_GRACE_DAYS } from './retention/retention-policy.js';
export {
  PROSPECT_EXPIRY_DAYS,
  runProspectExpiry,
  type ProspectExpiryRunResult,
} from './retention/prospect-expiry.js';
export { createConfiguredMailboxDraftAdapter } from './outreach/configured-mailbox-draft-adapter.js';
export { createConfiguredPreviewPublisher } from './outreach/configured-preview-publisher.js';
export { isRetentionSweepEnabled } from './retention/retention-sweeper.js';
export { compactStoredScans } from './artifacts/compact-stored-scans.js';
export {
  DEFAULT_PROSPECT_FETCH_TIMEOUT_MS,
  getInterfacePort,
  getSireneStockPath,
  getBenchmarkSireneStockIndexCachePath,
  getAtoutFranceExportPath,
} from './config.js';
export { sweepReportIntegrity } from './pipeline/report-integrity.js';
export { startInterfaceServer } from './server.js';
export { createAtoutFranceSource } from './prospecting/hotel-sources/atout-france-reader.js';
export { importDirectory } from './prospecting/hotel-sources/import-directory.js';

export { toLanes } from './prospecting/to-lanes.js';
export { fetchMentionsLegalesData } from './prospecting/mentions-legales-fetch.js';
export { getOrBuildSireneStockIndex } from './prospecting/sirene-stock-index.js';

export {
  buildReferenceAuditCandidate,
  loadReferenceAuditSource,
  publishReferenceAuditCandidate,
} from './reference-audit/reference-audit-release.js';
export type { ReferenceAuditCandidateRelease } from './reference-audit/reference-audit-release.js';
export { createConfiguredReferenceAuditStore } from './reference-audit/configured-reference-audit-store.js';
