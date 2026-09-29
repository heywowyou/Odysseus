export { connectToMongo, disconnectFromMongo } from './connection.js';
export { createAuditModel } from './schemas/audit.schema.js';
export type {
  AuditDocument,
  AuditDocumentFields,
  BlockedPagesAcknowledgment,
} from './schemas/audit.schema.js';
export { persistAudit } from './persist-audit.js';
export { findDirectoryEntryForAudit } from './audit-directory-entry.js';
export type { AnalysisDocument, AnalysisDocumentFields } from './schemas/analysis.schema.js';
export { persistAnalysis } from './persist-analysis.js';
export { upsertSireneCache, getCachedSireneProfile } from './persist-sirene-cache.js';
export { createReportModel } from './schemas/report.schema.js';
export type { ReportDocument, ReportDocumentFields } from './schemas/report.schema.js';
export { persistReport } from './persist-report.js';
export { resolveReportVariant } from './report-variants.js';
export { getLatestReportApproval, persistReportApproval } from './report-approvals.js';
export { findDeltaBaseline, findAuditEvidenceCoverage } from './findings-delta-baseline.js';
export { createJobModel } from './schemas/job.schema.js';
export type {
  JobDocument,
  JobOptionsSnapshot,
  JobPhase,
  JobStatus,
  JobType,
  OutreachBatchResult,
  UrlResult,
} from './schemas/job.schema.js';
export {
  ActiveJobSlotTakenError,
  cancelJob,
  cancelQueuedJobs,
  claimNextQueuedJob,
  completeJob,
  createJob,
  deleteJob,
  ensureJobRunIdentity,
  failJob,
  getJob,
  isJobClaimCurrent,
  listJobs,
  markJobNeedsInput,
  requestJobCancellation,
  resetOrphanedRunningJobs,
  settleCancelRequestedJobsOnStartup,
  settleCancelRequestedJob,
  updateJobProgress,
} from './jobs.js';
export type { JobProgressPatch, NewJobInput } from './jobs.js';
export { backfillQueueOrder, readScanQueue, reorderScanQueue } from './job-queue-order.js';
export { reconcileFailedAuditJobs } from './reconcile-jobs.js';
export {
  deleteAuditCascade,
  deleteFinishedScanJobsForAudit,
  listArchivedProspectsWithAudits,
} from './delete-audit.js';
export {
  getStoredPrimarySeverityRollups,
  loadSeverityPopulationInputs,
  storePrimarySeverityRollup,
} from './severity-rollup.js';
export type { SeverityRollup } from './severity-rollup.js';
export {
  getAudit,
  getLatestFullAuditEstimateSource,
  attachAuditToProspect,
  getAuditRuntimeFields,
  getFindingsForAudit,
  getAuditManualFields,
  setAuditManualFields,
  prefillAuditManualFields,
  replaceDetectedManualFields,
  syncProspectIdentityIntoAudit,
  saveLinkedAuditIdentity,
  getAuditGradeOverride,
  setAuditGradeOverride,
  clearAuditGradeOverride,
  getAuditBlockedPagesAcknowledgment,
  setAuditBlockedPagesAcknowledgment,
  clearAuditBlockedPagesAcknowledgment,
  listAuditStorageIdentities,
} from './audits.js';
export { ArchivedProspectAttachmentError } from './audits.js';
export type { AuditRuntimeFields } from './audits.js';

// Plan 019: report preparation and exact-ID writing selection. All writes
// go through these service functions; handlers never issue raw updates.
export {
  approveWritingCandidate,
  attachEnglishAnalysisToSelection,
  getAnalysisById,
  getReportPreparation,
  patchReportPreparationInputs,
  recordFailedWritingCandidate,
  recordReadyWritingCandidate,
  resolveSelectedAnalysisPairForAudit,
  WritingSelectionConflictError,
} from './report-preparations.js';
export type { SelectedAuditAnalysisPairResolution } from './report-preparations.js';
export {
  getLatestFinalizedReport,
  getLatestGeneratedReport,
  getLatestReport,
  listReportLanguages,
  reportOrigin,
} from './reports.js';
export type {
  DirectoryFilter,
  NewProspectHubInput,
  ProspectHubFilter,
  ProspectPatch,
  WithdrawnProspectOutreach,
} from './prospect-hub.js';
export {
  addDirectoryEntriesToProspects,
  applyAutomaticProspectStatus,
  advanceProspectStatus,
  appendProspectEvent,
  archiveProspect,
  countActiveProspectDeletionJobs,
  listProspectScopeJobIds,
  listProspectScopeJobRuns,
  countProspectDeletionImpact,
  createProspectHub,
  createRandomIndependentProspectFromDirectory,
  deleteProspectPermanently,
  fillMissingProspectIdentity,
  getProspectHub,
  getProspectNames,
  findProspectsByDomain,
  findProspectsByEmail,
  listDirectory,
  countActiveAndAuditedProspects,
  listProspectTodo,
  listProspectEvents,
  listProspectAudits,
  listProspects,
  recordProspectOutcome,
  restoreProspect,
  setProspectStatus,
  upsertDirectoryEntries,
  isEditableProspectField,
  updateProspect,
  withdrawProspectOutreach,
} from './prospect-hub.js';
export type { ProspectCascadeCounts } from './prospect-hub.js';
export {
  auditIdentityFromProspect,
  confirmedIdentityFromManualFields,
} from './prospect-identity.js';
export type { AuditIdentityValues } from './prospect-identity.js';
export { canonicalJobTypeForScanIntent, displayJobIntent } from './scan-intents.js';
export { createDirectoryEntryModel } from './schemas/directory-entry.schema.js';
export { createProspectHubModel } from './schemas/prospect-hub.schema.js';
export { checkOutreachAction, checkScanLaunch, registrableDomainForScan } from './guards.js';
export type { OutreachActionRefusal } from './guards.js';
export {
  auditDataVersionState,
  effectiveAuditScanIntent,
  isOutreachQualifyingAudit,
} from './prospect-audit-qualification.js';
export type { AuditIntentSourceJob } from './prospect-audit-qualification.js';
export { addSuppressionEntry, isSuppressed } from './suppression.js';
export type { BenchmarkCandidateDocument } from './schemas/benchmark-candidate.schema.js';
export {
  seedBenchmarkCandidates,
  listBenchmarkCandidates,
  listPendingBenchmarkCandidates,
  listFetchFailedBenchmarkCandidates,
  recordBenchmarkCandidateOutcome,
  getBenchmarkQualificationSummary,
} from './benchmark-candidates.js';
export {
  recordOutreachPreview,
  revokeOutreachPreview,
  listOutreachPreviews,
  listLivePreviewsForDomain,
} from './outreach-previews.js';
export { findOutreachPreviewByTokenHash } from './outreach-previews.js';

export {
  openOutreachThread,
  findOutreachThreadById,
  findOutreachThreadByProspect,
  attachProviderThreadId,
  transitionOutreachThread,
  markOutreachThreadDrafted,
  recordOutreachThreadTouchSent,
  markOutreachThreadSynced,
  closeOutreachThreadsForDomain,
  getLatestOutreachSyncAt,
  listThreadsDueForFollowUp,
  completeOutreachSequence,
  listThreadsToSync,
} from './outreach-threads.js';

export type { OutreachDraftDocument } from './schemas/outreach-draft.schema.js';
export {
  recordOutreachDraft,
  recordFailedOutreachDraft,
  recordOutreachTouchSent,
  confirmOutreachSentByOperator,
  findLiveOutreachDraft,
  listOutreachDraftsExpiringBefore,
  holdOutreachDraftForDeletion,
  acknowledgeUnverifiedProviderDrafts,
  recordUnrecordedProviderDraft,
  markOutreachDraftDeleted,
  markOutreachDraftDeletionPending,
  listOutreachDrafts,
} from './outreach-drafts.js';

export {
  attachReferenceAuditDraft,
  createReferenceAuditLink,
  deleteReferenceAuditLink,
  recordReferenceAuditRequest,
} from './reference-audit-links.js';

export { loadProspectWork, selectNewestQualifyingAudit } from './prospect-work.js';
export { PROSPECT_TODO_KINDS } from './prospect-work.js';
export {
  findAuditsWithUnreadyReports,
  loadOutreachReportReadiness,
} from './outreach-report-readiness.js';
export type { ProspectTodoRow, ProspectWorkAudit } from './prospect-work.js';
export {
  removeProspectEmail,
  removeProspectWebsite,
  setOutreachProspectEmail,
  setPrimaryProspectWebsite,
} from './prospect-contacts.js';

export type {
  ReportQualityRunDocument,
  ReportBundleDocument,
  ActiveReportBundleDocument,
} from './schemas/report-quality.schema.js';
export {
  createReportQualityRunModel,
  createReportBundleModel,
} from './schemas/report-quality.schema.js';
export {
  acquireReportQualityLease,
  renewReportQualityLease,
  releaseReportQualityLease,
  getLatestReportQualityRun,
  startReportQualityRun,
  transitionReportQualityRun,
  recordQualityApprovedBundle,
  getLatestReportBundle,
  getReportBundleByDigest,
  approveExactReportBundle,
  markReportQualityRunFromOperator,
  getActiveReportBundle,
  atomicallyActivateReportBundle,
} from './report-quality.js';
export type { ReportQualityLease } from './report-quality.js';

export { verifyUniqueIndexes } from './unique-index-check.js';
export { migrateOutreachDraftThreadTouchIndex } from './outreach-draft-index-migration.js';
export { dropObsoleteFindingIndexes } from './finding-index-migration.js';

// Plan 077: retention snapshot, targeted deletes and the run record.
export {
  deleteAnalysesById,
  deleteReportBundlesById,
  deleteReportsById,
  getAuditSlimmedAt,
  getLatestRetentionRun,
  listRetentionJobRefs,
  loadRetentionSnapshot,
  markAuditSlimmed,
  persistRetentionRun,
} from './retention.js';
export type {
  RetentionAnalysisRow,
  RetentionAuditRow,
  RetentionBundleRow,
  RetentionQualityRunRow,
  RetentionReportRow,
  RetentionStoreSnapshot,
} from './retention.js';
export type {
  RetentionRunCounts,
  RetentionRunDocument,
  RetentionRunFailure,
} from './schemas/retention-run.schema.js';
export {
  aggregateOutreachFunnel,
  listOutreachFunnelSnapshots,
  recordOutreachFunnelSnapshot,
} from './outreach-funnel.js';
export { listProspectExpiryRows, type ProspectExpiryRow } from './prospect-expiry.js';
