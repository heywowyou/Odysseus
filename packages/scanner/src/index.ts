export { renderDiff } from './render-diff.js';
export type { RenderDiffOptions } from './render-diff.js';
export { launchBrowser, ODYSSEUS_USER_AGENT, DEFAULT_TIMEOUT_MS } from './browser.js';
export type { LaunchedBrowser } from './browser.js';
export { extractTextFromHtml, computeMissingPercent } from './extract-text.js';
export { crawlSite } from './crawl.js';
export {
  checkFetchTarget,
  classifyIpAddress,
  type FetchTargetVerdict,
  type LookupAddresses,
  type ResolvedAddress,
} from './address-guard.js';
export {
  assertPinnedAddress,
  checkNetworkTarget,
  checkRedirectTarget,
  createTestOnlyLoopbackPolicy,
  resolveNetworkTargetPolicyForJob,
  PUBLIC_SITE_NETWORK_POLICY,
  PUBLIC_SITE_NETWORK_POLICY_ID,
  TEST_ONLY_LOOPBACK_NETWORK_POLICY_ID,
  type CheckNetworkTargetOptions,
  type NetworkSafetyDisposition,
  type NetworkSafetyRefusalReason,
  type NetworkTargetPolicy,
  type NetworkTargetVerdict,
} from './network-target-policy.js';
export {
  assertBrowserIsolation,
  assessBrowserIsolation,
  buildSanitizedBrowserEnv,
  describeCurrentBrowserEnvironment,
  isSecretEnvName,
  APPROVED_ISOLATION_PROFILES,
  type BrowserIsolationInput,
  type BrowserIsolationPreflightResult,
  type BrowserIsolationProfile,
  type IsolationFinding,
  type IsolationFindingCode,
} from './browser-isolation-preflight.js';
export {
  HostRequestScheduler,
  type HostRequestSchedulerOptions,
} from './host-request-scheduler.js';
export * from './inventory-ledger.js';
export * from './check-attempt-ledger.js';
export * from './performance-measurement-set.js';
export * from './audit-environment-fingerprint.js';
export * from './evidence-surfaces.js';
export * from './evidence-ledger.js';
export {
  buildRobotsPolicySnapshot,
  describeRobotsPolicyTransition,
  effectiveCrawlDelayMs,
  epochSitemapUrls,
  isPathAllowedForEpoch,
  shouldRevalidateRobots,
  ROBOTS_POLICY_SNAPSHOT_VERSION,
  type RobotsPolicyChain,
  type RobotsPolicySnapshot,
  type RobotsPolicySnapshotInput,
  type RobotsPolicyTransition,
  type RobotsRevalidationDecision,
  type RobotsRevalidationOptions,
} from './robots-policy-snapshot.js';
export type {
  CrawlOptions,
  CrawlProgressEvent,
  CrawlResult,
  CrawledPage,
  CrawledPageStatus,
  CrawlFrontierOptions,
  CrawlFrontierSnapshot,
  CrawlFrontierState,
} from './crawl.js';
export { restoreCrawlFrontierLoopState } from './crawl.js';
export type { CrawlFrontierLoopState } from './crawl.js';
export type { ContinuationGuardSnapshot } from './continuation-guard.js';
export { OriginLock } from './origin-lock.js';
export { runAxe, WCAG22AA_TAGS } from './axe.js';
export type { AxeResults } from './axe.js';
export { runLighthouse } from './lighthouse.js';
export type { LighthouseOptions } from './lighthouse.js';
export { scanPage } from './scan-page.js';
export type { PageScanResult, ScanPageOptions } from './scan-page.js';
export { scanSite } from './scan-site.js';
export type {
  SiteScanResult,
  ScanSiteOptions,
  ScanProgressEvent,
  CrawlCheckpointResumeDecision,
} from './scan-site.js';
export type { PageWorkGuard } from './page-work-guard.js';
export { findMentionsLegalesUrl, extractMentionsLegales } from './checks/mentions-legales.js';
export type { MentionsLegalesExtraction } from './checks/mentions-legales.js';
export {
  findAccessibilityStatementUrl,
  checkAccessibilityStatement,
} from './checks/accessibility-statement.js';
export type { AccessibilityStatementCheckResult } from './checks/accessibility-statement.js';
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
export { BOOKING_INTENT_TEXT_PATTERN } from './checks/transactional-flow.js';
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
  buildArtifactBucketKey,
  buildAuditArtifactBucketPrefix,
  parseAuditTimestampDir,
} from './artifacts/paths.js';
export { toAuditRelativeRefs } from './artifacts/relativize.js';
// Plan 035: the crawl checkpoint files (crawl-checkpoint.json, and the
// crawl-state.json name consumed by a later slice) and their resume verdict.
export {
  CRAWL_CHECKPOINT_FILENAME,
  CRAWL_STATE_FILENAME,
  buildScanToolIdentity,
  deleteCrawlCheckpoint,
  deleteCrawlStateFile,
  isReusableCheckpoint,
  jsonDeepEqual,
  readCrawlCheckpoint,
  writeCrawlCheckpoint,
} from './artifacts/crawl-checkpoint-io.js';
export type {
  CheckpointRejectionReason,
  CheckpointReuseVerdict,
  CrawlCheckpoint,
  ScanToolIdentity,
} from './artifacts/crawl-checkpoint-io.js';
export { collectToolVersions } from './artifacts/versions.js';
export type { CollectedToolVersions } from './artifacts/versions.js';
// Plan 035 step 4: the crawl-state.json frontier file a crashed full
// audit resumes its mid-crawl state from.
export {
  deleteCrawlFrontierState,
  isReusableFrontierState,
  readCrawlFrontierState,
  writeCrawlFrontierState,
} from './artifacts/crawl-frontier-io.js';
export type { CrawlFrontierReuseVerdict } from './artifacts/crawl-frontier-io.js';
export { buildManifest, readOdysseusBuildId } from './artifacts/manifest.js';
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
export { writeManifestFile } from './artifacts/write-manifest.js';
