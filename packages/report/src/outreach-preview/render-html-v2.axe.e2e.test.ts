/**
 * The v2 scorecard preview is the first thing a prospect ever sees from an
 * accessibility auditor, so it is held to the same WCAG 2.2 AA bar its v1
 * sibling (`render-html.axe.e2e.test.ts`) holds the prescan preview and the
 * paid report to, in both languages and at both ends of the viewport range.
 *
 * Needs real Chromium, like its siblings.
 */
import { AxeBuilder } from '@axe-core/playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '@odysseus/scanner';
import { buildOutreachFactsBlock, type OutreachPreviewSummary } from '@odysseus/core';
import { generateOutreachPreviewHtmlV2 } from './render-html-v2.js';

const WCAG22AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** The narrow end is WCAG 1.4.10's reflow width. The wide end is an ordinary
 *  laptop, which is where most of these will actually be opened. */
const VIEWPORTS = [
  { width: 1280, height: 900 },
  { width: 320, height: 640 },
] as const;

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

describe('the rendered v2 scorecard passes its own axe-core audit', () => {
  let browser: Browser;

  beforeAll(async () => {
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  it('has zero WCAG 2.2 AA violations in both languages, at both viewports, with and without the legal block', async () => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();

      for (const language of ['fr', 'en'] as const) {
        // The legal block renders only when qualification facts exist, so
        // both shapes are audited rather than one standing in for the other.
        for (const withFacts of [true, false]) {
          const html = generateOutreachPreviewHtmlV2(summary(language, withFacts));
          for (const viewport of VIEWPORTS) {
            await page.setViewportSize(viewport);
            await page.setContent(html, { waitUntil: 'load' });
            const results = await new AxeBuilder({ page }).withTags(WCAG22AA_TAGS).analyze();
            if (results.violations.length > 0) {
              const list = results.violations
                .map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) - ${v.help}`)
                .join('\n');
              throw new Error(
                `v2 preview (${language}, facts=${withFacts}, ${viewport.width}px) ` +
                  `failed its own axe-core audit:\n${list}`,
              );
            }
          }
        }
      }
    } finally {
      await context.close();
    }
  }, 120_000);

  it('never scrolls sideways at 320px, which is what WCAG 1.4.10 actually asks', async () => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.setViewportSize({ width: 320, height: 640 });
      for (const language of ['fr', 'en'] as const) {
        await page.setContent(generateOutreachPreviewHtmlV2(summary(language, true)), {
          waitUntil: 'load',
        });
        const overflows = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(overflows, language).toBe(false);
      }
    } finally {
      await context.close();
    }
  }, 60_000);

  it('gives every link a visible focus style, in document order', async () => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.setContent(generateOutreachPreviewHtmlV2(summary('fr', true)), {
        waitUntil: 'load',
      });

      const hrefs = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href')),
      );
      expect(hrefs.length).toBeGreaterThanOrEqual(3);

      const tabbed: Array<string | null> = [];
      for (let index = 0; index < hrefs.length; index += 1) {
        await page.keyboard.press('Tab');
        tabbed.push(
          await page.evaluate(() => document.activeElement?.getAttribute('href') ?? null),
        );
      }
      // Focus order follows the document, because nothing here reorders it.
      expect(tabbed).toEqual(hrefs);

      const outline = await page.evaluate(() => {
        const link = document.querySelector('a');
        if (!link) return null;
        link.focus();
        const style = getComputedStyle(link);
        return `${style.outlineStyle} ${style.outlineWidth}`;
      });
      expect(outline).not.toBe(null);
      expect(outline).not.toMatch(/^none/u);
    } finally {
      await context.close();
    }
  }, 60_000);
});
