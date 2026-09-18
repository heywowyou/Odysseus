/**
 * Public entry point for @odysseus/interface.
 */

export { runAuditStage } from './pipeline/audit-stage.js';
export type { RunAuditStageOptions, AuditStageResult } from './pipeline/audit-stage.js';
export { runAnalysisStage } from './pipeline/analysis-stage.js';
export type { RunAnalysisStageOptions, AnalysisStageResult } from './pipeline/analysis-stage.js';
export { runReportStage, runAllReportsStage } from './pipeline/report-stage.js';
export { backfillAuditRow } from './pipeline/backfill-audit-row.js';
export { renormalizeAudit } from './pipeline/renormalize-audit.js';
export type { RenormalizeAuditResult } from './pipeline/renormalize-audit.js';
export {
  regenerateReportsForAudit,
  readAuditArtifacts,
  AuditArtifactsUnavailableError,
  NoAnalysisPairError,
} from './pipeline/regenerate-reports.js';
export type {
  BackfillAuditRowOptions,
  BackfillAuditRowResult,
} from './pipeline/backfill-audit-row.js';
export type { ReportStageResult, AllReportsStageResult } from './pipeline/report-stage.js';
export {
  loadCorpusManifest,
  runReportQualityCorpus,
  dryRunReportQualityCorpus,
} from './pipeline/report-quality-benchmark.js';
export type {
  ReportQualityCorpusManifest,
  ReportQualityCorpusEntry,
  ReportQualityCorpusOutcome,
  ReportQualityCorpusEntryState,
  ReportQualityCorpusSummary,
  ReportQualityCorpusProgress,
  ReportQualityCorpusDryRunPlan,
  ReportQualityCorpusDryRunEntry,
  RunReportQualityCorpusOptions,
} from './pipeline/report-quality-benchmark.js';
export type { ArtifactStore } from './artifacts/artifact-store.js';
export { createScalewayArtifactStore } from './artifacts/scaleway-artifact-store.js';
export type { ScalewayArtifactStoreOptions } from './artifacts/scaleway-artifact-store.js';
export { createConfiguredArtifactStore } from './artifacts/configured-artifact-store.js';
export { LocalDirArtifactStore } from './artifacts/local-dir-artifact-store.js';
export {
  AuditArtifactDeletionError,
  deleteAuditArtifacts,
} from './artifacts/delete-audit-artifacts.js';
export {
  DEFAULT_ORPHAN_MIN_AGE_MS,
  findRemoteArtifactOrphans,
  type RemoteArtifactOrphanReport,
} from './artifacts/remote-artifact-orphans.js';
export {
  purgeProspectAuditStorage,
  type ProspectAuditPurge,
} from './artifacts/purge-prospect-audit-storage.js';
export { resolveArtifactFile } from './artifacts/resolve-artifact.js';
export {
  syncAuditDirToBucket,
  syncArtifactFilesToBucket,
} from './artifacts/sync-audit-artifacts.js';
export {
  DEFAULT_INTERFACE_PORT,
  DEFAULT_INTERFACE_HOST,
  DEFAULT_QUEUE_CONCURRENCY,
  PROSPECTING_MAX_PAGES,
  PROSPECTING_MAX_DEPTH,
  DEFAULT_PROSPECT_BATCH_SIZE,
  DEFAULT_PROSPECT_FETCH_TIMEOUT_MS,
  PROSPECT_CHECKPOINT_WRITE_INTERVAL,
  getInterfacePort,
  getInterfaceHost,
  getQueueConcurrency,
  getPublicDir,
  getAfnicFichierAPath,
  getSireneStockPath,
  getSireneStockIndexCachePath,
  getBenchmarkSireneStockIndexCachePath,
  getProspectBatchSize,
  getAtoutFranceExportPath,
  // The preview's public base URL only. The bucket name, endpoint and
  // credentials stay private to createConfiguredPreviewPublisher: a caller that
  // could read them would be a caller that could build its own adapter.
  getPreviewPublicBaseUrl,
  // Whether a mailbox is configured, and which variables are missing if not.
  // The client secret and refresh token stay private to
  // createConfiguredMailboxDraftAdapter, on the same reasoning as the bucket
  // credentials above. The sender address is not a credential - it is the
  // visible From line on every draft - and plan 012's mailbox reconciliation
  // needs it to tell our own confirmed sends from inbound replies, so it is
  // exported alongside the canonical touch spacing it also needs.
  // MAILBOX_ENV_VARS is the matching list of names only, never values.
  MAILBOX_ENV_VARS,
  isMailboxConfigured,
  missingMailboxEnvVars,
  getMailboxSenderAddress,
  getOutreachTouch2AfterDays,
  getOutreachTouch3AfterDays,
  getOutreachReplyWindowDays,
} from './config.js';
export { computeCrawlEtaMs, computeStageEtaMs, createDurationEstimator } from './queue/eta.js';
export type { CrawlEtaInput, StageEtaInput, DurationEstimator } from './queue/eta.js';
export { JobQueue } from './queue/job-queue.js';
export type { JobQueueOptions, PipelineContext, PipelineFn } from './queue/job-queue.js';
export { runFullAuditJob } from './queue/pipeline/run-full-audit-job.js';
export {
  sweepReportIntegrity,
  classifyReportRows,
  nodeReportIntegrityFs,
} from './pipeline/report-integrity.js';
export type {
  ReportIntegrityEntry,
  ReportIntegrityStatus,
  ReportIntegrityInputRow,
  ReportIntegrityFs,
} from './pipeline/report-integrity.js';
export { runProspectingJob } from './queue/pipeline/run-prospecting-job.js';
export { registerProspectHubRoutes } from './routes/prospect-hub.js';
export { Router } from './router.js';
export type { RouteContext, RouteHandler } from './router.js';
export { startInterfaceServer } from './server.js';
export type { InterfaceServerHandle, InterfaceAuthOptions } from './server.js';
export { refusesUnprotectedNonLoopbackBind } from './server.js';
export { registerHealthRoutes, LIVE_PATH, READY_PATH } from './routes/health.js';
export type { HealthDependencies } from './routes/health.js';
// Plan 016: password session auth for the operator dashboard. The password
// hash getter is exported so the deploy runbook can check configuration, and
// the store, limiter and guard seams so tests can inject fakes without
// process.env races or a real listen.
export { DASHBOARD_PASSWORD_HASH_ENV_VAR, getDashboardPasswordHash } from './config.js';
export {
  parseDashboardPasswordHash,
  verifyDashboardPassword,
  SCRYPT_KEY_LENGTH_BYTES,
} from './auth/password.js';
export type { ParsedDashboardPasswordHash } from './auth/password.js';
export {
  createInMemorySessionStore,
  readSessionCookieToken,
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
} from './auth/session-store.js';
export type { SessionStore } from './auth/session-store.js';
export {
  createLoginRateLimiter,
  lockoutSecondsForFailures,
  MAX_LOCKOUT_SECONDS,
} from './auth/rate-limit.js';
export type { LoginRateLimiter, LoginRateLimitDecision } from './auth/rate-limit.js';
export {
  registerSessionRoutes,
  clientIpFor,
  LOGIN_PATH,
  LOGOUT_PATH,
} from './auth/session-routes.js';
export type { SessionRouteOptions } from './auth/session-routes.js';
export { createAuthGuard } from './auth/auth-guard.js';
export type { AuthGuard } from './auth/auth-guard.js';
export { createAtoutFranceSource } from './prospecting/hotel-sources/atout-france-reader.js';
export type { HotelCatalogueSource } from './prospecting/hotel-sources/hotel-catalogue-source.js';
export { importDirectory } from './prospecting/hotel-sources/import-directory.js';
export type { DirectoryImportReport } from './prospecting/hotel-sources/import-directory.js';

export { toLanes } from './prospecting/to-lanes.js';
export { fetchMentionsLegalesData } from './prospecting/mentions-legales-fetch.js';
export type { CandidateFetchResult } from './prospecting/mentions-legales-fetch.js';
export { getOrBuildSireneStockIndex } from './prospecting/sirene-stock-index.js';
export type { SireneStockIndexHandle } from './prospecting/sirene-stock-index.js';

// Milestone 9c plan 009: publishing outreach previews to a private bucket and
// withdrawing them again. The port has two adapters - see
// outreach/preview-publisher.ts on why that is what makes the seam real.
export {
  createPreviewToken,
  hashPreviewToken,
  isValidPreviewToken,
  deriveObjectKey,
  PREVIEW_TOKEN_PATTERN,
  PREVIEW_OBJECT_PREFIX,
} from './outreach/preview-token.js';
export {
  PREVIEW_CONTENT_TYPE,
  PREVIEW_EXPIRY_METADATA_HEADER,
} from './outreach/preview-publisher.js';
export type {
  PreviewObject,
  PreviewPublisher,
  PutPreviewObjectInput,
} from './outreach/preview-publisher.js';
export { createInMemoryPreviewPublisher } from './outreach/in-memory-preview-publisher.js';
export type { InMemoryPreviewPublisher } from './outreach/in-memory-preview-publisher.js';
export { createScalewayPreviewPublisher } from './outreach/scaleway-preview-publisher.js';
export type { ScalewayPreviewPublisherOptions } from './outreach/scaleway-preview-publisher.js';
export { createConfiguredPreviewPublisher } from './outreach/configured-preview-publisher.js';

// Milestone 9c plan 011: the mailbox port, its adapters, and draft creation.
export {
  MAILBOX_DRAFT_ADAPTER_METHODS,
  FORBIDDEN_MAILBOX_CAPABILITIES,
} from './outreach/mailbox-draft-adapter.js';
export type {
  MailboxDraftAdapter,
  CreateMailboxDraftInput,
  MailboxDraft,
  MailboxThreadMetadata,
  MailboxMessageMetadata,
} from './outreach/mailbox-draft-adapter.js';
export { createInMemoryMailboxDraftAdapter } from './outreach/in-memory-mailbox-draft-adapter.js';
export type {
  InMemoryMailboxDraftAdapter,
  InMemoryMailboxDraftAdapterOptions,
  RecordedDraft,
} from './outreach/in-memory-mailbox-draft-adapter.js';
export {
  createGmailDraftAdapter,
  GMAIL_ENDPOINTS,
  GMAIL_REQUIRED_SCOPES,
} from './outreach/gmail-draft-adapter.js';
export type { GmailDraftAdapterOptions } from './outreach/gmail-draft-adapter.js';
export { createConfiguredMailboxDraftAdapter } from './outreach/configured-mailbox-draft-adapter.js';
export { buildDraftMime, encodeDraftMimeForTransport } from './outreach/draft-mime.js';
export type { BuildDraftMimeInput } from './outreach/draft-mime.js';
// Milestone 9c plan 012: reconciling replies, sends and bounces from mailbox
// metadata only.
export { reconcileMailbox } from './outreach/reconcile-mailbox.js';
export type {
  ReconcileMailboxOptions,
  ReconcileMailboxResult,
  ReconcileMailboxThreadResult,
  MailboxReconciliationStorePort,
  ThreadToSync,
} from './outreach/reconcile-mailbox.js';
export { createMongoMailboxReconciliationStore } from './outreach/mongo-mailbox-reconciliation-store.js';

// Plan 047: the one prospect-native runtime used by dashboard routes and jobs.
export {
  createFirstEmailForProspect,
  createTouchOneDraft,
  createFollowUpForProspect,
} from './outreach/draft-runtime.js';
export type {
  CreateTouchOneDraftOptions,
  CreateTouchOneDraftResult,
  CreateFollowUpForProspectOptions,
  CreateFollowUpForProspectResult,
  CreateFirstEmailRefusal,
  CreateFirstEmailResult,
  DraftRuntimeRefusal,
} from './outreach/draft-runtime.js';
