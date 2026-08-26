export { renderDiff } from './render-diff.js';
export type { RenderDiffOptions } from './render-diff.js';
export { launchBrowser, ODYSSEUS_USER_AGENT, DEFAULT_TIMEOUT_MS } from './browser.js';
export type { LaunchedBrowser } from './browser.js';
export { extractTextFromHtml, computeMissingPercent } from './extract-text.js';
export { crawlSite } from './crawl.js';
export type {
  CrawlOptions,
  CrawlProgressEvent,
  CrawlResult,
  CrawledPage,
  CrawledPageStatus,
} from './crawl.js';
export { OriginLock } from './origin-lock.js';
export { runAxe, WCAG22AA_TAGS } from './axe.js';
export type { AxeResults } from './axe.js';
export { runLighthouse } from './lighthouse.js';
export type { LighthouseOptions } from './lighthouse.js';
export { scanPage } from './scan-page.js';
export type { PageScanResult, ScanPageOptions } from './scan-page.js';
export { scanSite } from './scan-site.js';
export type { SiteScanResult, ScanSiteOptions, ScanProgressEvent } from './scan-site.js';
export { findMentionsLegalesUrl, extractMentionsLegales } from './checks/mentions-legales.js';
export type { MentionsLegalesExtraction } from './checks/mentions-legales.js';
export { checkLlmsTxt } from './checks/llms-txt.js';
export type { LlmsTxtCheckResult } from './checks/llms-txt.js';
export { checkCanonicalTarget, extractRobotsMetaContent } from './checks/canonical-target.js';
export type { CanonicalTargetCheckResult } from './checks/canonical-target.js';
export {
  findBlockingPattern,
  isAllowedByRobots,
  fetchRobotsRules,
  fetchRobotsText,
  parseRobotsTxt,
  checkAiCrawlerAccess,
  AI_CRAWLER_USER_AGENTS,
} from './robots.js';
export type { RobotsRules, AiCrawlerAccessResult } from './robots.js';
export { checkSecurityHeaders } from './checks/security-headers.js';
export type { SecurityHeadersCheckResult } from './checks/security-headers.js';
export { checkStructuredData } from './checks/structured-data.js';
export type {
  StructuredDataCheckResult,
  StructuredDataFailedTest,
} from './checks/structured-data.js';
export { fetchCruxFieldData, CRUX_POOR_THRESHOLDS } from './crux.js';
export {
  findWorkspaceRoot,
  ensureEnvLoaded,
  getArtifactsRoot,
  getMaxPages,
  getMaxCrawlDepth,
  getCrawlDelayMs,
  getPageTimeoutMs,
  UNLIMITED_MAX_PAGES,
  getRenderSettleTimeoutMs,
  getLighthouseTimeoutMs,
  getScanConcurrency,
  getCrawlerUserAgent,
  getCruxApiKey,
  DEFAULT_ARTIFACTS_DIR_NAME,
  DEFAULT_MAX_PAGES,
  DEFAULT_MAX_CRAWL_DEPTH,
  DEFAULT_CRAWL_DELAY_MS,
  DEFAULT_PAGE_TIMEOUT_MS,
  DEFAULT_LIGHTHOUSE_TIMEOUT_MS,
  DEFAULT_SCAN_CONCURRENCY,
} from './config.js';
export {
  buildAuditTimestampDir,
  slugify,
  hashUrl,
  buildPageDir,
  buildAuditDir,
} from './artifacts/paths.js';
export { toAuditRelativeRefs } from './artifacts/relativize.js';
export { collectToolVersions } from './artifacts/versions.js';
export type { CollectedToolVersions } from './artifacts/versions.js';
export { buildManifest } from './artifacts/manifest.js';
export type { BuildManifestInput } from './artifacts/manifest.js';
export {
  SCREENSHOT_PRUNE_KEEP_TOP_N,
  selectPageDirsToKeep,
  pruneScreenshots,
} from './artifacts/prune-screenshots.js';
export type { PrunePageInfo } from './artifacts/prune-screenshots.js';
export { writeAuditArtifacts } from './artifacts/write-audit.js';
export type {
  WriteAuditArtifactsInput,
  WriteAuditArtifactsResult,
} from './artifacts/write-audit.js';
export { writeFindingsFile } from './artifacts/write-findings.js';
