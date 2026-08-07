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
export type { SireneCacheDocument, SireneCacheDocumentFields } from './schemas/sirene-cache.schema.js';
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
  JobProgressScan,
  JobStatus,
  JobType,
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
export { getAudit, getFindingsForAudit } from './audits.js';
export { getLatestReport, listReportLanguages } from './reports.js';
