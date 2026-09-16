/**
 * Issue #170. A rule group's heading can be the last content element of an
 * annex page with its whole detail table on the next one: in the stranded
 * shape the engine decides the break inside the group's own table (its rows
 * cannot split under paged.css's orphans/widows and row atomicity, so the
 * table retreats wholesale) and never re-consults any keep-with-next marker
 * on the heading - a stylesheet break-after: avoid on the heading was
 * measured to change nothing (2026-09-10 filler-height sweep). The fix is
 * therefore post-layout: pdf.ts detects a heading without its rows on the
 * same page and repairs the source by forcing that group to start on a
 * fresh page, fail-closed by a final gate.
 *
 * The fixture is a synthetic single-rule-group appendix with a fixed-height
 * filler injected before the group, sweeping the filler across the measured
 * strand window (158-177mm in this exact pipeline), not the shared stress
 * fixture: whether a heading strands is content-dependent, and only a
 * filler that moves the group start through the page boundary exercises it
 * deterministically.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright';
import { launchBrowser } from '@odysseus/scanner';
import type { AuditManifest, Finding } from '@odysseus/core';
import { renderFindingsAppendix } from './findings-appendix.js';
import { getStrings } from '../strings/i18n.js';
import { readStylesInlined } from '../render-html.js';
import { renderPdfWithPageCountFromHtml } from '../../pdf.js';

const require = createRequire(import.meta.url);

async function readPagedjsSource(): Promise<string> {
  const entryPath = require.resolve('pagedjs');
  const packageRoot = path.dirname(path.dirname(entryPath));
  return fs.readFile(path.join(packageRoot, 'dist', 'paged.js'), 'utf-8');
}

function buildManifest(pageCount: number): AuditManifest {
  return {
    auditId: 'audit-heading-keep',
    kind: 'audit',
    siteUrl: 'https://example.com/',
    startedAt: '2026-09-10T00:00:00.000Z',
    finishedAt: '2026-09-10T00:05:00.000Z',
    tool: {
      odysseusVersion: '0.1.0',
      findingsSchemaVersion: 1,
      axeCoreVersion: '4.12.1',
      lighthouseVersion: '12.8.2',
      playwrightVersion: '1.49.0',
      chromiumVersion: '131.0.0',
    },
    config: {
      maxPages: pageCount,
      maxDepth: 5,
      crawlDelayMs: 1000,
      pageTimeoutMs: 30_000,
      lighthouseTimeoutMs: 60_000,
      userAgent: 'OdysseusAuditBot/0.1',
      scanConcurrency: 3,
    },
    crawl: {
      startUrl: 'https://example.com/',
      visitedCount: pageCount,
      maxPages: pageCount,
      maxDepth: 5,
      robotsTxtFound: true,
      effectiveDelayMs: 1000,
    },
    pages: Array.from({ length: pageCount }, (_, i) => ({
      url: `https://example.com/page-${i}`,
      depth: 0,
      status: 'visited' as const,
      errors: {},
    })),
  };
}

/** A small group whose table cannot split (4 rows against paged.css's
 *  orphans: 3 / widows: 3), which is exactly the shape that strands its
 *  heading: the whole table retreats to the next page and the heading is
 *  left behind as the last content of the page. */
function buildRuleGroup(count: number): Finding[] {
  return Array.from({ length: count }, (_, i) => {
    const id = `f${String(i + 1).padStart(3, '0')}`;
    return {
      findingId: id,
      auditId: 'audit-heading-keep',
      schemaVersion: 1,
      source: 'axe' as const,
      ruleId: 'select-name',
      category: 'accessibility' as const,
      severity: 'critical' as const,
      wcagCriteria: ['4.1.2'],
      title: 'Les listes déroulantes doivent avoir un nom accessible',
      description: 'desc',
      pageUrls: [`https://example.com/page-${i}`, `https://example.com/page-${i + 1}`],
      occurrences: 2,
      elements: [
        {
          pageUrl: `https://example.com/page-${i}`,
          selector: `body > main > form.content-block-${i} > div.field-wrapper > select.country-picker-${i}`,
          snippet: '',
        },
      ],
      rawEvidence: {},
      dedupeKey: `dedupe-${id}`,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    };
  });
}

let browser: Browser;
let pagedjsSource: string;
let styles: string;

beforeAll(async () => {
  [{ browser }, pagedjsSource, styles] = await Promise.all([
    launchBrowser(),
    readPagedjsSource(),
    readStylesInlined(),
  ]);
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

/** Issue #303 gave every annex category an unconditional break-before:
 *  page, which is also what keeps this fixture's filler from pushing the
 *  heading into a strand at all. The defect-confirmation test below needs
 *  the pre-#303 layout to have anything to confirm, so it - and only it -
 *  turns that rule back off. The pipeline test renders with the real
 *  stylesheet. */
async function buildAppendixHtml(
  fillerMm: number,
  options: { withoutCategoryPageBreak?: boolean } = {},
): Promise<string> {
  const appendixHtml = renderFindingsAppendix(
    getStrings('fr'),
    12,
    'fr',
    buildRuleGroup(4),
    buildManifest(5),
    'general',
  );
  const groupMarker = '<div class="appendix-rule-group" data-appendix-rule-id=';
  const groupIndex = appendixHtml.indexOf(groupMarker);
  if (groupIndex === -1) throw new Error('rule group wrapper marker not found');
  const withFiller = `${appendixHtml.slice(0, groupIndex)}<div style="height:${fillerMm}mm"></div>${appendixHtml.slice(groupIndex)}`;
  const categoryBreakOverride = options.withoutCategoryPageBreak
    ? '<style>.appendix-category { break-before: auto; }</style>'
    : '';
  return `<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8" /><style>${styles}</style>${categoryBreakOverride}</head>
  <body><div style="font-family:var(--font-body);color:var(--color-text)">${withFiller}</div></body>
</html>`;
}

interface HeadingPlacement {
  headingOnPage: boolean;
  followedByTableWithRow: boolean;
  annexrefRowsOnPage: number;
}

/** Runs Paged.js once (no repair) and reports, for every page, whether a
 *  rule group heading sits there and whether its own detail table with at
 *  least one finding row follows it on that same page fragment. */
async function inspectHeadingPlacements(html: string): Promise<HeadingPlacement[]> {
  const context = await browser.newContext();
  const page: Page = await context.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.addScriptTag({ content: pagedjsSource });
    await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Paged = (globalThis as any).Paged;
      const previewer = new Paged.Previewer();
      await previewer.preview();
    });
    // Awaited explicitly so the promise settles before the finally block
    // closes the context (same reasoning as the thead-repeat suite).
    return await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.pagedjs_page')).map((pageEl) => {
        const heading = pageEl.querySelector('.appendix-rule-head');
        const table = heading?.nextElementSibling ?? null;
        return {
          headingOnPage: heading !== null,
          followedByTableWithRow:
            table !== null &&
            table.tagName === 'TABLE' &&
            table.querySelector('tr[id^="annexref-"]') !== null,
          annexrefRowsOnPage: pageEl.querySelectorAll('tr[id^="annexref-"]').length,
        };
      });
    });
  } finally {
    await context.close();
  }
}

describe('issue #170: an annex rule group heading never strands at a page bottom', () => {
  it('the fixture actually strands the heading when no repair runs (confirms the defect)', async () => {
    const placements = await inspectHeadingPlacements(
      await buildAppendixHtml(165, { withoutCategoryPageBreak: true }),
    );
    const headingPages = placements.filter((p) => p.headingOnPage);
    expect(headingPages.length).toBeGreaterThan(0);
    const stranded = headingPages.filter((p) => !p.followedByTableWithRow);
    expect(stranded.length).toBeGreaterThan(0);
    // The reported shape: the heading page carries none of the group's
    // finding rows - the whole table starts on the following page.
    expect(stranded.every((p) => p.annexrefRowsOnPage === 0)).toBe(true);
  });

  it('the production pipeline relocates the group whenever the heading would strand', async () => {
    // The measured strand window plus one height either side of it. Higher
    // fillers are deliberately excluded: once the filler itself crosses the
    // page boundary (it starts after the section head, so above ~183mm) the
    // fixed-height div's own fragment is malformed by Paged.js into a box
    // several page-widths wide - a synthetic-fixture artifact with no
    // counterpart in real report markup, which aborts on the overflow gate
    // for reasons unrelated to this issue.
    for (const fillerMm of [150, 158, 163, 168, 172, 176, 177, 178]) {
      const result = await renderPdfWithPageCountFromHtml(
        await buildAppendixHtml(fillerMm),
        browser,
      );
      expect(result.pageCount).toBeGreaterThanOrEqual(2);
      expect(result.pdf.length).toBeGreaterThan(1000);
    }
  });
}, 240_000);
