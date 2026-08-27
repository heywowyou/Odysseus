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
export { addSuppressionEntry, isSuppressed } from './suppression.js';
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
} from './hotel-source-records.js';
export type {
  NewHotelSourceRecordInput,
  InsertHotelSourceRecordsResult,
  HotelSourceYield,
} from './hotel-source-records.js';
