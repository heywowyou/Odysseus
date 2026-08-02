/**
 * Composes the full HTML document handed to Chromium via page.setContent().
 * report.css is read from disk and inlined into a <style> tag rather than
 * linked, because setContent() has no base URL to resolve a relative
 * stylesheet against, and the entire point of precompiling instead of a
 * Tailwind CDN is a zero-network render: nothing here may reference an
 * external URL.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuditManifest, Finding } from '@odysseus/core';
import type { StoredAnalysis } from '../types.js';
import type { RenderDiffEvidencePage } from '../screenshots.js';
import { getStrings } from './strings/i18n.js';
import { renderCover } from './sections/cover.js';
import { renderExecutiveSummary } from './sections/executive-summary.js';
import { renderWhatToDoFirst } from './sections/quick-wins.js';
import { renderThemes } from './sections/themes.js';
import { renderRenderDiffEvidence } from './sections/render-diff-evidence.js';
import { renderCoreWebVitalsTable } from './sections/core-web-vitals-table.js';
import { renderFindingsAppendix } from './sections/findings-appendix.js';
import { renderMethodology } from './sections/methodology.js';
import { renderLimitations } from './sections/limitations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** report.css is committed only under src/template/ (see the "why the
 *  compiled CSS lives under src" note in the milestone plan), never
 *  duplicated into dist/. This file's own __dirname is
 *  <package-root>/src/template when run via tsx and
 *  <package-root>/dist/template when run from the compiled build; both
 *  are two levels below the package root, so resolving from there reaches
 *  the one committed copy in either case, with no build-time copy step. */
async function readReportCss(): Promise<string> {
  const packageRoot = path.resolve(__dirname, '..', '..');
  return fs.readFile(path.join(packageRoot, 'src', 'template', 'report.css'), 'utf-8');
}

export interface RenderHtmlInput {
  manifest: AuditManifest;
  findings: Finding[];
  analysis: StoredAnalysis;
  renderDiffEvidencePages: RenderDiffEvidencePage[];
}

export async function renderHtml(input: RenderHtmlInput): Promise<string> {
  const { manifest, findings, analysis, renderDiffEvidencePages } = input;
  const strings = getStrings(analysis.language);
  const css = await readReportCss();

  const body = [
    renderCover(strings, manifest.siteUrl, new Date(manifest.startedAt), analysis.language),
    renderExecutiveSummary(strings, analysis),
    renderWhatToDoFirst(strings, analysis, findings),
    renderThemes(strings, analysis, findings),
    renderRenderDiffEvidence(strings, renderDiffEvidencePages),
    renderCoreWebVitalsTable(strings, manifest),
    renderFindingsAppendix(strings, findings),
    renderMethodology(strings, manifest),
    renderLimitations(strings),
  ].join('\n');

  return `<!doctype html>
<html lang="${analysis.language}">
  <head>
    <meta charset="utf-8" />
    <title>${strings.cover.reportTitle}</title>
    <style>${css}</style>
  </head>
  <body class="bg-white text-slate-900">
    <main class="mx-auto max-w-3xl px-4">
      ${body}
    </main>
  </body>
</html>`;
}
