/**
 * A real French report was refused by the issue #118 overflow gate: a box
 * on page 18 reached 1793.7px past the right edge. Nothing on the page was
 * wide. Paged.js had split a four-line fix snippet (<pre>, white-space:
 * pre-wrap) between two pages, the first fragment outgrew its page, and the
 * leftover lines went to the off-page overflow column the gate measures.
 *
 * The sweep moves a real snippet through the bottom of the first page one
 * filler step at a time, so one of the steps lands its lines on the page
 * boundary whatever the exact font metrics are.
 */
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright';
import { launchBrowser } from '@odysseus/scanner';
import { readStylesInlined } from './render-html.js';
import { renderFixSnippet } from './remediation/render-fix-snippet.js';
import { analyzePagedjsOverflow, collectPagedjsOverflowModels } from '../pdf.js';
import { REPORT_PDF_CHROMIUM_ARGS } from '../index.js';

const require = createRequire(import.meta.url);

const SNIPPET = renderFixSnippet(
  {
    kind: 'fixed',
    rendered:
      '<video controls>\n  <source src="...">\n  <track kind="captions" src="sous-titres.vtt" srclang="fr">\n</video>',
  },
  { fixSnippetLabel: 'Correctif type', fixSnippetFillInBlankNote: 'À compléter' },
);

let browser: Browser;
let pagedjsSource: string;
let styles: string;

beforeAll(async () => {
  styles = await readStylesInlined();
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

describe('a fix snippet at a page boundary', () => {
  it('moves to the next page whole instead of spilling off the page', async () => {
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      for (let filler = 800; filler <= 936; filler += 8) {
        const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${styles}</style></head><body><div style="font-family:var(--font-body);color:var(--color-text)"><section class="sheet" id="section-snippet"><h2>Autres constats</h2><div style="height:${filler}px"></div>${SNIPPET}<p>Suite</p></section></div></body></html>`;
        await page.setContent(html, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        await page.addScriptTag({ content: pagedjsSource });
        await page.evaluate(async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const Paged = (globalThis as any).Paged;
          await new Paged.Previewer().preview();
        });
        const violation = analyzePagedjsOverflow(await collectPagedjsOverflowModels(page));
        const splitSnippets = await page.evaluate(
          () => document.querySelectorAll('.fix-snippet[data-split-from]').length,
        );
        expect({ filler, violation, splitSnippets }).toEqual({
          filler,
          violation: undefined,
          splitSnippets: 0,
        });
      }
    } finally {
      await context.close();
    }
  }, 300_000);
});
