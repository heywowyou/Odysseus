import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Browser, Page } from 'playwright';
import type { RenderDiffResult } from '@odysseus/core';
import { DEFAULT_TIMEOUT_MS } from './browser.js';
import { getCrawlerUserAgent } from './config.js';
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
    await renderedPage.goto(url, { waitUntil: 'networkidle' });
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
