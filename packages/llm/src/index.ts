export { LLM_SEVERITY_FLOOR, MAX_RETRIES, MISTRAL_MODEL, MISTRAL_TEMPERATURE, MAX_OUTPUT_TOKENS } from './constants.js';
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
  logContainmentWarnings,
  applyStructureRankingRules,
} from './structure-ranking.js';

export { analyzeStructure } from './analyze-structure.js';
export type { AnalyzeStructureResult } from './analyze-structure.js';
export { analyzeWriting } from './analyze-writing.js';
export type { AnalyzeWritingResult } from './analyze-writing.js';

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
  WritingInput,
  WritingThemeInput,
  WritingPassOutput,
  WritingTheme,
  WritingSiteStats,
} from './writing-schema.js';

export { findUnreferencedStructureFindingIds, findInventedStructureFindingIds } from './structure-guards.js';
export { findThemeKeyMismatches, isThemeKeyMismatchEmpty } from './theme-key-guard.js';
export type { ThemeKeyMismatch } from './theme-key-guard.js';
export { findLanguageComplianceViolations } from './language-guard.js';
export type { LanguageComplianceViolation } from './language-guard.js';

export { ensureEnvLoaded, getMistralApiKey } from './config.js';
