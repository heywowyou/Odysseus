/**
 * Issue #118 regression. Plan 033's broad post-Paged.js geometry
 * collector aborted a normal report (the small-site fixture, physical
 * page 4) because it compared ordinary Paged.js infrastructure against
 * the printable rectangle; its constrained replacement lives in pdf.ts
 * and runs on every real render. This suite pins both directions of that
 * contract against the real Chromium pipeline, reusing the committed
 * small-site document rather than a new heavy fixture:
 *
 * - the known-good normal bilingual report must paginate with the gate
 *   silent (the exact shape that killed the old collector), and
 * - a crafted painted box pushed past the printable content rectangle
 *   must be reported by the collector and must abort the real render
 *   path before any PDF is emitted.
 */

import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchBrowser } from '@odysseus/scanner';
import { renderHtml } from './render-html.js';
import {
  analyzePagedjsOverflow,
  collectPagedjsOverflowModels,
  describePagedjsOverflow,
  renderPdfFromHtml,
} from '../pdf.js';
import { REPORT_PDF_CHROMIUM_ARGS } from '../index.js';
import { resolveRenderDiffEvidence } from '../screenshots.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../test-fixtures.js';

const require = createRequire(import.meta.url);

async function readPagedjsSource(): Promise<string> {
  const entryPath = require.resolve('pagedjs');
  const packageRoot = path.dirname(path.dirname(entryPath));
  return fs.readFile(path.join(packageRoot, 'dist', 'paged.js'), 'utf-8');
}

/** The same preview steps pdf.ts runs before its gates, so the collector
 *  sees exactly the DOM the production gate would see. */
async function paginate(browser: Browser, html: string, pagedjsSource: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.addScriptTag({ content: pagedjsSource });
  await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Paged = (globalThis as any).Paged;
    const previewer = new Paged.Previewer();
    await previewer.preview();
  });
  return page;
}

const OVERFLOW_PROBE_HTML =
  '<div data-overflow-probe style="width:100mm;height:20mm;' +
  'background:#5b0011;color:#fff;transform:translateX(140mm)">Overflow probe</div>';

/** Injected as the first child of the first non-cover sheet: that sheet
 *  carries break-before: page (paged.css), so it and the probe open
 *  physical page 2, deterministically. The escape rides on a transform on
 *  purpose: Paged.js's own overflow machinery reacts to scrollWidth, so a
 *  plain fixed-width block would be broken apart or removed by the layout
 *  engine under test before any gate could see it, while a transformed
 *  box is invisible to that machinery yet still paints and still reports
 *  its true geometry to getBoundingClientRect. */
function injectOverflowProbe(html: string): string {
  const sheetOpen = '<section class="sheet';
  const coverStart = html.indexOf(sheetOpen);
  const secondSheetStart = html.indexOf(sheetOpen, coverStart + 1);
  if (coverStart === -1 || secondSheetStart === -1) {
    throw new Error('fixture shape changed: expected at least two sheets in the rendered html');
  }
  const probeInsertionPoint = html.indexOf('>', secondSheetStart) + 1;
  return `${html.slice(0, probeInsertionPoint)}${OVERFLOW_PROBE_HTML}${html.slice(probeInsertionPoint)}`;
}

let browser: Browser;
let pagedjsSource: string;
let normalHtml: string;
let probeHtml: string;

beforeAll(async () => {
  const [manifest, findings, analysis] = await Promise.all([
    loadSmallSiteManifest(),
    loadSmallSiteFindings(),
    loadSmallSiteAnalysis('fr'),
  ]);
  const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);
  normalHtml = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages });
  probeHtml = injectOverflowProbe(normalHtml);
  [{ browser }, pagedjsSource] = await Promise.all([
    launchBrowser({ extraArgs: REPORT_PDF_CHROMIUM_ARGS }),
    readPagedjsSource(),
  ]);
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

describe('the issue #118 overflow gate against the real Paged.js pipeline', () => {
  it('stays silent on the known-good normal bilingual report document', async () => {
    const page = await paginate(browser, normalHtml, pagedjsSource);
    try {
      // This is the exact document shape whose ordinary margin boxes and
      // sheet fragments made plan 033's broad collector abort a normal
      // report. A violation here is a false positive by definition.
      const violation = analyzePagedjsOverflow(await collectPagedjsOverflowModels(page));
      expect(violation).toBeUndefined();
    } finally {
      await page.context().close();
    }
  }, 60_000);

  it('reports the crafted painted box as a right overflow on physical page 2', async () => {
    const page = await paginate(browser, probeHtml, pagedjsSource);
    try {
      const violation = analyzePagedjsOverflow(await collectPagedjsOverflowModels(page));
      if (violation === undefined) throw new Error('expected the gate to report a violation');
      expect(violation).toMatchObject({
        pageIndex: 1,
        tag: 'DIV',
        side: 'right',
        amountPx: expect.any(Number),
      });
      expect(violation.findingId).toBeUndefined();
      expect(describePagedjsOverflow(violation)).toContain('physical page 2 at right');
    } finally {
      await page.context().close();
    }
  }, 60_000);

  it('aborts the real render path before any PDF is emitted for the crafted overflow', async () => {
    await expect(renderPdfFromHtml(probeHtml, browser)).rejects.toThrow(
      /Report generation aborted: Painted content <div> extends past the printable content rectangle on physical page 2 at right.*Never shipped to a client\./,
    );
  }, 60_000);
});
