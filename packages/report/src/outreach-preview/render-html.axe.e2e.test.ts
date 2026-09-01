/**
 * The preview is the first thing a prospect ever sees from an accessibility
 * auditor. A preview that fails its own audit is not a document we can send, so
 * this holds it to the same WCAG 2.2 AA bar `render-html.axe.e2e.test.ts` holds
 * the paid report to, in both languages and at both ends of the viewport range.
 *
 * Needs real Chromium, like its sibling.
 */
import { AxeBuilder } from '@axe-core/playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '@odysseus/scanner';
import { buildOutreachFactsBlock } from '@odysseus/core';
import { generateOutreachPreviewHtml } from './render-html.js';
import { previewTestImage, previewTestInput } from './test-fixtures.js';

const WCAG22AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** The narrow end is WCAG 1.4.10's reflow width. The wide end is an ordinary
 *  laptop, which is where most of these will actually be opened. */
const VIEWPORTS = [
  { width: 1280, height: 900 },
  { width: 320, height: 640 },
] as const;

function render(language: 'fr' | 'en', withComposite: boolean): string {
  return generateOutreachPreviewHtml(
    previewTestInput({
      language,
      facts: buildOutreachFactsBlock({
        assessment: undefined,
        language,
        capabilities: { argumentB: true },
      }),
      images: withComposite
        ? [previewTestImage({ kind: 'render-comparison' }), previewTestImage()]
        : [previewTestImage()],
    }),
  );
}

describe('the rendered preview passes its own axe-core audit', () => {
  let browser: Browser;

  beforeAll(async () => {
    ({ browser } = await launchBrowser());
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  it('has zero WCAG 2.2 AA violations in both languages, at both viewports, with and without the composite', async () => {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();

      for (const language of ['fr', 'en'] as const) {
        // Trade-off 36 v2 makes composite-absent the majority real-world
        // shape, so it is audited rather than assumed to be a subset.
        for (const withComposite of [true, false]) {
          const html = render(language, withComposite);
          for (const viewport of VIEWPORTS) {
            await page.setViewportSize(viewport);
            await page.setContent(html, { waitUntil: 'load' });
            const results = await new AxeBuilder({ page }).withTags(WCAG22AA_TAGS).analyze();
            if (results.violations.length > 0) {
              const summary = results.violations
                .map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s) - ${v.help}`)
                .join('\n');
              throw new Error(
                `Preview (${language}, composite=${withComposite}, ${viewport.width}px) ` +
                  `failed its own axe-core audit:\n${summary}`,
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
        await page.setContent(render(language, true), { waitUntil: 'load' });
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
      await page.setContent(render('fr', true), { waitUntil: 'load' });

      const hrefs = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a')).map((a) => a.getAttribute('href')),
      );
      expect(hrefs).toHaveLength(3);

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
