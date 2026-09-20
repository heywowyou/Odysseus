export {
  LLM_SEVERITY_FLOOR,
  MAX_RETRIES,
  OPENAI_MODEL,
  OPENAI_TEMPERATURE,
  WRITING_OPENAI_TEMPERATURE,
  MAX_OUTPUT_TOKENS,
  WRITING_CRITIC_ENABLED,
  WRITING_CRITIC_MAX_OUTPUT_TOKENS,
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
export { sanitizeWritingOutput } from './sanitize-writing-output.js';
export type { SanitizedWritingOutput } from './sanitize-writing-output.js';
export { runWritingCritic } from './analyze-critic.js';
export {
  critiqueAndRepairWriting,
  runCriticAndRepair,
  type CritiquedWritingResult,
  type WritingCriticOutcomeStatus,
  type WritingCriticReplacement,
  type WritingCriticRecord,
  type WritingCriticSidecar,
} from './writing-critic.js';
export type { WritingCriticOutcome } from './analyze-critic.js';
export {
  CRITIC_DROP_REASONS,
  validateCriticIssues,
  type CriticDropCounts,
  type CriticDropReason,
} from './critic-issues.js';
export {
  WRITING_CRITIC_CATEGORIES,
  type WritingCriticCategory,
  type WritingCriticInput,
  type WritingCriticIssue,
} from './critic-schema.js';
export { listWritingProseFields, type WritingProseField } from './prose-fields.js';
/** Plan 072: the operator's post-generation corrections to a report's prose,
 *  bound to one analysis by digest and held to the same sanitation and
 *  guard table as the model's own output. */
export {
  applyWritingOverrides,
  findOverrideLineageMismatch,
  parseWritingOverrideFile,
  writingOverrideFileSchema,
} from './writing-overrides.js';
export type {
  AppliedWritingOverrides,
  WritingOverride,
  WritingOverrideFile,
  WritingOverrideLineage,
  WritingOverrideResult,
} from './writing-overrides.js';
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
export { emptyWritingPerformanceEvidence } from './writing-schema.js';
export type {
  TransactionalFlowStatus,
  WritingInput,
  WritingSiteContext,
  WritingThemeInput,
  WritingPassOutput,
  WritingTheme,
  WritingSiteStats,
  TrustedRemediationInput,
  WritingPerformanceEvidence,
  WritingPerformanceMetric,
  WritingPerformanceObservation,
  WritingSummaryEvidence,
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

export { callReportQualityRole, reportQualitySystemPromptDigest } from './report-quality-client.js';
export {
  REPORT_MODEL_PROFILES,
  ReportModelProfileMissingError,
  getReportModelProfile,
  getReportModelProfileDigest,
  getReportModelProfileMatrixDigest,
} from './report-model-profiles.js';
export type { ReportModelProfile } from './report-model-profiles.js';
export {
  REPORT_PROFILE_BENCHMARK_MANIFEST,
  ReportProfileBenchmarkNotCurrentError,
  assertProductionProfileBenchmarksCurrent,
  findStaleReportProfileBenchmarks,
} from './report-profile-benchmarks.js';
export type { ReportProfileBenchmarkApproval } from './report-profile-benchmarks.js';
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
