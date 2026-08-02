export { renderDiff } from './render-diff.js';
export type { RenderDiffOptions } from './render-diff.js';
export { launchBrowser, ODYSSEUS_USER_AGENT, DEFAULT_TIMEOUT_MS } from './browser.js';
export type { LaunchedBrowser } from './browser.js';
export { extractTextFromHtml, computeMissingPercent } from './extract-text.js';
export { crawlSite } from './crawl.js';
export type { CrawlOptions, CrawlResult, CrawledPage, CrawledPageStatus } from './crawl.js';
export { runAxe, WCAG22AA_TAGS } from './axe.js';
export type { AxeResults } from './axe.js';
export { runLighthouse } from './lighthouse.js';
export type { LighthouseOptions } from './lighthouse.js';
export { scanPage } from './scan-page.js';
export type { PageScanResult, ScanPageOptions } from './scan-page.js';
export { scanSite } from './scan-site.js';
export type { SiteScanResult, ScanSiteOptions } from './scan-site.js';
export {
  findWorkspaceRoot,
  getArtifactsRoot,
  getMaxPages,
  getMaxCrawlDepth,
  getCrawlDelayMs,
  getPageTimeoutMs,
  getLighthouseTimeoutMs,
  getCrawlerUserAgent,
  DEFAULT_ARTIFACTS_DIR_NAME,
  DEFAULT_MAX_PAGES,
  DEFAULT_MAX_CRAWL_DEPTH,
  DEFAULT_CRAWL_DELAY_MS,
  DEFAULT_PAGE_TIMEOUT_MS,
  DEFAULT_LIGHTHOUSE_TIMEOUT_MS,
} from './config.js';
