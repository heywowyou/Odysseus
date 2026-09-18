import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { launchBrowser } from '@odysseus/scanner';
import { renderHtml } from './render-html.js';
import { renderPdfWithPageCountFromHtml } from '../pdf.js';
import { REPORT_EMBEDDED_FONT_FAMILIES, findReportPdfIntegrityDefects } from '../pdf-integrity.js';
import { REPORT_PDF_CHROMIUM_ARGS } from '../index.js';
import { resolveRenderDiffEvidence } from '../screenshots.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../test-fixtures.js';

const pdffontsAvailable = spawnSync('pdffonts', ['-v']).error === undefined;

describe.skipIf(!pdffontsAvailable)('report fonts in a real generated PDF', () => {
  it('prints every glyph, URLs and selectors included, in a font the report embeds', async () => {
    const [manifest, findings, analysis] = await Promise.all([
      loadSmallSiteManifest(),
      loadSmallSiteFindings(),
      loadSmallSiteAnalysis('fr'),
    ]);
    const { pages: renderDiffEvidencePages } = resolveRenderDiffEvidence(manifest, findings);
    const html = await renderHtml({ manifest, findings, analysis, renderDiffEvidencePages });
    const { browser } = await launchBrowser({ extraArgs: REPORT_PDF_CHROMIUM_ARGS });
    let pdf: Buffer;
    let pageCount: number;
    try {
      ({ pdf, pageCount } = await renderPdfWithPageCountFromHtml(html, browser));
    } finally {
      await browser.close();
    }
    expect(findReportPdfIntegrityDefects(pdf, { language: 'fr', pageCount })).toEqual([]);
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-pdf-fonts-'));
    try {
      const file = path.join(dir, 'report.pdf');
      await fs.writeFile(file, pdf);
      const rows = spawnSync('pdffonts', [file], { encoding: 'utf8' })
        .stdout.split('\n')
        .slice(2)
        .filter(Boolean);
      const names = rows.map((row) => row.split(/\s+/)[0]!);
      expect(names.some((name) => name.endsWith('DejaVuSansMono'))).toBe(true);
      expect(names.filter((name) => !REPORT_EMBEDDED_FONT_FAMILIES.test(name))).toEqual([]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 120_000);
});
