/**
 * The grade letter must sit in the middle of its circle in the full report,
 * the one document that shows it since the v2 outreach preview was retired
 * (issue #530). Centering text by its font line box leaves the capital low,
 * so the badge draws each letter as an outline cropped to its ink
 * (grade-glyphs.ts). This measures that ink box against the circle in real
 * Chromium, with each document's real stylesheet, for every grade.
 *
 * Needs real Chromium, like its siblings.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchBrowser } from '@odysseus/scanner';
import { GRADES, type Grade } from '@odysseus/core';
import { renderHtml } from './render-html.js';
import { resolveRenderDiffEvidence } from '../screenshots.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../test-fixtures.js';

/** Sub-pixel: anything visible to the eye is well above this. */
const TOLERANCE_PX = 0.5;

async function inkOffset(page: Page, scope: string): Promise<{ dx: number; dy: number }> {
  return page.evaluate((selector) => {
    const badge = document.querySelector(`${selector} .scorecard-grade-badge`);
    const ink = badge?.querySelector('.scorecard-grade-glyph path');
    if (!badge || !ink) throw new Error(`no grade badge under ${selector}`);
    const circle = badge.getBoundingClientRect();
    const glyph = ink.getBoundingClientRect();
    return {
      dx: glyph.left + glyph.width / 2 - (circle.left + circle.width / 2),
      dy: glyph.top + glyph.height / 2 - (circle.top + circle.height / 2),
    };
  }, scope);
}

function expectCentered(offset: { dx: number; dy: number }, label: string): void {
  expect(Math.abs(offset.dx), `${label} horizontal offset`).toBeLessThanOrEqual(TOLERANCE_PX);
  expect(Math.abs(offset.dy), `${label} vertical offset`).toBeLessThanOrEqual(TOLERANCE_PX);
}

describe('the grade letter is centered in its circle', () => {
  let browser: Browser;

  beforeAll(async () => {
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  it.each(GRADES)('centers %s on the full report', async (grade: Grade) => {
    const [manifest, findings, analysis] = await Promise.all([
      loadSmallSiteManifest(),
      loadSmallSiteFindings(),
      loadSmallSiteAnalysis('fr'),
    ]);
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);
    const html = await renderHtml({
      manifest,
      findings,
      analysis,
      renderDiffEvidencePages,
      gradeOverride: {
        grade,
        reason: 'centering test',
        reviewedAt: new Date('2026-09-15T00:00:00.000Z'),
        reviewedBy: 'operator',
      },
    });
    const page = await browser.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      expectCentered(await inkOffset(page, '.metadata-grade-field'), `report ${grade}`);
    } finally {
      await page.close();
    }
  });
});
