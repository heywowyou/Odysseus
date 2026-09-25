export {
  filterFindingsForLlm,
  buildStructureInput,
  buildWritingInput,
  buildFallbackSiteContext,
  computeSiteStats,
} from './build-input.js';
export type { SiteContextInput } from './build-input.js';

export { buildLegalRelevance, getCriterionName } from './legal-relevance.js';

export {
  buildMissingPercentIndex,
  isWrapperPage,
  isLegalPage,
  classifyDiversion,
  partitionFindings,
} from './diversion.js';
export type { DivertedFinding } from './diversion.js';

export { analyzeStructure } from './analyze-structure.js';
export { analyzeWriting, WritingPassExhaustedError } from './analyze-writing.js';
export { runWritingCritic } from './analyze-critic.js';
export {
  critiqueAndRepairWriting,
  runCriticAndRepair,
  type WritingCriticRecord,
  type WritingCriticSidecar,
} from './writing-critic.js';
export { listWritingProseFields } from './prose-fields.js';
/** Plan 072: the operator's post-generation corrections to a report's prose,
 *  bound to one analysis by digest and held to the same sanitation and
 *  guard table as the model's own output. */
export {
  applyWritingOverrides,
  findOverrideLineageMismatch,
  parseWritingOverrideFile,
  writingOverrideFileSchema,
} from './writing-overrides.js';
export type { WritingOverrideFile } from './writing-overrides.js';
export { analyzeCorrectionReview } from './analyze-correction-review.js';

export { mergeAnalysisPasses } from './merge.js';

export { parseStructureDocument } from './structure-schema.js';
export type { StructureDocument } from './structure-schema.js';
export type {
  WritingInput,
  WritingSiteContext,
  WritingPassOutput,
  TrustedRemediationInput,
  WritingPerformanceEvidence,
  WritingPerformanceMetric,
  WritingPerformanceObservation,
} from './writing-schema.js';
export { deriveTransactionalFlowStatus } from './transactional-flow-guard.js';

export { findUnreferencedStructureFindingIds } from './structure-guards.js';

export { getOpenAiApiKey } from './config.js';

export type { LlmCallTelemetryEvent } from './telemetry/events.js';
export { configureLlmTelemetrySink, RecordingLlmTelemetrySink } from './telemetry/llm-telemetry.js';
export { configureLlmTelemetryFromEnv } from './telemetry/configure.js';

export { callReportQualityRole, reportQualitySystemPromptDigest } from './report-quality-client.js';
export {
  getReportModelProfile,
  getReportModelProfileDigest,
  getReportModelProfileMatrixDigest,
} from './report-model-profiles.js';
export {
  ReportProfileBenchmarkNotCurrentError,
  assertProductionProfileBenchmarksCurrent,
} from './report-profile-benchmarks.js';
export {
  seniorPlanOutputSchema,
  qualityWriterOutputSchema,
  qualityReviewOutputSchema,
  issueAdjudicationOutputSchema,
  editorOutputSchema,
  finalArbiterOutputSchema,
  SENIOR_PLAN_JSON_SCHEMA,
  QUALITY_WRITER_JSON_SCHEMA,
  QUALITY_REVIEW_JSON_SCHEMA,
  ADJUDICATION_JSON_SCHEMA,
  EDITOR_JSON_SCHEMA,
  FINAL_ARBITER_JSON_SCHEMA,
} from './report-quality-schema.js';
export type {
  SeniorPlanOutput,
  QualityWriterOutput,
  QualityReviewOutput,
  EditorOutput,
} from './report-quality-schema.js';
