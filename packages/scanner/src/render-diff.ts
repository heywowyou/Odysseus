import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Browser, Page } from 'playwright';
import type { RenderDiffResult } from '@odysseus/core';
import { DEFAULT_TIMEOUT_MS } from './browser.js';
import { getCrawlerUserAgent, getRenderSettleTimeoutMs } from './config.js';
import { computeMissingPercent, extractTextFromHtml } from './extract-text.js';
import { buildPageDir } from './artifacts/paths.js';

export interface RenderDiffOptions {
  timeoutMs?: number;
  /** The `pages/` parent directory for this run (see artifacts/paths.ts
   *  for the layout). Screenshots land at
   *  `<screenshotDir>/<slug>-<hash>/{raw,rendered}.png`. Always an
   *  explicit, already-timestamped directory from the CLI's audit/
   *  render-diff orchestration. */
  screenshotDir: string;
  userAgent?: string;
  /** Politeness delay to wait after the raw pass closes and before the
   *  rendered pass opens. Unset by default so the standalone render-diff
   *  CLI keeps its existing back-to-back timing. */
  preRenderedDelayMs?: number;
  /** Invoked once against the fully rendered page, before its context
   *  closes, so callers (the scanner orchestration) can run additional
   *  analysis (axe-core) against the exact same navigation instead of
   *  triggering another page load. */
  onRenderedPage?: (page: Page) => Promise<void>;
  /** Invoked on the rendered page after it is created and *before* it
   *  navigates, for a caller that must observe the navigation itself
   *  rather than its result. Added for the prescan's byte and request
   *  counting (plan 004): a `response` listener attached after `load`
   *  misses the document and everything the initial parse requested,
   *  which is most of a page's weight. Purely additive - no existing
   *  caller passes it, so every audit path navigates exactly as before.
   *  Anything that can be read from the loaded page belongs in
   *  onRenderedPage instead; this hook must not navigate or block. */
  onRenderedPageCreated?: (page: Page) => Promise<void>;
  /** Upper bound on the post-`load` wait for network idle. Defaults to
   *  RENDER_SETTLE_TIMEOUT_MS. Exceeding it is a normal outcome, not an
   *  error: see the settle block in renderDiff below. */
  settleTimeoutMs?: number;
}

/**
 * Fetches a URL raw (no JavaScript execution) and fully rendered, and
 * diffs the visible text between the two. The raw pass cannot use
 * page.evaluate() because Playwright disables the JS engine entirely
 * when javaScriptEnabled is false, so it reads page.content() instead
 * and strips markup with extractTextFromHtml() - which also better
 * matches what a non-executing crawler actually sees (text nodes in the
 * served markup, no CSS-computed visibility).
 */
export async function renderDiff(
  browser: Browser,
  url: string,
  options: RenderDiffOptions,
): Promise<RenderDiffResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const settleTimeoutMs = options.settleTimeoutMs ?? getRenderSettleTimeoutMs();
  const userAgent = options.userAgent ?? getCrawlerUserAgent();
  const { screenshotDir } = options;

  const runDir = path.join(screenshotDir, buildPageDir(url));
  await fs.mkdir(runDir, { recursive: true });
  const rawScreenshotRef = path.join(runDir, 'raw.png');
  const renderedScreenshotRef = path.join(runDir, 'rendered.png');

  const rawContext = await browser.newContext({ javaScriptEnabled: false, userAgent });
  let rawTextLength: number;
  let httpStatus: number;
  try {
    rawContext.setDefaultTimeout(timeoutMs);
    rawContext.setDefaultNavigationTimeout(timeoutMs);
    const rawPage = await rawContext.newPage();
    const rawResponse = await rawPage.goto(url, { waitUntil: 'load' });
    if (!rawResponse) {
      throw new Error(`render-diff: no HTTP response received for ${url}`);
    }
    httpStatus = rawResponse.status();
    const rawHtml = await rawPage.content();
    rawTextLength = extractTextFromHtml(rawHtml).length;
    await rawPage.screenshot({ path: path.resolve(rawScreenshotRef), fullPage: true });
  } finally {
    await rawContext.close();
  }

  if (options.preRenderedDelayMs) {
    await new Promise((resolve) => setTimeout(resolve, options.preRenderedDelayMs));
  }

  const renderedContext = await browser.newContext({ userAgent });
  let renderedTextLength: number;
  const consoleErrors: string[] = [];
  try {
    renderedContext.setDefaultTimeout(timeoutMs);
    renderedContext.setDefaultNavigationTimeout(timeoutMs);
    const renderedPage = await renderedContext.newPage();
    renderedPage.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    renderedPage.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });
    await options.onRenderedPageCreated?.(renderedPage);
    // 'load' rather than 'networkidle', with idle demoted to a bounded,
    // best-effort settle below. networkidle is unreachable on real sites
    // that hold a request open forever (chat widget, analytics heartbeat,
    // autoplaying video), and treating it as a hard precondition made one
    // unreachable condition fail three scanners at once: render-diff, the
    // axe pass, and every onRenderedPage custom check all hang off this
    // single navigation. Measured on www.lagnonu.fr (2026-08-24): idle
    // never arrived in 120s, while the rendered text was already complete
    // and byte-identical in length at 4.3s under 'load'.
    await renderedPage.goto(url, { waitUntil: 'load' });
    try {
      await renderedPage.waitForLoadState('networkidle', { timeout: settleTimeoutMs });
    } catch {
      // Deliberately swallowed. A page that never falls idle is still
      // fully rendered and worth scanning; losing the accessibility pass
      // over it is the worse outcome. Timing out here is not recorded as
      // a page error for the same reason - it is an expected shape of
      // real site, not a failure of this scan.
    }
    const renderedText = await renderedPage.evaluate(() => document.body.innerText);
    renderedTextLength = renderedText.trim().length;
    await renderedPage.screenshot({ path: path.resolve(renderedScreenshotRef), fullPage: true });
    await options.onRenderedPage?.(renderedPage);
  } finally {
    await renderedContext.close();
  }

  return {
    pageUrl: url,
    rawTextLength,
    renderedTextLength,
    missingPercent: computeMissingPercent(rawTextLength, renderedTextLength),
    rawScreenshotRef,
    renderedScreenshotRef,
    consoleErrors,
    httpStatus,
  };
}
