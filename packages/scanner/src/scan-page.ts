import type { Browser } from 'playwright';
import type { Result as LighthouseResult } from 'lighthouse';
import type { RenderDiffResult } from '@odysseus/core';
import { type AxeResults, runAxe } from './axe.js';
import { runLighthouse } from './lighthouse.js';
import { renderDiff } from './render-diff.js';

export interface ScanPageOptions {
  /** Politeness delay applied between the raw/rendered/Lighthouse passes. */
  delayMs?: number;
  timeoutMs?: number;
  userAgent?: string;
  /** Forwarded to renderDiff's own screenshotDir option (the `pages/`
   *  parent directory for this run). */
  screenshotDir: string;
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
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
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
      },
    });
  } catch (error) {
    result.renderDiffError = toErrorMessage(error);
  }

  if (axeResult !== undefined) result.axe = axeResult;
  if (axeError !== undefined) result.axeError = axeError;

  if (options.delayMs) {
    await sleep(options.delayMs);
  }

  try {
    result.lighthouse = await runLighthouse(url, debugPort);
  } catch (error) {
    result.lighthouseError = toErrorMessage(error);
  }

  return result;
}
