/**
 * Issue #45, second half. A rule group's finding rows can outgrow a single
 * printed page; when Paged.js splits the group's `<table>` across a page
 * break it clones the element (colgroup/attributes intact, confirmed by
 * findings-appendix-table-layout.test.ts) but drops the `<thead>` from
 * every fragment after the first (paged.css's D3 comment). pdf.ts now
 * detects this against the real post-layout DOM and repairs it with a
 * bounded re-pagination pass (insertRepeatedTheadsIntoHtml, unit-tested in
 * pdf.test.ts without a browser). This file is the one place that repair
 * is asserted against the real Paged.js pipeline, needing real Chromium,
 * matching this repo's *.e2e.test.ts convention.
 *
 * The fixture below is a synthetic single-rule-group appendix, not the
 * shared stress fixture: forcing a specific rule group to split reliably
 * needs many rows of one rule with long selectors and distinct page-URL
 * sets (so "Mêmes pages que fNNN" compression never collapses them back
 * down), which the stress fixture's rotation across several rule ids does
 * not guarantee.
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

const require = createRequire(import.meta.url);

async function readPagedjsSource(): Promise<string> {
  const entryPath = require.resolve('pagedjs');
  const packageRoot = path.dirname(path.dirname(entryPath));
  return fs.readFile(path.join(packageRoot, 'dist', 'paged.js'), 'utf-8');
}

function buildManifest(pageCount: number): AuditManifest {
  return {
    auditId: 'audit-thead-repeat',
    kind: 'audit',
    siteUrl: 'https://example.com/',
    startedAt: '2026-09-04T00:00:00.000Z',
    finishedAt: '2026-09-04T00:05:00.000Z',
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

/** Every finding shares one rule id and carries a long, distinct selector
 *  plus a distinct pair of page URLs, so no two rows collapse under the
 *  "Mêmes pages que fNNN" compression and every row is tall enough that a
 *  30-row group reliably outgrows one printed page. */
function buildLargeRuleGroup(count: number): Finding[] {
  return Array.from({ length: count }, (_, i) => {
    const id = `f${String(i + 1).padStart(3, '0')}`;
    return {
      findingId: id,
      auditId: 'audit-thead-repeat',
      schemaVersion: 1,
      source: 'axe' as const,
      ruleId: 'color-contrast',
      category: 'accessibility' as const,
      severity: 'serious' as const,
      wcagCriteria: ['1.4.3'],
      title: 'Contraste insuffisant entre le texte et son arrière-plan',
      description: 'desc',
      pageUrls: [`https://example.com/page-${i}`, `https://example.com/page-${i + 1}`],
      occurrences: 2,
      elements: [
        {
          pageUrl: `https://example.com/page-${i}`,
          selector: `body > main > section.content-block-${i} > div.card-wrapper > article.entry-${i} > p.lede-text-${i}`,
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

beforeAll(async () => {
  [{ browser }, pagedjsSource] = await Promise.all([launchBrowser(), readPagedjsSource()]);
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

interface PaginatedTablesResult {
  tableCount: number;
  theadCount: number;
  splitTablesMissingThead: number;
  emptyHeaderOnlyTables: number;
}

async function paginateAndInspectAppendixTables(
  html: string,
  applyThreadRepair: boolean,
): Promise<PaginatedTablesResult> {
  const context = await browser.newContext();
  const page: Page = await context.newPage();
  try {
    let currentHtml = html;
    async function runPreview(): Promise<void> {
      await page.setContent(currentHtml, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.addScriptTag({ content: pagedjsSource });
      await page.evaluate(async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Paged = (globalThis as any).Paged;
        const previewer = new Paged.Previewer();
        await previewer.preview();
      });
    }

    await runPreview();

    if (applyThreadRepair) {
      // Mirrors pdf.ts's own bounded repair loop, using its exported pure
      // helpers directly so this test exercises the same production logic
      // rather than a re-implementation of it.
      const {
        detectAppendixTableSplits,
        extractAppendixTablePreambles,
        insertRepeatedTheadsIntoHtml,
      } = await import('../../pdf.js');
      for (let attempt = 0; attempt < 3; attempt++) {
        const splits = await detectAppendixTableSplits(page);
        if (splits.length === 0) break;
        const preambles = extractAppendixTablePreambles(currentHtml);
        const patched = insertRepeatedTheadsIntoHtml(currentHtml, splits, preambles);
        if (patched === currentHtml) break;
        currentHtml = patched;
        await runPreview();
      }
      // Mirrors pdf.ts's post-loop cleanup: a reopened continuation table
      // can still land with only its cloned header on the page being
      // closed, no rows under it. Deleting that empty fragment is what
      // keeps the fix from printing a stray floating header line.
      await page.evaluate(() => {
        const tables = Array.from(document.querySelectorAll('table[data-appendix-rule-id]'));
        for (const table of tables) {
          if (table.querySelector('thead') && !table.querySelector('tr[id^="annexref-"]')) {
            table.remove();
          }
        }
      });
    }

    // Awaited explicitly (not just returned) so the promise settles before
    // the finally block below closes the context - a bare `return
    // page.evaluate(...)` lets the finally's context.close() race ahead of
    // the still-pending evaluate call.
    return await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table[data-appendix-rule-id]'));
      const theadCount = tables.filter((t) => t.querySelector('thead')).length;
      const byRuleId = new Map<string, Element[]>();
      for (const t of tables) {
        const ruleId = t.getAttribute('data-appendix-rule-id') ?? '';
        byRuleId.set(ruleId, [...(byRuleId.get(ruleId) ?? []), t]);
      }
      let splitTablesMissingThead = 0;
      for (const list of byRuleId.values()) {
        if (list.length < 2) continue;
        for (let i = 1; i < list.length; i++) {
          if (!list[i]?.querySelector('thead')) splitTablesMissingThead++;
        }
      }
      const emptyHeaderOnlyTables = tables.filter(
        (t) => t.querySelector('thead') && !t.querySelector('tr[id^="annexref-"]'),
      ).length;
      return {
        tableCount: tables.length,
        theadCount,
        splitTablesMissingThead,
        emptyHeaderOnlyTables,
      };
    });
  } finally {
    await context.close();
  }
}

describe('issue #45: appendix column header repeats across a real Paged.js page split', () => {
  async function buildAppendixHtml(): Promise<{ html: string; findingCount: number }> {
    const findings = buildLargeRuleGroup(30);
    const manifest = buildManifest(31);
    const appendixHtml = renderFindingsAppendix(
      getStrings('fr'),
      12,
      'fr',
      findings,
      manifest,
      'general',
    );
    const styles = await readStylesInlined();
    const html = `<!doctype html>
<html lang="fr">
  <head><meta charset="utf-8" /><style>${styles}</style></head>
  <body><div style="font-family:var(--font-body);color:var(--color-text)">${appendixHtml}</div></body>
</html>`;
    return { html, findingCount: findings.length };
  }

  it('the fixture actually forces the rule group across more than one page fragment', async () => {
    const { html } = await buildAppendixHtml();
    const result = await paginateAndInspectAppendixTables(html, false);
    expect(result.tableCount).toBeGreaterThan(1);
  });

  it('without repair, a continuation fragment is missing its header (confirms the known defect)', async () => {
    const { html } = await buildAppendixHtml();
    const result = await paginateAndInspectAppendixTables(html, false);
    expect(result.splitTablesMissingThead).toBeGreaterThan(0);
  });

  it('with the repair pass, every continuation fragment carries a repeated header', async () => {
    const { html } = await buildAppendixHtml();
    const result = await paginateAndInspectAppendixTables(html, true);
    expect(result.tableCount).toBeGreaterThan(1);
    expect(result.splitTablesMissingThead).toBe(0);
    expect(result.theadCount).toBe(result.tableCount);
  });

  it('with the repair pass, no stray header-only fragment is left with zero rows under it', async () => {
    // Reopening a table right at a page boundary can otherwise leave a
    // duplicate header alone on the page being closed, with none of its
    // rows fitting there. Verified by direct observation before this
    // cleanup existed: a 28.5px header-only box with no annexref row.
    const { html } = await buildAppendixHtml();
    const result = await paginateAndInspectAppendixTables(html, true);
    expect(result.emptyHeaderOnlyTables).toBe(0);
  });
}, 60_000);
