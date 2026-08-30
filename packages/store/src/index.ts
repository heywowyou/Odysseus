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
  claimNextQueuedJob,
  completeJob,
  createJob,
  failJob,
  getJob,
  listJobs,
  resetOrphanedRunningJobs,
  updateJobProgress,
} from './jobs.js';
export type { CompleteJobPatch, JobProgressPatch, NewJobInput } from './jobs.js';
export { getSeverityRollup, getSeverityRollups } from './severity-rollup.js';
export type { SeverityRollup } from './severity-rollup.js';
export {
  getAudit,
  getFindingsForAudit,
  getAuditManualFields,
  setAuditManualFields,
  prefillAuditManualFields,
} from './audits.js';
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

// Milestone 9c plan 011: outreach threads and draft attempts.
export { createOutreachThreadModel } from './schemas/outreach-thread.schema.js';
export type {
  OutreachThreadDocument,
  OutreachThreadStatus,
  OutreachLanguageSource,
} from './schemas/outreach-thread.schema.js';
export {
  openOutreachThread,
  findOutreachThreadById,
  findOutreachThreadByCandidate,
  attachProviderThreadId,
  advanceThreadTouch,
  closeOutreachThreadsForDomain,
  listOutreachThreads,
  OUTREACH_THREAD_RETENTION_DAYS,
} from './outreach-threads.js';
export type {
  OpenOutreachThreadInput,
  OpenedOutreachThread,
  CloseOutreachThreadsResult,
  ListOutreachThreadsOptions,
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
export type { ContactableCohortMember } from './hotel-contacts.js';
