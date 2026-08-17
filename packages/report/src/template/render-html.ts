/**
 * Composes the full HTML document handed to Chromium via page.setContent().
 * nocturne.css and paged.css are read from disk and inlined into <style>
 * tags rather than linked, because setContent() has no base URL to resolve
 * a relative stylesheet (or a relative @font-face url()) against - Paged.js's
 * own CSS parser throws on an unresolved relative url() with no base URL,
 * confirmed against a real render. The four Inter woff2 files are base64
 * data-URI-embedded into the inlined CSS text for the same reason: the
 * whole document must be a zero-network render, since a missing font fetch
 * would fail silently (or, for Paged.js, not so silently) and produce an
 * unstyled or broken client deliverable.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AuditManifest, AuditManualFields, Finding } from '@odysseus/core';
import type { StoredAnalysis } from '../types.js';
import type { RenderDiffEvidencePage } from '../screenshots.js';
import { getStrings } from './strings/i18n.js';
import { resolveLcenFinding } from './lcen-resolution.js';
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
import { escapeHtml } from './html-utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FONT_FILES = ['Inter-Regular.woff2', 'Inter-Medium.woff2', 'Inter-SemiBold.woff2', 'Inter-Bold.woff2'];

/** Resolves from this file's own __dirname the same way readReportCss used
 *  to (two levels below the package root whether run via tsx from src or
 *  from the compiled dist build), reaching the one committed copy of the
 *  design system either way, with no build-time copy step. */
async function readStylesInlined(): Promise<string> {
  const packageRoot = path.resolve(__dirname, '..', '..');
  const stylesDir = path.join(packageRoot, 'src', 'styles');
  const fontsDir = path.join(packageRoot, 'src', 'fonts');

  let nocturne = await fs.readFile(path.join(stylesDir, 'nocturne.css'), 'utf-8');
  const paged = await fs.readFile(path.join(stylesDir, 'paged.css'), 'utf-8');

  for (const fontFile of FONT_FILES) {
    const buffer = await fs.readFile(path.join(fontsDir, fontFile));
    const dataUri = `data:font/woff2;base64,${buffer.toString('base64')}`;
    nocturne = nocturne.replace(`../fonts/${fontFile}`, dataUri);
  }

  return `${nocturne}\n${paged}`;
}

export interface RenderHtmlInput {
  manifest: AuditManifest;
  findings: Finding[];
  analysis: StoredAnalysis;
  renderDiffEvidencePages: RenderDiffEvidencePage[];
  /** Count of pages that met the evidence-inclusion threshold before the
   *  top-3 cap (screenshots.ts's resolveRenderDiffEvidence), so section 08
   *  can state how many more pages share the same gap. */
  renderDiffTotalEligible?: number;
  /** B6: count of pages excluded from evidence consideration entirely
   *  because they're wrapper/legal-noindex pages (screenshots.ts's
   *  resolveRenderDiffEvidence). Lets section 08's positive-statement
   *  fallback name them as a named exception rather than staying silent
   *  about why the section has nothing else to show. */
  renderDiffWrapperOrLegalExcludedCount?: number;
  manualFields?: AuditManualFields;
}

/** Single-tier report body, since the 2026-08-16 commercial model drop of
 *  the paid screening tier (docs/offer-positioning.md): the full audit is
 *  now the only paid deliverable this package renders. The free,
 *  pre-purchase outreach preview introduced the same day
 *  (docs/outreach-rules.md) is a deliberately separate document kind with
 *  its own render path (see outreach-preview.ts), not a lighter tier of
 *  this function. Section order matches report.reference.html's 14
 *  numbered sheets plus the cover and table of contents. */
function renderBody(
  strings: ReturnType<typeof getStrings>,
  manifest: AuditManifest,
  findings: Finding[],
  analysis: StoredAnalysis,
  renderDiffEvidencePages: RenderDiffEvidencePage[],
  renderDiffTotalEligible: number,
  renderDiffWrapperOrLegalExcludedCount: number,
  manualFields: AuditManualFields | undefined,
): string {
  // B1: one Set shared by every reference-stat citation render site
  // (renderThemes, then renderFindingsAppendix's geo section), so the same
  // statistic can never appear twice across the document - previously
  // each section deduped only within itself.
  const citedStatIds = new Set<string>();

  // Manual-input-layer milestone: resolved once here, the same
  // document-wide assembly point citedStatIds already uses, so
  // findings-appendix and methodology's siren-provenance note see the
  // identical resolved/unresolved decision. See lcen-resolution.ts.
  const { findings: resolvedFindings, resolvedSirenSourceUrl } = resolveLcenFinding(
    findings,
    manualFields?.sirenSourceUrl?.value,
  );
  const sectorOverride = manualFields?.sector?.value;

  return [
    renderCover(strings, manifest, analysis, manualFields),
    renderToc(strings),
    renderExecutiveSummary(strings, analysis),
    renderLegalExposure(strings, analysis.language, analysis.obligationAssessment),
    renderStatistics(strings, analysis.language, resolvedFindings, manifest),
    renderThemes(strings, analysis, resolvedFindings, manifest, citedStatIds, sectorOverride),
    renderChecklist(strings, analysis.language, analysis, resolvedFindings, manifest),
    renderObservations(strings, resolvedFindings, manifest),
    renderConformanceSummary(strings, resolvedFindings, analysis.language),
    renderRenderDiffEvidence(
      strings,
      analysis.language,
      renderDiffEvidencePages,
      renderDiffTotalEligible,
      renderDiffWrapperOrLegalExcludedCount,
    ),
    renderCoreWebVitalsTable(strings, analysis.language, manifest),
    renderAccessibilityStatement(strings, analysis.language, resolvedFindings, manualFields),
    renderMethodology(
      strings,
      manifest,
      analysis.language,
      analysis.obligationAssessment,
      resolvedFindings,
      resolvedSirenSourceUrl,
    ),
    renderFindingsAppendix(
      strings,
      analysis.language,
      resolvedFindings,
      manifest,
      sectorOverride ?? analysis.obligationAssessment?.sector ?? 'general',
      citedStatIds,
    ),
    renderGlossary(strings),
    renderNextSteps(strings),
  ].join('\n');
}

export async function renderHtml(input: RenderHtmlInput): Promise<string> {
  const { manifest, findings, analysis, renderDiffEvidencePages, manualFields } = input;
  const renderDiffTotalEligible = input.renderDiffTotalEligible ?? renderDiffEvidencePages.length;
  const renderDiffWrapperOrLegalExcludedCount = input.renderDiffWrapperOrLegalExcludedCount ?? 0;
  const strings = getStrings(analysis.language);
  const inlinedStyles = await readStylesInlined();

  const body = renderBody(
    strings,
    manifest,
    findings,
    analysis,
    renderDiffEvidencePages,
    renderDiffTotalEligible,
    renderDiffWrapperOrLegalExcludedCount,
    manualFields,
  );

  return `<!doctype html>
<html lang="${analysis.language}">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(strings.cover.reportTitle)} - ${escapeHtml(manifest.siteUrl)}</title>
    <style>${inlinedStyles}</style>
  </head>
  <body>
    <div style="font-family:var(--font-body);color:var(--color-text)">
      ${body}
    </div>
  </body>
</html>`;
}
