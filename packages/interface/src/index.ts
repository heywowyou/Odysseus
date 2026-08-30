/**
 * Public entry point for @odysseus/interface.
 */

export { runAuditStage } from './pipeline/audit-stage.js';
export type { RunAuditStageOptions, AuditStageResult } from './pipeline/audit-stage.js';
export { runAnalysisStage } from './pipeline/analysis-stage.js';
export type { RunAnalysisStageOptions, AnalysisStageResult } from './pipeline/analysis-stage.js';
export { runReportStage, runAllReportsStage } from './pipeline/report-stage.js';
export type { ReportStageResult, AllReportsStageResult } from './pipeline/report-stage.js';
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
export { computeCrawlEtaMs, computeScanEtaMs } from './queue/eta.js';
export type { CrawlEtaInput, ScanEtaInput } from './queue/eta.js';
export { JobQueue } from './queue/job-queue.js';
export type { JobQueueOptions, PipelineContext, PipelineFn } from './queue/job-queue.js';
export { runFullAuditJob } from './queue/pipeline/run-full-audit-job.js';
export { runProspectingJob } from './queue/pipeline/run-prospecting-job.js';
export { runProspectIngestionJob } from './queue/pipeline/run-prospect-ingestion-job.js';
export { registerProspectingRoutes } from './routes/prospecting.js';
export { Router } from './router.js';
export type { RouteContext, RouteHandler } from './router.js';
export { startInterfaceServer } from './server.js';
export type { InterfaceServerHandle } from './server.js';
export { createAtoutFranceSource } from './prospecting/hotel-sources/atout-france-reader.js';
export type { HotelCatalogueSource } from './prospecting/hotel-sources/hotel-catalogue-source.js';
export { ingestHotelCatalogue } from './prospecting/hotel-sources/ingest-hotel-catalogue.js';
export type {
  HotelIngestReport,
  IngestHotelCatalogueOptions,
} from './prospecting/hotel-sources/ingest-hotel-catalogue.js';
export {
  resolveHotels,
  CURRENT_RESOLUTION_VERSION,
} from './prospecting/hotel-identity/resolve-hotels.js';
export type {
  ResolveHotelsOptions,
  ResolveHotelsReport,
  HotelCandidateStorePort,
} from './prospecting/hotel-identity/resolve-hotels.js';
export { createMongoHotelCandidateStore } from './prospecting/hotel-identity/mongo-hotel-candidate-store.js';
export { createHotelSireneJoiner } from './prospecting/hotel-identity/hotel-sirene-join.js';
export {
  qualifyHotels,
  factsFor,
  CURRENT_QUALIFICATION_VERSION,
  QUALIFY_BATCH_SIZE,
} from './prospecting/hotel-qualification/qualify-hotels.js';
export type {
  HotelQualificationStorePort,
  HotelQualificationReport,
  HotelQualificationPlan,
  QualifyHotelsOptions,
  HotelSiteChecker,
} from './prospecting/hotel-qualification/qualify-hotels.js';
export {
  createMongoHotelQualificationStore,
  createMongoReconcileRedirectsStore,
  createMongoBackfillSireneStore,
} from './prospecting/hotel-qualification/mongo-hotel-qualification-store.js';
export {
  backfillSirene,
  BACKFILL_BATCH_SIZE,
} from './prospecting/hotel-qualification/backfill-sirene.js';
export type {
  BackfillSireneStorePort,
  BackfillSireneOptions,
  BackfillSireneReport,
} from './prospecting/hotel-qualification/backfill-sirene.js';
export {
  reconcileRedirects,
  RECONCILE_BATCH_SIZE,
} from './prospecting/hotel-qualification/reconcile-redirects.js';
export type {
  ReconcileRedirectsStorePort,
  ReconcileRedirectsOptions,
  ReconcileRedirectsReport,
  ReconcileRedirectsPlan,
} from './prospecting/hotel-qualification/reconcile-redirects.js';
export {
  prescanHotels,
  CURRENT_PRESCAN_VERSION,
  PRESCAN_BATCH_SIZE,
} from './prospecting/hotel-prescan/prescan-hotels.js';
export type {
  HotelPrescanStorePort,
  HotelPrescanReport,
  HotelPrescanPlan,
  HotelPrescanner,
  PrescanHotelsOptions,
} from './prospecting/hotel-prescan/prescan-hotels.js';
export {
  scoreHotels,
  scoreInputFor,
  CURRENT_SCORING_VERSION,
  SCORE_BATCH_SIZE,
} from './prospecting/hotel-scoring/score-hotels.js';
export type {
  HotelScoringStorePort,
  ScoreHotelsOptions,
  ScoreHotelsReport,
  ScoreHotelsPlan,
  HotelScoreSkipReason,
} from './prospecting/hotel-scoring/score-hotels.js';
export { selectCohort } from './prospecting/hotel-scoring/select-cohort.js';
export type {
  CohortSelectionStorePort,
  SelectCohortOptions,
  SelectCohortReport,
} from './prospecting/hotel-scoring/select-cohort.js';
export {
  createMongoHotelScoringStore,
  createMongoCohortSelectionStore,
} from './prospecting/hotel-scoring/mongo-hotel-score-store.js';
// Milestone 9c plan 007: contact discovery over the selected cohort.
export {
  discoverContacts,
  decideContact,
  CURRENT_CONTACT_VERSION,
} from './prospecting/hotel-contacts/discover-contacts.js';
export type {
  HotelContactStorePort,
  ContactPagesFetcher,
  DiscoverContactsOptions,
  DiscoverContactsReport,
} from './prospecting/hotel-contacts/discover-contacts.js';
export { fetchContactPages } from './prospecting/hotel-contacts/fetch-contact-pages.js';
export type {
  FetchContactPagesOptions,
  ContactPagesFetch,
  ContactFetchOutcome,
} from './prospecting/hotel-contacts/fetch-contact-pages.js';
export { verifyMailDomain } from './prospecting/hotel-contacts/verify-mail-domain.js';
export type { MailDomainVerifier } from './prospecting/hotel-contacts/verify-mail-domain.js';
export { createMongoHotelContactStore } from './prospecting/hotel-contacts/mongo-hotel-contact-store.js';
export type { MongoHotelContactStoreOptions } from './prospecting/hotel-contacts/mongo-hotel-contact-store.js';

export { checkHotelSite } from './prospecting/check-hotel-site.js';
export type { CheckHotelSiteOptions } from './prospecting/check-hotel-site.js';
export type { HotelSireneJoiner } from './prospecting/hotel-identity/hotel-sirene-join.js';

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
export {
  publishPreview,
  revokePreviewsForDomain,
  buildPreviewInput,
  previewLinks,
  previewUrl,
  CURRENT_PREVIEW_CONTENT_VERSION,
} from './outreach/publish-preview.js';
export type {
  OutreachPreviewStorePort,
  PublishPreviewOptions,
  PublishPreviewResult,
  PublishPreviewRefusal,
  PreviewPublicationRow,
  PreviewSireneFacts,
  LivePreviewRef,
  RecordPreviewInput,
  RevokePreviewsResult,
} from './outreach/publish-preview.js';
export { createMongoOutreachPreviewStore } from './outreach/mongo-outreach-preview-store.js';
export type { MongoOutreachPreviewStoreOptions } from './outreach/mongo-outreach-preview-store.js';

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
export {
  createOutreachDraft,
  CURRENT_OUTREACH_PROMPT_VERSION,
  FIRST_TOUCH,
} from './outreach/create-outreach-draft.js';
export type {
  CreateOutreachDraftOptions,
  CreateOutreachDraftResult,
  CreateOutreachDraftRefusal,
  OutreachDraftRow,
  OutreachDraftStorePort,
  OutreachPreviewPort,
  PublishedPreviewRef,
} from './outreach/create-outreach-draft.js';
export { createMongoOutreachDraftStore } from './outreach/mongo-outreach-draft-store.js';
export type { MongoOutreachDraftStoreOptions } from './outreach/mongo-outreach-draft-store.js';

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

// Milestone 9c plan 012 step 4: drafting due follow-ups (touches 2 and 3).
export {
  createFollowUpDraft,
  CURRENT_OUTREACH_PROMPT_VERSION as FOLLOW_UP_PROMPT_VERSION,
  SECOND_TOUCH,
  THIRD_TOUCH,
} from './outreach/create-follow-up-draft.js';
export type {
  CreateFollowUpDraftOptions,
  CreateFollowUpDraftResult,
  CreateFollowUpDraftRefusal,
  CreateFollowUpDraftStorePort,
  FollowUpDraftRow,
  RecordFollowUpDraftFacts,
  RecordFollowUpFailureFacts,
} from './outreach/create-follow-up-draft.js';
export { createMongoFollowUpDraftStore } from './outreach/mongo-follow-up-draft-store.js';
export type { MongoFollowUpDraftStoreOptions } from './outreach/mongo-follow-up-draft-store.js';
