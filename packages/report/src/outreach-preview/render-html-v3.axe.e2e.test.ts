import { AxeBuilder } from '@axe-core/playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '@odysseus/scanner';
import type { OutreachPreviewSummaryV3 } from '@odysseus/core';
import { generateOutreachPreviewHtmlV3 } from './render-html-v3.js';

const WCAG22AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const VIEWPORTS = [
  { width: 1280, height: 900 },
  { width: 320, height: 640 },
] as const;

function summary(language: 'fr' | 'en'): OutreachPreviewSummaryV3 {
  return {
    contentVersion: 'v3',
    observedAt: new Date('2026-09-19T08:00:00.000Z'),
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
    priorityCards: [
      {
        rank: 1,
        title: {
          fr: 'Certains liens ne sont pas clairement nommés.',
          en: 'Some links are not clearly named.',
        },
        category: 'accessibility',
        severity: 'serious',
        affectedPageCount: 6,
      },
      {
        rank: 2,
        title: {
          fr: 'Certaines images ne sont pas décrites.',
          en: 'Some images are not described.',
        },
        category: 'accessibility',
        severity: 'moderate',
        affectedPageCount: 4,
      },
      {
        rank: 3,
        title: {
          fr: 'Certaines pages sont difficiles à indexer.',
          en: 'Some pages are difficult to index.',
        },
        category: 'seo',
        severity: 'minor',
        affectedPageCount: 2,
      },
    ],
    dataQuality: {
      status: 'limited',
      limitations: [
        {
          code: 'temporal-drift',
          summary: {
            fr: 'Le site a changé pendant le scan.',
            en: 'The site changed during the scan.',
          },
        },
      ],
    },
    facts: { state: 'omitted' },
  };
}

describe('the rendered v3 preview passes its accessibility contract', () => {
  let browser: Browser;

  beforeAll(async () => {
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  it('has zero WCAG 2.2 AA violations in both languages and viewports', async () => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      for (const language of ['fr', 'en'] as const) {
        for (const viewport of VIEWPORTS) {
          await page.setViewportSize(viewport);
          await page.setContent(generateOutreachPreviewHtmlV3(summary(language)), {
            waitUntil: 'load',
          });
          const results = await new AxeBuilder({ page }).withTags(WCAG22AA_TAGS).analyze();
          expect(results.violations, `${language}/${viewport.width}`).toEqual([]);
        }
      }
    } finally {
      await context.close();
    }
  }, 120_000);

  it('does not scroll sideways at the WCAG reflow width', async () => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.setViewportSize({ width: 320, height: 640 });
      await page.setContent(generateOutreachPreviewHtmlV3(summary('fr')), { waitUntil: 'load' });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        ),
      ).toBe(false);
    } finally {
      await context.close();
    }
  }, 60_000);
});
