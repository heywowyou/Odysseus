/**
 * Composes the full HTML document handed to Chromium via page.setContent().
 * report.css is read from disk and inlined into a <style> tag rather than
 * linked, because setContent() has no base URL to resolve a relative
 * stylesheet against, and the whole document must be a zero-network
 * render: nothing here may reference an external URL, since a missing
 * CDN or font fetch would fail silently and produce an unstyled client
 * deliverable.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuditManifest, Finding } from '@odysseus/core';
import type { StoredAnalysis } from '../types.js';
import type { RenderDiffEvidencePage } from '../screenshots.js';
import { getStrings } from './strings/i18n.js';
import { renderCover } from './sections/cover.js';
import { renderToc } from './sections/toc.js';
import { renderStatistics } from './sections/statistics.js';
import { renderExecutiveSummary } from './sections/executive-summary.js';
import { renderLegalExposure } from './sections/legal-exposure.js';
import { renderConformanceSummary } from './sections/conformance-summary.js';
import { renderThemes } from './sections/themes.js';
import { renderChecklist } from './sections/checklist.js';
import { renderObservations } from './sections/observations.js';
import { renderRenderDiffEvidence } from './sections/render-diff-evidence.js';
import { renderCoreWebVitalsTable } from './sections/core-web-vitals-table.js';
import { renderAccessibilityStatement } from './sections/accessibility-statement.js';
import { renderFindingsAppendix } from './sections/findings-appendix.js';
import { renderMethodology } from './sections/methodology.js';
import { renderGlossary } from './sections/glossary.js';
import { renderNextSteps } from './sections/next-steps.js';

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

/** Single-tier report body, since the 2026-08-16 commercial model drop of
 *  the paid screening tier (docs/offer-positioning.md): the full audit is
 *  now the only paid deliverable this package renders. The free,
 *  pre-purchase outreach preview introduced the same day
 *  (docs/outreach-rules.md) is a deliberately separate document kind with
 *  its own render path (see outreach-preview.ts), not a lighter tier of
 *  this function. */
function renderBody(
  strings: ReturnType<typeof getStrings>,
  manifest: AuditManifest,
  findings: Finding[],
  analysis: StoredAnalysis,
  renderDiffEvidencePages: RenderDiffEvidencePage[],
): string {
  return [
    renderCover(strings, manifest, analysis),
    renderToc(strings),
    renderExecutiveSummary(strings, analysis),
    renderLegalExposure(strings, analysis.language, analysis.obligationAssessment),
    renderStatistics(strings, analysis.language, findings, manifest),
    renderThemes(strings, analysis, findings, manifest),
    renderChecklist(strings, analysis.language, analysis, findings, manifest),
    renderObservations(strings, findings, manifest),
    renderConformanceSummary(strings, findings, analysis.language, analysis.obligationAssessment),
    renderRenderDiffEvidence(strings, analysis.language, manifest, renderDiffEvidencePages),
    renderCoreWebVitalsTable(strings, manifest),
    renderAccessibilityStatement(strings, analysis.language, findings),
    renderMethodology(strings, manifest, analysis.language, analysis.obligationAssessment, findings),
    renderFindingsAppendix(strings, analysis.language, findings, manifest),
    renderGlossary(strings),
    renderNextSteps(strings),
  ].join('\n');
}

export async function renderHtml(input: RenderHtmlInput): Promise<string> {
  const { manifest, findings, analysis, renderDiffEvidencePages } = input;
  const strings = getStrings(analysis.language);
  const css = await readReportCss();

  const body = renderBody(strings, manifest, findings, analysis, renderDiffEvidencePages);

  return `<!doctype html>
<html lang="${analysis.language}">
  <head>
    <meta charset="utf-8" />
    <title>${strings.cover.reportTitle}</title>
    <style>${css}</style>
  </head>
  <body>
    <div class="doc">
      ${body}
    </div>
  </body>
</html>`;
}
