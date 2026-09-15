/**
 * Issue #276 regression: a real prospecting scan carried a 771-character
 * unbroken third-party script URL in its findings, and the paid report
 * aborted on the overflow gate. Every string a finding carries is replaced
 * with such a URL here, so any report surface that prints finding evidence
 * without wrapping it fails this suite.
 */

import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import type { Finding } from '@odysseus/core';
import { launchBrowser } from '@odysseus/scanner';
import { renderHtml } from './render-html.js';
import { analyzePagedjsOverflow, collectPagedjsOverflowModels } from '../pdf.js';
import { REPORT_PDF_CHROMIUM_ARGS } from '../index.js';
import { resolveRenderDiffEvidence } from '../screenshots.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../test-fixtures.js';

const require = createRequire(import.meta.url);

const LONG_SCRIPT_URL = `https://cdn.hotel-widget.example/booking/loader.js?${'k'.repeat(700)}=${'v'.repeat(50)}`;

/** Lengthens URL-shaped evidence only: identifiers, enums and numbers keep
 *  their contract shapes so the analysis still matches its findings. */
function withLongUrls(value: unknown, key = ''): unknown {
  if (typeof value === 'string') {
    return /^https?:\/\//u.test(value) && !/pageUrl|siteUrl|^url$/iu.test(key)
      ? LONG_SCRIPT_URL
      : value;
  }
  if (Array.isArray(value)) return value.map((item) => withLongUrls(item, key));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entry]) => [entryKey, withLongUrls(entry, entryKey)]),
    );
  }
  return value;
}

let browser: Browser;
let pagedjsSource: string;
let html: string;

beforeAll(async () => {
  const [manifest, findings, analysis] = await Promise.all([
    loadSmallSiteManifest(),
    loadSmallSiteFindings(),
    loadSmallSiteAnalysis('fr'),
  ]);
  const longFindings = findings.map((finding) => ({
    ...(withLongUrls(finding) as Finding),
    elements: finding.elements.map((element) => ({
      ...element,
      selector: `script[src="${LONG_SCRIPT_URL}"]`,
      snippet: `<script src="${LONG_SCRIPT_URL}"></script>`,
    })),
  }));
  const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, longFindings);
  html = await renderHtml({
    manifest,
    findings: longFindings,
    analysis,
    renderDiffEvidencePages,
  });
  const entryPath = require.resolve('pagedjs');
  pagedjsSource = await fs.readFile(
    path.join(path.dirname(path.dirname(entryPath)), 'dist', 'paged.js'),
    'utf-8',
  );
  ({ browser } = await launchBrowser({ extraArgs: REPORT_PDF_CHROMIUM_ARGS }));
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

describe('long unbroken evidence strings in the paid report', () => {
  it('paginates without any painted box leaving the printable area', async () => {
    expect(html).toContain('hotel-widget.example');
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.addScriptTag({ content: pagedjsSource });
      await page.evaluate(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Paged = (globalThis as any).Paged;
        await new Paged.Previewer().preview();
      });
      const violation = analyzePagedjsOverflow(await collectPagedjsOverflowModels(page));
      expect(violation).toBeUndefined();
    } finally {
      await context.close();
    }
  }, 120_000);
});
