export {
  LLM_SEVERITY_FLOOR,
  MAX_RETRIES,
  OPENAI_MODEL,
  OPENAI_TEMPERATURE,
  WRITING_OPENAI_TEMPERATURE,
  MAX_OUTPUT_TOKENS,
  REVIEWER_MAX_OUTPUT_TOKENS,
} from './constants.js';
export {
  filterFindingsForLlm,
  buildStructureInput,
  buildWritingInput,
  buildFallbackSiteContext,
  computeSiteStats,
} from './build-input.js';
export type { SiteContextInput } from './build-input.js';

export { buildLegalRelevance, getCriterionName } from './legal-relevance.js';
export { computeDominantPerformanceMetric } from './dominant-metric.js';

export {
  WRAPPER_PAGE_MISSING_PERCENT_THRESHOLD,
  buildMissingPercentIndex,
  isWrapperPage,
  isLegalPage,
  classifyDiversion,
  partitionFindings,
} from './diversion.js';
export type { DiversionReason, DivertedFinding, PartitionedFindings } from './diversion.js';

export {
  SITE_WIDE_FINDING_PAGE_PERCENT_THRESHOLD,
  enforceSiteWideAccessibilityFloor,
  applyOccurrenceWeighting,
  enforceQuickWinFloor,
  logContainmentWarnings,
  applyStructureRankingRules,
} from './structure-ranking.js';

export { analyzeStructure } from './analyze-structure.js';
export type { AnalyzeStructureResult } from './analyze-structure.js';
export {
  analyzeWriting,
  WritingPassExhaustedError,
  type WritingAttemptRejection,
} from './analyze-writing.js';
export type { AnalyzeWritingResult } from './analyze-writing.js';
export { analyzeReview, summarizeUnsupportedReviews } from './analyze-review.js';
export type { ReviewOutcome } from './analyze-review.js';
export type { ReviewerInput, ReviewerPassOutput } from './reviewer-schema.js';
export { analyzeCorrectionReview } from './analyze-correction-review.js';
export type { CorrectionReviewOutcome } from './analyze-correction-review.js';
export {
  correctionCheckSchema,
  correctionFieldSchema,
  correctionProposalSchema,
  correctionReviewOutputSchema,
  describeCorrectionFieldMismatch,
  eligibleCorrectionFields,
} from './correction-review-schema.js';
export type {
  CorrectionCheck,
  CorrectionProposal,
  CorrectionReviewInput,
  CorrectionReviewOutput,
} from './correction-review-schema.js';
export { CORRECTION_REVIEW_PROMPT_VERSION } from './correction-review-prompt.js';

export { mergeAnalysisPasses } from './merge.js';

export { parseStructureDocument, assignThemeKeys } from './structure-schema.js';
export type {
  StructureDocument,
  StructureThemeWithKey,
  StructureInput,
  StructureTheme,
  StructurePassOutput,
} from './structure-schema.js';
export type {
  TransactionalFlowStatus,
  WritingInput,
  WritingSiteContext,
  WritingThemeInput,
  WritingPassOutput,
  WritingTheme,
  WritingSiteStats,
} from './writing-schema.js';
export {
  deriveTransactionalFlowStatus,
  findTransactionalFlowViolations,
} from './transactional-flow-guard.js';
export type { TransactionalFlowViolation } from './transactional-flow-guard.js';

export {
  findUnreferencedStructureFindingIds,
  findInventedStructureFindingIds,
} from './structure-guards.js';
export { findThemeKeyMismatches, isThemeKeyMismatchEmpty } from './theme-key-guard.js';
export type { ThemeKeyMismatch } from './theme-key-guard.js';
export { findLanguageComplianceViolations } from './language-guard.js';
export type { LanguageComplianceViolation } from './language-guard.js';

export { ensureEnvLoaded, getOpenAiApiKey, getOpenAiBaseUrl } from './config.js';
export { pauseBetweenLanguagePasses } from './rate-limit-pacing.js';

export type { LlmPass, LlmCallTelemetryEvent } from './telemetry/events.js';
export {
  captureLlmCallTelemetry,
  configureLlmTelemetrySink,
  getLlmTelemetrySink,
  NullLlmTelemetrySink,
  RecordingLlmTelemetrySink,
} from './telemetry/llm-telemetry.js';
export type { LlmTelemetrySink } from './telemetry/llm-telemetry.js';
export { LangfuseLlmTelemetrySink } from './telemetry/langfuse-sink.js';
export type { LangfuseTelemetryConfig } from './telemetry/langfuse-sink.js';
export { configureLlmTelemetryFromEnv } from './telemetry/configure.js';

export { callReportQualityRole } from './report-quality-client.js';
export {
  REPORT_MODEL_PROFILES,
  getReportModelProfile,
  getReportModelProfileDigest,
  getReportModelProfileMatrixDigest,
} from './report-model-profiles.js';
export type { ReportModelProfile } from './report-model-profiles.js';
export type { QualityRoleResult } from './report-quality-client.js';
export {
  evidenceBoundContentSchema,
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
  IssueAdjudicationOutput,
  EditorOutput,
  FinalArbiterOutput,
} from './report-quality-schema.js';
