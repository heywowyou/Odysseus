import type { Browser } from 'playwright';
import type { Result as LighthouseResult } from 'lighthouse';
import {
  auditedHostAliases,
  classifyDocumentWall,
  classifyHostResponse,
  isBlockedRender,
} from '@odysseus/core';
import { runLighthouseIsolated } from './lighthouse-isolated.js';
import { renderDiff, type RenderDiffOptions } from './render-diff.js';
import { getPageTimeoutMs } from './config.js';
import { recordRenderedResourceTotals } from './checks/rendered-cost-profile.js';
import { PageCheckRunner, toErrorMessage } from './page-check-runner.js';
import { RENDERED_PAGE_CHECKS, type RenderedCheckContext } from './rendered-page-checks.js';
import { extractStructuralAnchor } from './temporal-anchors.js';

export type {
  LighthouseAnalysisOptions,
  LighthouseAnalysisResult,
  PageScanResult,
  RenderedAnalysisOptions,
  RenderedAnalysisResult,
  ScanPageOptions,
} from './page-scan-types.js';
import type {
  CheckId,
  LighthouseAnalysisOptions,
  LighthouseAnalysisResult,
  PageScanResult,
  RenderedAnalysisOptions,
  RenderedAnalysisResult,
  ScanPageOptions,
} from './page-scan-types.js';

function lighthouseRuntimeError(result: LighthouseResult): string | undefined {
  const value = (result as LighthouseResult & { runtimeError?: unknown }).runtimeError;
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const error = value as { code?: unknown; message?: unknown };
    const code = typeof error.code === 'string' ? error.code : undefined;
    const message = typeof error.message === 'string' ? error.message : undefined;
    return [code, message].filter((part): part is string => part !== undefined).join(': ');
  }
  return String(value);
}

function isRetryableLighthouseError(message: string): boolean {
  return /NO_FCP|PROTOCOL_TIMEOUT/iu.test(message);
}

function robotsTxtPushbackStatus(result: LighthouseResult): number | undefined {
  const audit = result.audits?.['robots-txt'];
  if (audit === undefined) return undefined;
  const evidence = JSON.stringify({
    description: audit.description,
    displayValue: audit.displayValue,
    details: audit.details,
  });
  const match = /\b(429|5\d{2})\b/u.exec(evidence);
  return match === null ? undefined : Number(match[1]);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function checkBudgetMs(options: Pick<ScanPageOptions, 'checkTimeoutMs' | 'timeoutMs'>): number {
  if (options.checkTimeoutMs !== undefined) return Math.max(1, options.checkTimeoutMs);
  const pageTimeoutMs = options.timeoutMs ?? getPageTimeoutMs();
  // The full-audit page watchdog is intentionally much larger than a browser
  // navigation timeout. Keep each check materially below both values while
  // allowing ordinary DOM checks enough room on a slow but valid page.
  return Math.max(1_000, Math.min(Math.floor(pageTimeoutMs / 4), 60_000));
}

/**
 * Lighthouse times its own gather/audit phases via Node's process-global
 * perf_hooks Performance API (through the `marky`/`lighthouse-logger`
 * deps), not anything scoped to the browser or debugPort. Two `lighthouse()`
 * calls racing in the same process step on each other's marks and fail with
 * "performance mark has not been set" - confirmed by running scanSite's
 * concurrent lanes against the fixture, 100% reproducible. Concurrent
 * render-diff/axe work (plain Playwright, no shared Node-global state) is
 * unaffected, so only the Lighthouse call itself is serialized here, across
 * every lane in a scanSite() run.
 *
 * runLighthouseIsolated (lighthouse-isolated.ts) now runs each call in its
 * own forked child process rather than in this one, which incidentally
 * means the perf_hooks collision this queue exists for can no longer
 * happen either (each fork gets its own fresh globals) - but the queue
 * stays, now for two other reasons. Removing it would mean N Lighthouse
 * children (each holding a Chromium page load's worth of memory) running at
 * once instead of one. More importantly, Lighthouse is the only pass that
 * measures time: its throttling scales observed work up to model a slower
 * device, so siblings competing for the same cores bias every number the
 * same direction rather than scattering noise around a true value, and
 * those numbers are the Core Web Vitals a paying client is shown. Don't
 * remove this without a measured drift budget on those metrics; see the
 * trade-off log, entry 10.
 */
let lighthouseQueue: Promise<unknown> = Promise.resolve();

async function runLighthouseSerialized(
  url: string,
  debugPort: number,
  beforeRun?: () => Promise<void>,
): Promise<LighthouseResult> {
  const run = lighthouseQueue.then(async () => {
    await beforeRun?.();
    return runLighthouseIsolated(url, debugPort);
  });
  lighthouseQueue = run.catch(() => undefined);
  return run;
}

/**
 * Runs render diff, axe, and every other check that reuses that same
 * rendered navigation (plan 021 Step 5: extracted from the former
 * `scanPage`, same checks, same order, no Lighthouse). Reuses a single
 * rendered navigation for axe-core and every custom check (via renderDiff's
 * onRenderedPage hook) and the resource/DOM facts behind
 * `renderedCostProfile` (via onRenderedPageCreated, attached before
 * navigation so no response is missed), so only two page loads are made
 * under our own control (raw + rendered) - Lighthouse, when it runs at
 * all, performs its own separate navigation and lives in
 * `runLighthouseAnalysis` instead.
 */
export async function runRenderedAnalysis(
  browser: Browser,
  url: string,
  options: RenderedAnalysisOptions,
): Promise<RenderedAnalysisResult> {
  const result: Omit<RenderedAnalysisResult, 'checkOutcomes'> = { url };
  const perCheckBudgetMs = checkBudgetMs(options);
  const runner = new PageCheckRunner({
    perCheckBudgetMs,
    ...(options.signal !== undefined ? { signal: options.signal } : {}),
    ...(options.guard !== undefined ? { closeAll: () => options.guard!.closeAll() } : {}),
  });

  // Site-wide results, fetched once per site, attach to the homepage only.
  const isHomepage = url === options.homepageUrl;
  const attachSiteResult = <T>(id: CheckId, value: T | undefined, attach: (value: T) => void) => {
    if (value !== undefined && isHomepage) {
      attach(value);
      runner.record(id, 'completed');
    } else {
      runner.record(id, 'not-applicable');
    }
  };
  attachSiteResult('sitemap-check', options.sitemapCheck, (value) => {
    result.sitemapCheck = { ...value, pageUrl: url };
  });
  attachSiteResult('llms-txt-check', options.llmsTxtCheck, (value) => {
    result.llmsTxtCheck = value;
  });
  attachSiteResult('cookie-consent', options.cookieConsentCheck, (value) => {
    result.cookieConsent = value;
  });
  attachSiteResult('accessibility-statement', options.accessibilityStatementCheck, (value) => {
    result.accessibilityStatement = value;
  });
  attachSiteResult('security-headers', options.securityHeadersCheck, (value) => {
    result.securityHeaders = value;
  });

  const context: RenderedCheckContext = {
    browser,
    options,
    perCheckBudgetMs,
    rawXRobotsTag: undefined,
    readResourceTotals: undefined,
  };

  try {
    const renderOptions: RenderDiffOptions = {
      ...(options.navigationUrl !== undefined ? { navigationUrl: options.navigationUrl } : {}),
      screenshotDir: options.screenshotDir,
      isHomepage,
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.userAgent !== undefined ? { userAgent: options.userAgent } : {}),
      ...(options.scheduler !== undefined
        ? { beforeRenderedNavigation: () => options.scheduler!.pace() }
        : options.delayMs !== undefined
          ? { preRenderedDelayMs: options.delayMs }
          : {}),
      ...(options.scheduler !== undefined ? { scheduler: options.scheduler } : {}),
      ...(options.guard !== undefined ? { guard: options.guard } : {}),
      ...(options.networkPolicy !== undefined ? { networkPolicy: options.networkPolicy } : {}),
      ...(options.onNetworkSafetyBlocked !== undefined
        ? { onNetworkSafetyBlocked: options.onNetworkSafetyBlocked }
        : {}),
      onReadinessObserved: (observation) => {
        result.readiness = observation;
      },
      onRawDocument: (html) => {
        result.structuralAnchor = extractStructuralAnchor(html, url, new Date());
      },
      onRawRobotsHeader: (value) => {
        context.rawXRobotsTag = value;
      },
      onRenderedPageCreated: async (page) => {
        // Must be attached before navigation - see
        // rendered-cost-profile.ts's own doc comment.
        context.readResourceTotals = recordRenderedResourceTotals(page);
      },
      onRenderedPage: (page) => runner.runChecks(RENDERED_PAGE_CHECKS, page, url, result, context),
    };
    result.renderDiff = await renderDiff(browser, url, renderOptions);
    // A challenge or transient response is acquisition failure, but a single
    // later attempt can recover a short-lived WAF/rate-limit wall. Observing
    // the first response raised the scheduler's delay and set any Retry-After
    // window, but that only spaces requests that wait for their turn: the
    // retry's raw pass is not paced inside renderDiff, so it waits here, right
    // when pacing matters most (issue #491). A second blocked result remains
    // excluded from analysis.
    if (isBlockedRender(result.renderDiff)) {
      if (options.scheduler !== undefined) await options.scheduler.pace();
      else if (options.delayMs !== undefined) await sleep(options.delayMs);
      result.renderDiff = await renderDiff(browser, url, renderOptions);
    }
    if (isBlockedRender(result.renderDiff)) {
      const status = result.renderDiff.renderedHttpStatus ?? result.renderDiff.httpStatus;
      result.renderDiffError =
        status !== undefined
          ? `HTTP ${status}: acquisition response was blocked or transient`
          : 'bot challenge: acquisition document was not site content';
      runner.record('render-diff', 'failed');
      runner.record('axe', 'not-applicable');
      runner.record('head-metadata', 'not-applicable');
    } else {
      runner.record('render-diff', 'completed');
    }
  } catch (error) {
    result.renderDiffError = toErrorMessage(error);
    runner.record('render-diff', 'failed');
    // Every downstream check that reuses this same rendered navigation
    // never ran at all when the navigation itself failed.
    runner.record('axe', 'not-applicable');
  }

  return { ...result, checkOutcomes: runner.outcomes };
}

/**
 * Runs Lighthouse against one page: the existing pre-Lighthouse politeness
 * delay, the process-wide serialized queue, the isolated-process
 * navigation, and the same result/error shape `scanPage` always returned
 * (plan 021 Step 5: extracted from the former `scanPage`, unchanged
 * behavior). Callers decide whether and when to call this at all - a page
 * the full-audit planner did not select for Lighthouse simply never calls
 * it.
 */
export async function runLighthouseAnalysis(
  url: string,
  debugPort: number,
  options: LighthouseAnalysisOptions = {},
): Promise<LighthouseAnalysisResult> {
  const beforeRun =
    options.scheduler !== undefined
      ? () => options.scheduler!.pace()
      : options.delayMs !== undefined && options.delayMs > 0
        ? () => sleep(options.delayMs!)
        : undefined;

  let lastError = 'Lighthouse did not return a usable result';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const lighthouse = await runLighthouseSerialized(
        options.navigationUrl ?? url,
        debugPort,
        beforeRun,
      );
      const runtimeError = lighthouseRuntimeError(lighthouse);
      if (runtimeError !== undefined) {
        lastError = `Lighthouse runtime error: ${runtimeError}`;
        if (attempt === 0) continue;
        return { lighthouseError: lastError };
      }
      const robotsStatus = robotsTxtPushbackStatus(lighthouse);
      if (robotsStatus !== undefined) {
        const requestedHost = new URL(url).hostname;
        const landedUrl = lighthouse.finalUrl || options.navigationUrl || url;
        const landedHost = (() => {
          try {
            return new URL(landedUrl).hostname;
          } catch {
            return '';
          }
        })();
        const response = {
          requestedHost,
          landedHost,
          auditedHostAliases: auditedHostAliases(requestedHost),
          status: robotsStatus,
        };
        if (options.scheduler !== undefined) {
          options.scheduler.observeHostDocument({
            response,
            document: { status: robotsStatus },
            signal: { pageUrl: url, fetcher: 'lighthouse' },
          });
        } else {
          classifyHostResponse({ ...response, consecutiveOriginServerErrors: 0 });
          classifyDocumentWall({ status: robotsStatus });
        }
      }
      return { lighthouse };
    } catch (error) {
      lastError = toErrorMessage(error);
      if (attempt === 0 && isRetryableLighthouseError(lastError)) continue;
      return { lighthouseError: lastError };
    }
  }
  return { lighthouseError: lastError };
}

/**
 * Compatibility wrapper preserving the pre-plan-021 all-in-one behavior:
 * rendered analysis followed by Lighthouse (unless skipped), returned as
 * the legacy `PageScanResult` shape. This is the only path prospecting and
 * the standalone `scan` CLI command use; both call this directly and
 * neither passes anything that would engage the full-audit planner, so
 * their existing per-page Lighthouse behavior is unchanged (see
 * `scanSite`'s own `fullAuditPlanning` option doc comment).
 */
export async function scanPage(
  browser: Browser,
  debugPort: number,
  url: string,
  options: ScanPageOptions,
): Promise<PageScanResult> {
  const {
    checkOutcomes: _checkOutcomes,
    renderedCostProfile: _renderedCostProfile,
    ...rendered
  } = await runRenderedAnalysis(browser, url, options);
  const result: PageScanResult = rendered;

  if (!options.skipLighthouse) {
    const lighthouseResult = await runLighthouseAnalysis(url, debugPort, {
      ...(options.navigationUrl !== undefined ? { navigationUrl: options.navigationUrl } : {}),
      ...(options.scheduler !== undefined ? { scheduler: options.scheduler } : {}),
      ...(options.scheduler === undefined && options.delayMs !== undefined
        ? { delayMs: options.delayMs }
        : {}),
    });
    if (lighthouseResult.lighthouse !== undefined) result.lighthouse = lighthouseResult.lighthouse;
    if (lighthouseResult.lighthouseError !== undefined)
      result.lighthouseError = lighthouseResult.lighthouseError;
  }

  return result;
}
