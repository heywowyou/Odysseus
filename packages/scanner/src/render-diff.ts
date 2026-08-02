import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Browser } from 'playwright';
import type { RenderDiffResult } from '@odysseus/core';
import { DEFAULT_TIMEOUT_MS } from './browser.js';
import { getArtifactsRoot, getCrawlerUserAgent } from './config.js';
import { computeMissingPercent, extractTextFromHtml } from './extract-text.js';

export interface RenderDiffOptions {
  timeoutMs?: number;
  screenshotDir?: string;
  userAgent?: string;
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
  options: RenderDiffOptions = {},
): Promise<RenderDiffResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userAgent = options.userAgent ?? getCrawlerUserAgent();
  const screenshotDir = options.screenshotDir ?? path.join(getArtifactsRoot(), 'render-diff');

  const runDir = path.join(screenshotDir, buildRunSlug(url));
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

function buildRunSlug(url: string): string {
  const parsed = new URL(url);
  const base = `${parsed.hostname}${parsed.pathname}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'root'}-${Date.now()}`;
}
