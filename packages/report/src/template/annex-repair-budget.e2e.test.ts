/**
 * Issue #387. A real French report (a 21-page Full Scan, de-identified here
 * through scripts/deidentify-audit.mjs as annex-repair-budget) was refused
 * by the issue #170 gate with the unused-javascript annex heading stranded
 * at a page bottom. Traced on the production render: three of the five
 * annex repair passes each merged one stale reopened color-contrast table
 * (issue #312), Paged.js re-split all three at the same rows, and the last
 * pass's own repair stranded unused-javascript with no pass left to repair
 * it. Stale merges now have their own budget (pdf.ts,
 * MAX_STALE_CONTINUATION_MERGE_PASSES).
 *
 * The render goes through the real pipeline with its gates, so a stranded
 * or duplicated rule heading, or a layout-repeated bailout, fails the test
 * by aborting the render. The text layer then proves no finding row was
 * dropped along the way.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PDFParse } from 'pdf-parse';
import type { Browser } from 'playwright';
import type { AuditManifest, Finding, LlmOutput, ReportLanguage } from '@odysseus/core';
import { launchBrowser } from '@odysseus/scanner';
import { renderHtml } from './render-html.js';
import { renderPdfWithPageCountFromHtml } from '../pdf.js';
import { REPORT_PDF_CHROMIUM_ARGS } from '../index.js';
import { resolveRenderDiffEvidence } from '../screenshots.js';
import type { StoredAnalysis } from '../types.js';

const FIXTURE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../fixtures/test-audits/annex-repair-budget',
);

async function readJson<T>(relative: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.join(FIXTURE_DIR, relative), 'utf-8')) as T;
}

async function loadAnalysis(language: ReportLanguage): Promise<StoredAnalysis> {
  const entries = await fs.readdir(path.join(FIXTURE_DIR, 'analyses'));
  const file = entries
    .filter((name) => name.endsWith(`-${language}.json`))
    .sort()
    .at(-1);
  if (file === undefined) throw new Error(`No ${language} analysis in the fixture`);
  const parsed = await readJson<LlmOutput & { generatedAt: string }>(`analyses/${file}`);
  return { ...parsed, generatedAt: new Date(parsed.generatedAt) } as StoredAnalysis;
}

let browser: Browser;

beforeAll(async () => {
  ({ browser } = await launchBrowser({ extraArgs: REPORT_PDF_CHROMIUM_ARGS }));
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

describe('issue #387: stale continuation merges cannot use up the annex repair passes', () => {
  it('renders the French report with every annex finding row and no stranded heading', async () => {
    const [manifest, findings, analysis] = await Promise.all([
      readJson<AuditManifest>('manifest.json'),
      readJson<Finding[]>('findings.json'),
      loadAnalysis('fr'),
    ]);
    const { pages, totalEligible } = resolveRenderDiffEvidence(manifest, findings);
    const html = await renderHtml({
      manifest,
      findings,
      analysis,
      renderDiffEvidencePages: pages,
      renderDiffTotalEligible: totalEligible,
      manualFields: {
        nomCommercial: { value: 'Riviera Plage Hôtel', provenance: 'operator' },
        raisonSociale: { value: 'SAS Riviera Plage Hôtel', provenance: 'operator' },
        updatedAt: new Date('2026-09-17T00:00:00.000Z'),
      },
    });
    const annexRowIds = [...html.matchAll(/<tr id="annexref-([^"]+)"/gu)].map((m) => m[1]);
    expect(annexRowIds.length).toBeGreaterThan(0);

    const { pdf, pageCount } = await renderPdfWithPageCountFromHtml(html, browser);
    expect(pageCount).toBeGreaterThan(20);

    const parser = new PDFParse({ data: pdf });
    let text: string;
    try {
      text = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
    const missing = annexRowIds.filter((id) => !text.includes(id ?? ''));
    expect(missing).toEqual([]);
  }, 600_000);
});
