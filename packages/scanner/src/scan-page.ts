import type { Browser } from 'playwright';
import type { Result as LighthouseResult } from 'lighthouse';
import type { RenderDiffResult, TransactionalFlowEvidence, TransactionalFlowRedirectCheck } from '@odysseus/core';
import { type AxeResults, runAxe } from './axe.js';
import { runLighthouse } from './lighthouse.js';
import { renderDiff } from './render-diff.js';
import { extractMentionsLegales, type MentionsLegalesExtraction } from './checks/mentions-legales.js';
import {
  detectTransactionalFlow,
  findDelegatedBookingRedirectChecks,
  type RedirectHostCache,
} from './checks/transactional-flow.js';
import { extractHeadMetadata, type HeadMetadataExtraction } from './checks/head-metadata.js';

export interface ScanPageOptions {
  /** Politeness delay applied between the raw/rendered/Lighthouse passes. */
  delayMs?: number;
  timeoutMs?: number;
  userAgent?: string;
  /** Forwarded to renderDiff's own screenshotDir option (the `pages/`
   *  parent directory for this run). */
  screenshotDir: string;
  /** The one crawled URL scanSite identified as the mentions-legales
   *  page (from crawl.mentionsLegalesPageUrl). Only that page runs the
   *  SIREN/RCS/TVA text extraction; every page runs transactional-flow
   *  detection, since checkout/cart UI can appear anywhere. */
  mentionsLegalesUrl?: string;
  /** Shared across every page of one scanSite() run - see
   *  transactional-flow.ts's RedirectHostCache doc comment for why a
   *  per-page cache alone isn't enough. */
  redirectHostCache?: RedirectHostCache;
}

/**
 * Raw output of all three scanner passes for one page. Each field is
 * independently fallible: a Lighthouse timeout on one page must not lose
 * the render-diff or axe results already gathered for that same page.
 */
export interface PageScanResult {
  url: string;
  renderDiff?: RenderDiffResult;
  renderDiffError?: string;
  axe?: AxeResults;
  axeError?: string;
  lighthouse?: LighthouseResult;
  lighthouseError?: string;
  mentionsLegales?: MentionsLegalesExtraction;
  mentionsLegalesError?: string;
  transactionalFlowEvidence?: TransactionalFlowEvidence[];
  transactionalFlowRedirectChecks?: TransactionalFlowRedirectCheck[];
  headMetadata?: HeadMetadataExtraction;
  headMetadataError?: string;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
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
 */
let lighthouseQueue: Promise<unknown> = Promise.resolve();

async function runLighthouseSerialized(url: string, debugPort: number): Promise<LighthouseResult> {
  const run = lighthouseQueue.then(() => runLighthouse(url, debugPort));
  lighthouseQueue = run.catch(() => undefined);
  return run;
}

/**
 * Scans one page with all three scanners, reusing a single rendered
 * navigation for both render-diff's text/screenshot extraction and
 * axe-core (via renderDiff's onRenderedPage hook), so only two page loads
 * are made under our own control (raw + rendered). Lighthouse performs its
 * own separate navigation over the CDP debugPort, since it cannot attach
 * to an already-loaded Playwright page.
 */
export async function scanPage(
  browser: Browser,
  debugPort: number,
  url: string,
  options: ScanPageOptions,
): Promise<PageScanResult> {
  const result: PageScanResult = { url };
  let axeResult: AxeResults | undefined;
  let axeError: string | undefined;
  let mentionsLegalesResult: MentionsLegalesExtraction | undefined;
  let mentionsLegalesError: string | undefined;
  let transactionalFlowEvidence: TransactionalFlowEvidence[] | undefined;
  let transactionalFlowRedirectChecks: TransactionalFlowRedirectCheck[] | undefined;
  let headMetadataResult: HeadMetadataExtraction | undefined;
  let headMetadataError: string | undefined;

  try {
    result.renderDiff = await renderDiff(browser, url, {
      screenshotDir: options.screenshotDir,
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.userAgent !== undefined ? { userAgent: options.userAgent } : {}),
      ...(options.delayMs !== undefined ? { preRenderedDelayMs: options.delayMs } : {}),
      onRenderedPage: async (page) => {
        try {
          axeResult = await runAxe(page);
        } catch (error) {
          axeError = toErrorMessage(error);
        }

        if (options.mentionsLegalesUrl !== undefined && url === options.mentionsLegalesUrl) {
          try {
            const bodyText = await page.evaluate(() => document.body.innerText);
            mentionsLegalesResult = extractMentionsLegales(url, bodyText);
          } catch (error) {
            mentionsLegalesError = toErrorMessage(error);
          }
        }

        try {
          transactionalFlowEvidence = await detectTransactionalFlow(page, url);
        } catch {
          // Transactional-flow detection is best-effort evidence, not a
          // finding: a failure here must not surface as a page error the
          // way axe/render-diff failures do, and an empty result is
          // already the correct fallback for "nothing detected".
          transactionalFlowEvidence = [];
        }

        try {
          transactionalFlowRedirectChecks = await findDelegatedBookingRedirectChecks(page, url, {
            browser,
            ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
            ...(options.userAgent !== undefined ? { userAgent: options.userAgent } : {}),
            ...(options.redirectHostCache !== undefined ? { hostCache: options.redirectHostCache } : {}),
          });
          // Only a confirmed single-property redirect promotes to
          // transactional-flow evidence (drives hasTransactionalFlow);
          // 'marketplace' and 'undetermined' checks stay recorded on
          // transactionalFlowRedirectChecks only, per the "attach
          // evidence for whatever was concluded, not just the boolean"
          // rule.
          for (const check of transactionalFlowRedirectChecks) {
            if (check.resolution === 'single-property') {
              transactionalFlowEvidence.push({
                kind: 'delegated-booking-redirect',
                selector: 'a[href]',
                pageUrl: url,
                detail: `${check.linkUrl} -> ${check.destinationUrl ?? check.linkUrl}: ${check.detail}`,
              });
            }
          }
        } catch {
          // Same best-effort posture as detectTransactionalFlow above: a
          // failure to follow a redirect must not surface as a page
          // error, and an empty result is the correct fallback.
          transactionalFlowRedirectChecks = [];
        }

        try {
          headMetadataResult = await extractHeadMetadata(page, url);
        } catch (error) {
          headMetadataError = toErrorMessage(error);
        }
      },
    });
  } catch (error) {
    result.renderDiffError = toErrorMessage(error);
  }

  if (axeResult !== undefined) result.axe = axeResult;
  if (axeError !== undefined) result.axeError = axeError;
  if (mentionsLegalesResult !== undefined) result.mentionsLegales = mentionsLegalesResult;
  if (mentionsLegalesError !== undefined) result.mentionsLegalesError = mentionsLegalesError;
  if (transactionalFlowEvidence !== undefined) result.transactionalFlowEvidence = transactionalFlowEvidence;
  if (transactionalFlowRedirectChecks !== undefined) result.transactionalFlowRedirectChecks = transactionalFlowRedirectChecks;
  if (headMetadataResult !== undefined) result.headMetadata = headMetadataResult;
  if (headMetadataError !== undefined) result.headMetadataError = headMetadataError;

  if (options.delayMs) {
    await sleep(options.delayMs);
  }

  try {
    result.lighthouse = await runLighthouseSerialized(url, debugPort);
  } catch (error) {
    result.lighthouseError = toErrorMessage(error);
  }

  return result;
}
