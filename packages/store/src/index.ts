export { getMongoUri, connectToMongo, disconnectFromMongo } from './connection.js';
export { createAuditModel } from './schemas/audit.schema.js';
export type { AuditDocument, AuditDocumentFields } from './schemas/audit.schema.js';
export { createFindingModel } from './schemas/finding.schema.js';
export type { FindingDocument } from './schemas/finding.schema.js';
export { persistAudit } from './persist-audit.js';
export { createAnalysisModel } from './schemas/analysis.schema.js';
export type { AnalysisDocument, AnalysisDocumentFields } from './schemas/analysis.schema.js';
export { persistAnalysis } from './persist-analysis.js';
export { createSireneCacheModel } from './schemas/sirene-cache.schema.js';
export type {
  SireneCacheDocument,
  SireneCacheDocumentFields,
} from './schemas/sirene-cache.schema.js';
export { upsertSireneCache, getCachedSireneProfile } from './persist-sirene-cache.js';
export { createReportModel } from './schemas/report.schema.js';
export type { ReportDocument, ReportDocumentFields } from './schemas/report.schema.js';
export { persistReport } from './persist-report.js';
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
