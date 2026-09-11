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
  JobProgressIngestion,
  JobProgressScan,
  JobRunIdentity,
  JobStatus,
  JobType,
  OutreachBatchResult,
  ProspectIngestionResult,
  ProspectIngestionResultStatus,
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
  getAuditRuntimeFields,
  getFindingsForAudit,
  getAuditManualFields,
  setAuditManualFields,
  prefillAuditManualFields,
} from './audits.js';
export type { AuditRuntimeFields } from './audits.js';

// Plan 019: report preparation and exact-ID writing selection. All writes
// go through these service functions; handlers never issue raw updates.
export {
  approveWritingCandidate,
  clearStaleWarningAcknowledgement,
  getAnalysisById,
  getReportPreparation,
  patchReportPreparationInputs,
  recordFailedWritingCandidate,
  recordReadyWritingCandidate,
  resolveSelectedAnalysisPairForAudit,
  setWarningAcknowledgement,
  WritingSelectionConflictError,
} from './report-preparations.js';
export type { SelectedAuditAnalysisPairResolution } from './report-preparations.js';
export { getLatestReport, listReportLanguages } from './reports.js';
export type {
  ProspectContactAddress,
  ProspectDataOrigin,
  ProspectDocument,
  ProspectDocumentFields,
  ProspectQualificationReason,
} from './schemas/prospect.schema.js';
export { createProspect, findProspectByDomainAndSourceVersion, getProspect } from './prospects.js';
export type { NewProspectInput } from './prospects.js';
export type {
  SuppressionDocument,
  SuppressionDocumentFields,
} from './schemas/suppression.schema.js';
export { addSuppressionEntry, isSuppressed, findSuppressedDomains } from './suppression.js';
export type { AddSuppressionEntryInput } from './suppression.js';
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
export type { ProspectIngestionCheckpointFields } from './schemas/prospect-ingestion-checkpoint.schema.js';
export { getCheckpoint, upsertCheckpoint } from './prospect-ingestion-checkpoint.js';
export type { CheckpointPatch } from './prospect-ingestion-checkpoint.js';
export type {
  HotelSourceRecordDocument,
  HotelSourceRecordDocumentFields,
} from './schemas/hotel-source-record.schema.js';
export {
  insertHotelSourceRecords,
  streamHotelSourceRecords,
  getLatestHotelIngestRunId,
} from './hotel-source-records.js';
export type {
  NewHotelSourceRecordInput,
  InsertHotelSourceRecordsResult,
  HotelSourceYield,
} from './hotel-source-records.js';
export type {
  HotelCandidateDocument,
  HotelCandidateDocumentFields,
} from './schemas/hotel-candidate.schema.js';
export {
  upsertHotelCandidates,
  listHotelCandidates,
  getHotelCandidate,
  getLatestHotelCandidateByOwnRegistrableDomain,
  getHotelCandidateYield,
  recordHotelCandidateReview,
} from './hotel-candidates.js';
export type {
  NewHotelCandidateInput,
  UpsertHotelCandidatesResult,
  HotelCandidateFilter,
  HotelCandidateYield,
  RecordHotelCandidateReviewInput,
  RecordHotelCandidateReviewResult,
} from './hotel-candidates.js';
export { listHotelCandidatesForQualification } from './hotel-candidates.js';
export type { ListHotelCandidatesForQualificationOptions } from './hotel-candidates.js';
export { applyRedirectReclassifications, getHotelCandidatesByIds } from './hotel-candidates.js';
export type { RedirectReclassification } from './hotel-candidates.js';
export { createHotelQualificationModel } from './schemas/hotel-qualification.schema.js';
export type {
  HotelQualificationDocument,
  HotelQualificationDocumentFields,
} from './schemas/hotel-qualification.schema.js';
export {
  recordHotelQualifications,
  getHotelQualification,
  getLatestHotelQualificationVersion,
  listHotelQualifications,
  listQualificationsByCandidate,
  countCandidatesByOwnDomain,
  getHotelQualificationYield,
} from './hotel-qualifications.js';
export type {
  RecordHotelQualificationInput,
  RecordHotelQualificationsResult,
  HotelQualificationFilter,
  HotelQualificationYield,
} from './hotel-qualifications.js';

// Milestone 9c plan 004: the prescan collection. Inserted, never upserted -
// see schemas/prescan.schema.ts for why a re-run is a new observation rather
// than a correction of the previous one.
export type { PrescanDocument, PrescanDocumentFields } from './schemas/prescan.schema.js';
export {
  recordPrescan,
  getPrescan,
  getLatestPrescan,
  listCandidatesToPrescan,
  getPrescanSummary,
  getPrescanVendorAggregate,
} from './prescans.js';
export type {
  ListCandidatesToPrescanOptions,
  PrescanRunSummary,
  RecordPrescanInput,
  RecordPrescanResult,
  PrescanVendorAggregate,
  PrescanVendorFingerprint,
} from './prescans.js';

// Milestone 9c plan 006: immutable outreach scores and the cohorts selected
// from them. Both collections are inserted, never updated - see
// schemas/score.schema.ts and schemas/score-cohort.schema.ts.
export type { HotelScoreDocument, HotelScoreDocumentFields } from './schemas/score.schema.js';
export type {
  HotelScoreCohortDocument,
  HotelScoreCohortDocumentFields,
  HotelScoreCohortMember,
} from './schemas/score-cohort.schema.js';
export {
  recordHotelScores,
  listLatestHotelScores,
  listCandidatesToScore,
  findScoredCandidateIds,
  getHotelScoreSummary,
  diffHotelScoreVersions,
  recordScoreCohort,
  getLatestScoreCohort,
} from './scores.js';
export type {
  RecordHotelScoreInput,
  RecordHotelScoresResult,
  ListCandidatesToScoreOptions,
  HotelScoreSummary,
  HotelScoreDiff,
  HotelScoreDiffRow,
  RecordScoreCohortResult,
} from './scores.js';

// Milestone 9c plan 007: the contact collection. Upserted on
// (contactVersion, candidateId) - see schemas/hotel-contact.schema.ts for why a
// re-run over a bounded cohort is a retry rather than a new observation.
export type {
  HotelContactDocument,
  HotelContactDocumentFields,
} from './schemas/hotel-contact.schema.js';
export {
  listCohortMembersToContact,
  recordHotelContacts,
  getHotelContact,
  getHotelContactSummary,
  listContactableCohortMembers,
  listHotelContacts,
} from './hotel-contacts.js';
export type {
  CohortMemberToContact,
  ListCohortMembersToContactOptions,
  RecordHotelContactInput,
  RecordHotelContactsResult,
  HotelContactSummary,
} from './hotel-contacts.js';

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
  findLatestLiveV2PreviewForCandidate,
} from './outreach-previews.js';
export { findOutreachPreviewByTokenHash } from './outreach-previews.js';
export type {
  RecordOutreachPreviewInput,
  RecordedOutreachPreview,
  RevokeOutreachPreviewResult,
  ListOutreachPreviewsOptions,
} from './outreach-previews.js';

// Milestone 9c plan 037: candidate-linked outreach full scans. The plan
// (start eligibility) and the exact audit resolution (which stored audit is
// the candidate's outreach evidence) both live here so the route and the
// queue runner cannot drift apart.
export { planOutreachFullScan, resolveOutreachAuditForCandidate } from './outreach-scans.js';
export { findActiveOutreachFullScanJob, findActiveScanJobForHost } from './outreach-scans.js';
export type {
  OutreachFullScanPlan,
  OutreachFullScanStartRefusal,
  OutreachFullScanVersionInputs,
  OutreachAuditRefusal,
  OutreachAuditResolution,
} from './outreach-scans.js';

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
  findOutreachThreadByCandidate,
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
export type { ContactableCohortMember } from './hotel-contacts.js';

// Milestone 9c plan 013: bounded operator view projections. Compositions of
// the helpers above for the operator interface: every shape is an explicitly
// picked projection that cannot carry message bodies, addresses, or hashes,
// and every list is paginated.
export {
  getOperatorProspect,
  getOutcomeSummary,
  getProspectContactView,
  getProspectEvidenceAssetSource,
  getProspectEvidenceView,
  getProspectOutcomeView,
  getProspectPrescanView,
  getProspectPreviewView,
  getProspectQualificationHistory,
  getProspectScoreDiffView,
  getProspectScoreView,
  getProspectSourceConflicts,
  getProspectThreadView,
  getVendorFingerprintAggregate,
  listOperatorProspects,
  listOutreachReviewDrafts,
  listRepliesNeedingReview,
} from './operator-views.js';
export type {
  GetProspectContactViewOptions,
  GetProspectEvidenceAssetSourceOptions,
  GetProspectEvidenceViewOptions,
  OperatorEvidenceAssetSlot,
  OperatorEvidenceAssetSource,
  GetProspectPrescanViewOptions,
  GetProspectScoreViewOptions,
  ListOperatorProspectsOptions,
  OperatorContactView,
  OperatorDraftView,
  OperatorEvidenceAssetView,
  OperatorEvidenceSummaryView,
  OperatorEvidenceView,
  OperatorOutcomeEventView,
  OperatorOutcomeSummary,
  OperatorPrescanPageView,
  OperatorPrescanView,
  OperatorPreviewView,
  OperatorProspectDetail,
  OperatorProspectQueue,
  OperatorProspectRow,
  OperatorQualificationEvent,
  OperatorReplyReviewRow,
  OperatorReviewDraftRow,
  OperatorScoreBreakdownView,
  OperatorScoreComponentView,
  OperatorScoreDiffView,
  OperatorScoreView,
  OperatorSourceConflictRow,
  OperatorSourceConflictsView,
  OperatorSourceRefRow,
  OperatorThreadView,
  OperatorViewPage,
  OperatorViewPageOptions,
  OperatorWebsiteCandidateView,
} from './operator-views.js';
