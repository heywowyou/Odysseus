import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '@odysseus/scanner';
import { renderPdfWithPageCountFromHtml } from '../pdf.js';
import { REPORT_PDF_CHROMIUM_ARGS } from '../index.js';
import { findReportPdfIntegrityDefects } from '../pdf-integrity.js';
import { resolveRenderDiffEvidence } from '../screenshots.js';
import { renderHtml } from './render-html.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../test-fixtures.js';

function normalizedText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gu, '')
    .replace(/<script[\s\S]*?<\/script>/gu, '')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function sectionIds(html: string): string[] {
  return [...html.matchAll(/<section[^>]*class="[^"]*sheet[^"]*"[^>]*id="([^"]+)"/gu)].map(
    (match) => match[1]!,
  );
}

describe('dark/light full-report parity', () => {
  let browser: Browser;

  beforeAll(async () => {
    ({ browser } = await launchBrowser({ extraArgs: REPORT_PDF_CHROMIUM_ARGS }));
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  it('keeps content, section order, page count, integrity, and the explicit light ground identical', async () => {
    const [manifest, findings, analysis] = await Promise.all([
      loadSmallSiteManifest(),
      loadSmallSiteFindings(),
      loadSmallSiteAnalysis('fr'),
    ]);
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);
    const dark = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages });
    const light = await renderHtml({
      manifest,
      findings,
      analysis,
      renderDiffEvidencePages,
      theme: 'light',
    });

    expect(normalizedText(light)).toBe(normalizedText(dark));
    expect(sectionIds(light)).toEqual(sectionIds(dark));

    const page = await (await browser.newContext()).newPage();
    try {
      await page.setContent(light, { waitUntil: 'load' });
      expect(
        await page.evaluate(() => ({
          theme: document.documentElement.dataset.reportTheme,
          rootBackground: getComputedStyle(document.documentElement).backgroundColor,
          background: getComputedStyle(document.body).backgroundColor,
          color: getComputedStyle(document.body).color,
        })),
      ).toEqual({
        theme: 'light',
        rootBackground: 'rgb(232, 237, 243)',
        background: 'rgb(219, 227, 236)',
        color: 'rgb(16, 27, 42)',
      });
    } finally {
      await page.context().close();
    }

    const [darkPdf, lightPdf] = await Promise.all([
      renderPdfWithPageCountFromHtml(dark, browser),
      renderPdfWithPageCountFromHtml(light, browser),
    ]);
    expect(lightPdf.pageCount).toBe(darkPdf.pageCount);
    expect(
      findReportPdfIntegrityDefects(darkPdf.pdf, { language: 'fr', pageCount: darkPdf.pageCount }),
    ).toEqual([]);
    expect(
      findReportPdfIntegrityDefects(lightPdf.pdf, {
        language: 'fr',
        pageCount: lightPdf.pageCount,
      }),
    ).toEqual([]);
  }, 120_000);
});
