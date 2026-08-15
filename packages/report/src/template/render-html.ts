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
import type { ReportTier, StoredAnalysis } from '../types.js';
import type { RenderDiffEvidencePage } from '../screenshots.js';
import { getStrings } from './strings/i18n.js';
import { renderCover } from './sections/cover.js';
import { renderToc } from './sections/toc.js';
import { renderStatistics } from './sections/statistics.js';
import { renderExecutiveSummary } from './sections/executive-summary.js';
import { renderConformanceSummary } from './sections/conformance-summary.js';
import { renderThemes } from './sections/themes.js';
import { renderObservations } from './sections/observations.js';
import { renderRenderDiffEvidence } from './sections/render-diff-evidence.js';
import { renderCoreWebVitalsTable } from './sections/core-web-vitals-table.js';
import { renderFindingsAppendix } from './sections/findings-appendix.js';
import { renderScreeningFindings } from './sections/screening-findings.js';
import { renderMethodology } from './sections/methodology.js';

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
  /** Milestone 8 addendum section 1.6. Defaults to 'full', matching this
   *  template's behavior before the tier split existed - every caller
   *  that predates this milestone keeps rendering the full audit view
   *  without needing to change. */
  tier?: ReportTier;
}

/** Screening gets a much shorter body: executive summary (without its
 *  full-only "what to do first"/quick-wins, which reference themes this
 *  tier never shows), the same aggregate WCAG conformance table the full
 *  tier shows (criterion/count/occurrence rollup, no selector detail, so
 *  it doesn't compromise the upsell the way page/selector-level detail
 *  would), the screening-findings section (capped top findings, in place
 *  of themes/observations/render-diff-evidence/core-web-vitals/full
 *  appendix), and methodology unchanged (the legal citation is core value
 *  at every tier, not detail being withheld for the upsell). See
 *  docs/milestone-8-scope-addendum.md section 1.6 for the original split
 *  and its business reasoning, extended for the conformance table by the
 *  2026-08-10 commercial-planning session. */
function renderBody(
  strings: ReturnType<typeof getStrings>,
  tier: ReportTier,
  manifest: AuditManifest,
  findings: Finding[],
  analysis: StoredAnalysis,
  renderDiffEvidencePages: RenderDiffEvidencePage[],
): string {
  if (tier === 'screening') {
    return [
      renderCover(strings, manifest, analysis, tier),
      renderToc(strings, tier),
      renderStatistics(strings, analysis.language, findings, manifest),
      renderExecutiveSummary(strings, analysis, tier),
      // Aggregate, no selector detail - same reasoning that already kept
      // this table in-scope for the full tier applies here (commercial
      // planning addendum, see docs/milestone-8-scope-addendum.md 1.6).
      renderConformanceSummary(strings, findings, analysis.language, analysis.obligationAssessment),
      renderScreeningFindings(strings, analysis.language, findings),
      renderMethodology(strings, manifest, analysis.language, analysis.obligationAssessment, findings, tier),
    ].join('\n');
  }

  return [
    renderCover(strings, manifest, analysis, tier),
    renderToc(strings, tier),
    renderStatistics(strings, analysis.language, findings, manifest),
    renderExecutiveSummary(strings, analysis, tier),
    renderConformanceSummary(strings, findings, analysis.language, analysis.obligationAssessment),
    renderThemes(strings, analysis, findings, manifest),
    renderObservations(strings, findings, manifest),
    renderRenderDiffEvidence(strings, analysis.language, manifest, renderDiffEvidencePages),
    renderCoreWebVitalsTable(strings, manifest),
    renderFindingsAppendix(strings, analysis.language, findings, manifest),
    renderMethodology(strings, manifest, analysis.language, analysis.obligationAssessment, findings),
  ].join('\n');
}

export async function renderHtml(input: RenderHtmlInput): Promise<string> {
  const { manifest, findings, analysis, renderDiffEvidencePages } = input;
  const tier = input.tier ?? 'full';
  const strings = getStrings(analysis.language);
  const css = await readReportCss();

  const body = renderBody(strings, tier, manifest, findings, analysis, renderDiffEvidencePages);

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
