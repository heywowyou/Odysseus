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
export { createMongoHotelQualificationStore } from './prospecting/hotel-qualification/mongo-hotel-qualification-store.js';
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
export { checkHotelSite } from './prospecting/check-hotel-site.js';
export type { CheckHotelSiteOptions } from './prospecting/check-hotel-site.js';
export type { HotelSireneJoiner } from './prospecting/hotel-identity/hotel-sirene-join.js';
