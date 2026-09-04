export { getMongoUri, connectToMongo, disconnectFromMongo } from './connection.js';
export { createAuditModel } from './schemas/audit.schema.js';
export type { AuditDocument, AuditDocumentFields } from './schemas/audit.schema.js';
export { createFindingModel } from './schemas/finding.schema.js';
export type { FindingDocument } from './schemas/finding.schema.js';
export { persistAudit } from './persist-audit.js';
export { createAnalysisModel } from './schemas/analysis.schema.js';
export type { AnalysisDocument, AnalysisDocumentFields } from './schemas/analysis.schema.js';
export { persistAnalysis } from './persist-analysis.js';
export { getLatestAnalysis } from './analyses.js';
export { createSireneCacheModel } from './schemas/sirene-cache.schema.js';
export type {
  SireneCacheDocument,
  SireneCacheDocumentFields,
} from './schemas/sirene-cache.schema.js';
export { upsertSireneCache, getCachedSireneProfile } from './persist-sirene-cache.js';
export { createReportModel } from './schemas/report.schema.js';
export type { ReportDocument, ReportDocumentFields } from './schemas/report.schema.js';
export { persistReport } from './persist-report.js';
export { createReportApprovalModel } from './schemas/report-approval.schema.js';
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
  JobOptionsSnapshot,
  JobPhase,
  JobProgress,
  JobProgressAnalysisStage,
  JobProgressContinuationGuard,
  JobProgressCrawl,
  JobProgressIngestion,
  JobProgressScan,
  JobStatus,
  JobType,
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
  failJob,
  getJob,
  listJobs,
  resetOrphanedRunningJobs,
  updateJobProgress,
} from './jobs.js';
export type { CompleteJobPatch, JobProgressPatch, NewJobInput } from './jobs.js';
export { reconcileFailedAuditJobs } from './reconcile-jobs.js';
export { deleteAuditCascade } from './delete-audit.js';
export type { AuditCascadeCounts } from './delete-audit.js';
export { getSeverityRollup, getSeverityRollups } from './severity-rollup.js';
export type { SeverityRollup } from './severity-rollup.js';
export {
  getAudit,
  getFindingsForAudit,
  getAuditManualFields,
  setAuditManualFields,
  prefillAuditManualFields,
} from './audits.js';

// Plan 019: report preparation and exact-ID writing selection. All writes
// go through these service functions; handlers never issue raw updates.
export {
  approveWritingCandidate,
  clearStaleWarningAcknowledgement,
  getAnalysisById,
  getReportPreparation,
  listAnalysesForAudit,
  patchReportPreparationInputs,
  recordFailedWritingCandidate,
  recordReadyWritingCandidate,
  resolveSelectedAnalysisPairForAudit,
  setWarningAcknowledgement,
  WritingSelectionConflictError,
} from './report-preparations.js';
export type { SelectedAuditAnalysisPairResolution } from './report-preparations.js';
export { getLatestReport, listReportLanguages } from './reports.js';
export { createProspectModel } from './schemas/prospect.schema.js';
export type {
  ProspectContactAddress,
  ProspectDataOrigin,
  ProspectDocument,
  ProspectDocumentFields,
  ProspectQualificationReason,
} from './schemas/prospect.schema.js';
export { createProspect, getProspect, listQualifiedProspects } from './prospects.js';
export type { NewProspectInput } from './prospects.js';
export { createSuppressionModel } from './schemas/suppression.schema.js';
export type {
  SuppressionDocument,
  SuppressionDocumentFields,
} from './schemas/suppression.schema.js';
export { addSuppressionEntry, isSuppressed, findSuppressedDomains } from './suppression.js';
export type { AddSuppressionEntryInput } from './suppression.js';
export { createProspectIngestionCheckpointModel } from './schemas/prospect-ingestion-checkpoint.schema.js';
export type { ProspectIngestionCheckpointFields } from './schemas/prospect-ingestion-checkpoint.schema.js';
export { getCheckpoint, upsertCheckpoint } from './prospect-ingestion-checkpoint.js';
export type { CheckpointPatch } from './prospect-ingestion-checkpoint.js';
export { createHotelSourceRecordModel } from './schemas/hotel-source-record.schema.js';
export type {
  HotelSourceRecordDocument,
  HotelSourceRecordDocumentFields,
} from './schemas/hotel-source-record.schema.js';
export {
  insertHotelSourceRecords,
  getHotelSourceYield,
  listHotelSourceRecords,
  streamHotelSourceRecords,
  getLatestHotelIngestRunId,
} from './hotel-source-records.js';
export type {
  NewHotelSourceRecordInput,
  InsertHotelSourceRecordsResult,
  HotelSourceYield,
} from './hotel-source-records.js';
export { createHotelCandidateModel } from './schemas/hotel-candidate.schema.js';
export type {
  HotelCandidateDocument,
  HotelCandidateDocumentFields,
} from './schemas/hotel-candidate.schema.js';
export {
  upsertHotelCandidates,
  listHotelCandidates,
  getHotelCandidate,
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
export { createPrescanModel } from './schemas/prescan.schema.js';
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
export { createHotelScoreModel } from './schemas/score.schema.js';
export type { HotelScoreDocument, HotelScoreDocumentFields } from './schemas/score.schema.js';
export { createHotelScoreCohortModel } from './schemas/score-cohort.schema.js';
export type {
  HotelScoreCohortDocument,
  HotelScoreCohortDocumentFields,
  HotelScoreCohortMember,
} from './schemas/score-cohort.schema.js';
export {
  recordHotelScores,
  getLatestHotelScore,
  listLatestHotelScores,
  listHotelScores,
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
  ListHotelScoresOptions,
  ListCandidatesToScoreOptions,
  HotelScoreSummary,
  HotelScoreDiff,
  HotelScoreDiffRow,
  RecordScoreCohortResult,
} from './scores.js';

// Milestone 9c plan 007: the contact collection. Upserted on
// (contactVersion, candidateId) - see schemas/hotel-contact.schema.ts for why a
// re-run over a bounded cohort is a retry rather than a new observation.
export { createHotelContactModel } from './schemas/hotel-contact.schema.js';
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
export { createOutreachPreviewModel } from './schemas/outreach-preview.schema.js';
export type {
  OutreachPreviewDocument,
  OutreachPreviewDocumentFields,
  OutreachPreviewStatus,
} from './schemas/outreach-preview.schema.js';
export {
  recordOutreachPreview,
  findOutreachPreviewByTokenHash,
  getOutreachPreview,
  revokeOutreachPreview,
  listOutreachPreviews,
  listLivePreviewsForDomain,
  PREVIEW_PUBLIC_LIFETIME_DAYS,
  PREVIEW_RETENTION_DAYS,
} from './outreach-previews.js';
export type {
  RecordOutreachPreviewInput,
  RecordedOutreachPreview,
  RevokeOutreachPreviewResult,
  ListOutreachPreviewsOptions,
} from './outreach-previews.js';

// Milestone 9c plans 011 and 012: outreach threads and draft attempts.
export {
  createOutreachThreadModel,
  OUTREACH_THREAD_STATES,
} from './schemas/outreach-thread.schema.js';
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
  setOutreachThreadOutcome,
  closeOutreachThreadsForDomain,
  listOutreachThreads,
  listThreadsDueForFollowUp,
  completeOutreachSequence,
  listThreadsToSync,
  OUTREACH_THREAD_RETENTION_DAYS,
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

export { createOutreachDraftModel } from './schemas/outreach-draft.schema.js';
export type {
  OutreachDraftDocument,
  OutreachDraftStatus,
} from './schemas/outreach-draft.schema.js';
export {
  recordOutreachDraft,
  recordFailedOutreachDraft,
  findLiveOutreachDraft,
  findOutreachDraftById,
  markOutreachDraftDeleted,
  listOutreachDrafts,
  DuplicateLiveDraftError,
  OUTREACH_DRAFT_RETENTION_DAYS,
} from './outreach-drafts.js';
export type {
  RecordOutreachDraftInput,
  RecordFailedOutreachDraftInput,
  MarkOutreachDraftDeletedResult,
  ListOutreachDraftsOptions,
} from './outreach-drafts.js';

export { createOutreachOutcomeModel } from './schemas/outreach-outcome.schema.js';
export type {
  OutreachOutcomeDocument,
  OutreachOutcomeDocumentFields,
} from './schemas/outreach-outcome.schema.js';
export {
  recordOutreachOutcome,
  listOutreachOutcomes,
  OUTREACH_OUTCOME_RETENTION_DAYS,
} from './outreach-outcomes.js';
export type {
  RecordOutreachOutcomeInput,
  RecordOutreachOutcomeResult,
  ListOutreachOutcomesOptions,
} from './outreach-outcomes.js';
export { getOutreachCampaignAggregate } from './outreach-campaign-aggregate.js';
export type {
  GetOutreachCampaignAggregateOptions,
  OutreachCampaignAggregate,
  OutreachCampaignAggregateRow,
} from './outreach-campaign-aggregate.js';
export type { ContactableCohortMember } from './hotel-contacts.js';

// Milestone 9c plan 013: bounded operator view projections. Compositions of
// the helpers above for the operator interface: every shape is an explicitly
// picked projection that cannot carry message bodies, addresses, or hashes,
// and every list is paginated.
export {
  getOperatorProspect,
  getOutcomeSummary,
  getProspectContactView,
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
  GetProspectEvidenceViewOptions,
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
