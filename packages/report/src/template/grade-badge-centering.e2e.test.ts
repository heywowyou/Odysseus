/**
 * The grade letter must sit in the middle of its circle in both documents
 * that show it. Centering text by its font line box leaves the capital low,
 * so the badge draws each letter as an outline cropped to its ink
 * (grade-glyphs.ts). This measures that ink box against the circle in real
 * Chromium, with each document's real stylesheet, for every grade.
 *
 * Needs real Chromium, like its siblings.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchBrowser } from '@odysseus/scanner';
import {
  buildOutreachFactsBlock,
  GRADES,
  type Grade,
  type OutreachPreviewSummary,
} from '@odysseus/core';
import { generateOutreachPreviewHtmlV2 } from '../outreach-preview/render-html-v2.js';
import { renderHtml } from './render-html.js';
import { resolveRenderDiffEvidence } from '../screenshots.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../test-fixtures.js';

/** Sub-pixel: anything visible to the eye is well above this. */
const TOLERANCE_PX = 0.5;

function summary(language: 'fr' | 'en', withFacts: boolean): OutreachPreviewSummary {
  return {
    contentVersion: 'v2',
    auditId: 'audit-1',
    observedAt: new Date('2026-09-11T00:00:00.000Z'),
    language,
    recipient: {
      businessName: language === 'fr' ? 'Hôtel de la Plage' : 'Beach Hotel',
      dataOrigins: ['public-hotel-catalogue', 'public-website'],
    },
    links: {
      offer: 'https://odysseusaudit.com/offre',
      privacy: 'https://odysseusaudit.com/confidentialite-prospection',
      optOut: 'https://odysseusaudit.com/desinscription',
    },
    coverage: {
      inventoriedPageCount: 23,
      contentCheckedPageCount: 23,
      performanceMeasuredPageCount: 9,
    },
    distinctFindingCount: 5,
    affectedPageCount: 11,
    severityTotals: { critical: 1, serious: 1, moderate: 1, minor: 2 },
    proofCards: [
      {
        title: {
          fr: 'La navigation au clavier reste bloquée.',
          en: 'Keyboard navigation is trapped.',
        },
        category: 'accessibility',
        severity: 'critical',
        affectedPageCount: 4,
      },
      {
        title: { fr: 'Des pages n’ont pas de titre.', en: 'Some pages have no title.' },
        category: 'seo',
        severity: 'serious',
        affectedPageCount: 6,
      },
      {
        title: { fr: 'Des images sont trop lourdes.', en: 'Some images are too heavy.' },
        category: 'performance',
        severity: 'minor',
        affectedPageCount: 2,
      },
    ],
    facts: withFacts
      ? buildOutreachFactsBlock({
          assessment: undefined,
          language,
          capabilities: { argumentB: true },
        })
      : { state: 'omitted' },
  };
}

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

  it.each(GRADES)('centers %s on the outreach preview', async (grade: Grade) => {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    try {
      await page.setContent(
        generateOutreachPreviewHtmlV2({ ...summary('fr', true), gradeOverride: grade }),
        { waitUntil: 'load' },
      );
      await page.evaluate(() => document.fonts.ready);
      expectCentered(await inkOffset(page, '.preview-scorecard'), `preview ${grade}`);
    } finally {
      await page.close();
    }
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
