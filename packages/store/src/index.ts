export { getMongoUri, connectToMongo, disconnectFromMongo } from './connection.js';
export { createAuditModel } from './schemas/audit.schema.js';
export type { AuditDocument, AuditDocumentFields } from './schemas/audit.schema.js';
export type { FindingDocument } from './schemas/finding.schema.js';
export { persistAudit } from './persist-audit.js';
export type { AnalysisDocument, AnalysisDocumentFields } from './schemas/analysis.schema.js';
export { persistAnalysis } from './persist-analysis.js';
export type {
  SireneCacheDocument,
  SireneCacheDocumentFields,
} from './schemas/sirene-cache.schema.js';
export { upsertSireneCache, getCachedSireneProfile } from './persist-sirene-cache.js';
export { createReportModel } from './schemas/report.schema.js';
export type { ReportDocument, ReportDocumentFields } from './schemas/report.schema.js';
export { persistReport } from './persist-report.js';
export type {
  ApprovedReportRef,
  ReportApprovalDocument,
  ReportApprovalDocumentFields,
} from './schemas/report-approval.schema.js';
export {
  approvalMatchesReportPair,
  getLatestReportApproval,
  persistReportApproval,
} from './report-approvals.js';
export { createJobModel } from './schemas/job.schema.js';
export type {
  JobDocument,
  JobDocumentFields,
  JobNeedsInputField,
  JobOptionsSnapshot,
  JobPhase,
  JobProgress,
  JobProgressAnalysisStage,
  JobProgressContinuationGuard,
  JobProgressCrawl,
  JobProgressScan,
  JobRunIdentity,
  JobStatus,
  JobType,
  OutreachBatchResult,
  UrlResult,
  UrlResultStatus,
} from './schemas/job.schema.js';
export {
  cancelJob,
  cancelQueuedJobs,
  claimNextQueuedJob,
  completeJob,
  createJob,
  deleteJob,
  ensureJobRunIdentity,
  failJob,
  getJob,
  listJobs,
  markJobNeedsInput,
  resetOrphanedRunningJobs,
  updateJobProgress,
} from './jobs.js';
export type { CompleteJobPatch, JobProgressPatch, JobSummaryFields, NewJobInput } from './jobs.js';
export { reconcileFailedAuditJobs } from './reconcile-jobs.js';
export { deleteAuditCascade } from './delete-audit.js';
export type { AuditCascadeCounts } from './delete-audit.js';
export { getSeverityRollup, getSeverityRollups } from './severity-rollup.js';
export type { SeverityRollup } from './severity-rollup.js';
export {
  getAudit,
  attachAuditToProspect,
  getAuditRuntimeFields,
  getFindingsForAudit,
  getAuditManualFields,
  setAuditManualFields,
  prefillAuditManualFields,
  replaceDetectedManualFields,
  getAuditGradeOverride,
  setAuditGradeOverride,
  clearAuditGradeOverride,
} from './audits.js';
export type { AuditRuntimeFields } from './audits.js';

// Plan 019: report preparation and exact-ID writing selection. All writes
// go through these service functions; handlers never issue raw updates.
export {
  approveWritingCandidate,
  getAnalysisById,
  getReportPreparation,
  patchReportPreparationInputs,
  recordFailedWritingCandidate,
  recordReadyWritingCandidate,
  resolveSelectedAnalysisPairForAudit,
  WritingSelectionConflictError,
} from './report-preparations.js';
export type { SelectedAuditAnalysisPairResolution } from './report-preparations.js';
export { getLatestReport, listReportLanguages } from './reports.js';
export type {
  DirectoryFilter,
  NewProspectHubInput,
  Page,
  ProspectListPage,
  ProspectListView,
  ProspectResultStatus,
  ProspectCascadeCounts,
  ProspectHubFilter,
} from './prospect-hub.js';
export {
  addDirectoryEntriesToProspects,
  applyAutomaticProspectStatus,
  advanceProspectStatus,
  appendProspectEvent,
  createProspectHub,
  deleteProspect,
  directoryEntryToProspectInput,
  getProspectHub,
  findProspectsByDomain,
  listDirectory,
  listProspectTodo,
  listProspectEvents,
  listProspectAudits,
  listProspects,
  PROSPECT_RESULT_STATUSES,
  recordProspectOutcome,
  setProspectStatus,
  AutomaticStatusTransitionError,
  upsertDirectoryEntries,
  updateProspect,
  updateProspectRecord,
} from './prospect-hub.js';
export {
  AUTOMATIC_PROGRESS_RANK,
  TERMINAL_PROSPECT_STATUSES,
  decideAutomaticStatus,
} from './prospect-status-policy.js';
export type { AutomaticStatusDecision } from './prospect-status-policy.js';
export {
  CANONICAL_SINGLE_SITE_JOB_TYPES,
  canonicalJobTypeForScanIntent,
  displayJobIntent,
} from './scan-intents.js';
export type { CanonicalSingleSiteJobType } from './scan-intents.js';
export {
  createProspectHub as createProspect,
  getProspectHub as getProspect,
} from './prospect-hub.js';
export type { NewProspectHubInput as NewProspectInput } from './prospect-hub.js';
export type { DirectoryEntryDocument } from './schemas/directory-entry.schema.js';
export { createDirectoryEntryModel } from './schemas/directory-entry.schema.js';
export type { ProspectEventDocument } from './schemas/prospect-event.schema.js';
export { createProspectEventModel } from './schemas/prospect-event.schema.js';
export type {
  ProspectHubDocument,
  ProspectHubDocumentFields,
} from './schemas/prospect-hub.schema.js';
export { createProspectHubModel } from './schemas/prospect-hub.schema.js';
export { checkOutreachAction, checkScanLaunch, registrableDomainForScan } from './guards.js';
export type {
  OutreachAction,
  OutreachActionCheck,
  OutreachActionRefusal,
  ScanLaunchCheck,
  ScanLaunchRefusal,
} from './guards.js';
export {
  OUTREACH_ELIGIBLE_SCAN_INTENTS,
  classifyLegacyAuditScanIntent,
  effectiveAuditScanIntent,
  hasCurrentFindingsProvenance,
  hasOutreachEligibleScanIntent,
  isOutreachQualifyingAudit,
} from './prospect-audit-qualification.js';
export type {
  AuditIntentSourceJob,
  AuditQualificationInput,
  ProspectAuditScanIntent,
} from './prospect-audit-qualification.js';
export type {
  SuppressionDocument,
  SuppressionDocumentFields,
} from './schemas/suppression.schema.js';
export {
  addSuppressionEntry,
  findSuppressedDomains,
  findSuppressionMatches,
  isSuppressed,
} from './suppression.js';
export type { AddSuppressionEntryInput, SuppressionMatches } from './suppression.js';
export type {
  BenchmarkCandidateDocument,
  BenchmarkCandidateDocumentFields,
  BenchmarkCandidateStatus,
  BenchmarkFetchFailureReason,
} from './schemas/benchmark-candidate.schema.js';
export {
  seedBenchmarkCandidates,
  listBenchmarkCandidates,
  listPendingBenchmarkCandidates,
  listFetchFailedBenchmarkCandidates,
  recordBenchmarkCandidateOutcome,
  getBenchmarkQualificationSummary,
} from './benchmark-candidates.js';
export type {
  BenchmarkCandidateSeed,
  BenchmarkCandidateOutcome,
  BenchmarkQualificationSummary,
} from './benchmark-candidates.js';
// Milestone 9c plan 009: published outreach previews. Inserted at publication
// and transitioned once at revocation - see schemas/outreach-preview.schema.ts
// for why the raw token has no field to live in.
export type {
  OutreachPreviewDocument,
  OutreachPreviewDocumentFields,
  OutreachPreviewStatus,
} from './schemas/outreach-preview.schema.js';
export {
  recordOutreachPreview,
  revokeOutreachPreview,
  listOutreachPreviews,
  listLivePreviewsForDomain,
} from './outreach-previews.js';
export { findOutreachPreviewByTokenHash } from './outreach-previews.js';
export type {
  RecordOutreachPreviewInput,
  RecordedOutreachPreview,
  RevokeOutreachPreviewResult,
  ListOutreachPreviewsOptions,
} from './outreach-previews.js';

// Issue #220: one prospect-scoped active-job projection and one conflict
// policy shared by every prospect-scoped job-creation route.
export {
  findActiveBrowserHeavyHostConflict,
  listActiveJobsForProspect,
  planProspectJobLaunch,
} from './active-jobs.js';
export type {
  ProspectActiveJob,
  ProspectActiveJobKind,
  ProspectJobLaunchDecision,
} from './active-jobs.js';

// Milestone 9c plans 011 and 012: outreach threads and draft attempts.
export { OUTREACH_THREAD_STATES } from './schemas/outreach-thread.schema.js';
export type {
  OutreachThreadDocument,
  OutreachLanguageSource,
  OutreachThreadTouchRecord,
  OutreachThreadReviewFlag,
  OutreachThreadSpacing,
} from './schemas/outreach-thread.schema.js';
export {
  openOutreachThread,
  findOutreachThreadById,
  findOutreachThreadByProspect,
  attachProviderThreadId,
  advanceThreadTouch,
  transitionOutreachThread,
  recordOutreachThreadTouchSent,
  markOutreachThreadSynced,
  closeOutreachThreadsForDomain,
  listOutreachThreads,
  listThreadsDueForFollowUp,
  completeOutreachSequence,
  listThreadsToSync,
} from './outreach-threads.js';
export type {
  OpenOutreachThreadInput,
  OpenedOutreachThread,
  TransitionOutreachThreadInput,
  TransitionOutreachThreadResult,
  CloseOutreachThreadsResult,
  ListOutreachThreadsOptions,
  ListThreadsDueForFollowUpOptions,
  CompleteOutreachSequenceInput,
  CompleteOutreachSequenceResult,
  ListThreadsToSyncOptions,
} from './outreach-threads.js';

export type {
  OutreachDraftDocument,
  OutreachDraftReviewOutcome,
  OutreachDraftStatus,
} from './schemas/outreach-draft.schema.js';
export {
  recordOutreachDraft,
  recordFailedOutreachDraft,
  recordOutreachDraftReview,
  findLiveOutreachDraft,
  findOutreachDraftById,
  markOutreachDraftDeleted,
  listOutreachDrafts,
} from './outreach-drafts.js';
export type {
  RecordOutreachDraftInput,
  RecordFailedOutreachDraftInput,
  MarkOutreachDraftDeletedResult,
  ListOutreachDraftsOptions,
} from './outreach-drafts.js';

export type {
  OutreachOutcomeDocument,
  OutreachOutcomeDocumentFields,
} from './schemas/outreach-outcome.schema.js';
export { recordOutreachOutcome, listOutreachOutcomes } from './outreach-outcomes.js';
export type {
  RecordOutreachOutcomeInput,
  RecordOutreachOutcomeResult,
  ListOutreachOutcomesOptions,
} from './outreach-outcomes.js';
export {
  deriveProspectWork,
  loadProspectWork,
  selectNewestQualifyingAudit,
} from './prospect-work.js';
export type {
  NewestQualifyingAuditResult,
  ProspectAuditQualificationState,
  ProspectTodoKind,
  ProspectTodoRow,
  ProspectWorkAction,
  ProspectWorkAudit,
  ProspectWorkDraft,
  ProspectWorkJob,
  ProspectWorkReason,
  ProspectWorkResult,
  ProspectWorkSources,
  ProspectWorkThread,
  ProspectWorkRecommendation,
} from './prospect-work.js';
