/**
 * Renders a stored analysis and the findings appendix into a report
 * PDF, exactly as the `odysseus report` CLI command does today -
 * extracted so `cli` and the queued pipeline share one implementation.
 * See audit-stage.ts's header for why this was extracted.
 */

import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import path from 'node:path';
import type { Connection } from 'mongoose';
import type { Browser } from 'playwright';
import {
  assertFindingsProvenance,
  assertSufficientCrawlCoverage,
  buildFindingsProvenance,
  type AuditManifest,
  type Finding,
  type FindingsProvenance,
  type ReportLanguage,
} from '@odysseus/core';
import {
  generateReportPdfVariants,
  reportPageCountWarning,
  REPORT_PDF_CHROMIUM_ARGS,
  REPORT_TEMPLATE_VERSION,
  type ReportPageCountWarning,
  type StoredAnalysis,
} from '@odysseus/report';
import { launchBrowser, readOdysseusBuildId } from '@odysseus/scanner';
import { persistReport } from '@odysseus/store';
import { pdfDigestOf } from './pdf-digest.js';
import { createConfiguredArtifactStore } from '../artifacts/configured-artifact-store.js';
import { syncArtifactFilesToBucket } from '../artifacts/sync-audit-artifacts.js';
import { resolveRenderInputs } from './build-render-bundle.js';

export interface ReportStageResult {
  reportId: string;
  reportPath: string;
  provenancePath: string;
  pdfDigest: string;
  generatedAt: Date;
  /** Measured Paged.js page count of the generated PDF (plan 018); read
   *  off the post-pagination DOM, never parsed back out of the PDF. */
  pageCount: number;
  lightReportPath?: string;
  lightPdfDigest?: string;
  lightPageCount?: number;
  lightVariantWarning?: {
    code: 'light-render-failed';
    message: string;
  };
  /** Present only when pageCount exceeds REPORT_PAGE_COUNT_WARNING_
   *  THRESHOLD. The report above it is still persisted and deliverable;
   *  this only carries the length to the CLI and the dashboard, it is not
   *  a freshness or approval state. */
  pageCountWarning?: ReportPageCountWarning;
}

function timestampForFilename(date: Date): string {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/:/g, '-');
}

function filenameToken(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function lightReportPath(reportPath: string): string {
  return reportPath.replace(/\.pdf$/u, '-clair.pdf');
}

export async function runReportStage(
  auditDir: string,
  manifest: AuditManifest,
  findings: Finding[],
  analysis: StoredAnalysis,
  connection: Connection,
  /** Issue #6: runAllReportsStage launches one browser and passes it here
   *  for both the French and English pass, instead of a fresh Chromium
   *  launch per language. Absent for a standalone single-language render
   *  (the CLI's `odysseus report`), which still gets its own browser from
   *  generateReportPdf, unchanged from before. */
  browser?: Browser,
  /** Computed once per job by the queued pipeline over the same findings
   *  array both language passes receive, so the canonicalize plus hash
   *  runs once per job instead of twice. Omitted means a standalone
   *  single-language render, which computes it here exactly as before. */
  findingsProvenance?: FindingsProvenance,
): Promise<ReportStageResult> {
  // Recheck persisted crawl facts before every render. This covers reports
  // regenerated after an interrupted queue run as well as the normal job
  // path, and prevents a client-facing PDF from describing a rejected crawl.
  assertSufficientCrawlCoverage({
    pages: manifest.pages,
    ...(manifest.crawl.sitemapCoverage !== undefined
      ? { sitemapCoverage: manifest.crawl.sitemapCoverage }
      : {}),
  });
  const resolvedFindingsProvenance = findingsProvenance ?? buildFindingsProvenance(findings);
  assertFindingsProvenance(manifest.findingsProvenance, resolvedFindingsProvenance, 'manifest');
  assertFindingsProvenance(analysis.findingsProvenance, resolvedFindingsProvenance, 'analysis');
  if (analysis.analysisId === undefined) {
    throw new Error(
      'Report generation aborted: legacy analysis has no analysis ID. Run normalize, ' +
        'regenerate the structure and both analyses, then regenerate the report.',
    );
  }
  if (analysis.auditId !== manifest.auditId) {
    throw new Error('Report generation aborted: analysis belongs to a different audit.');
  }

  const reportId = randomUUID();
  const generatedAt = new Date();
  const rendererBuild = readOdysseusBuildId();
  const renderMetadata = {
    reportId,
    renderedAt: generatedAt,
    rendererBuild,
    templateVersion: REPORT_TEMPLATE_VERSION,
  };
  // Plan 072: every render-time read lives in resolveRenderInputs, which the
  // hosted render-bundle route calls too, so an operator re-rendering this
  // report on their own machine assembles exactly what this stage would.
  const artifactStore = createConfiguredArtifactStore();
  const renderInputs = await resolveRenderInputs({
    connection,
    auditDir,
    manifest,
    findings,
    analysis,
    findingsProvenance: resolvedFindingsProvenance,
    artifactStore,
  });
  const { obligationAssessment, ...pdfInputs } = renderInputs;

  const renderedVariants = await generateReportPdfVariants({
    auditDir,
    manifest,
    findings,
    renderMetadata,
    analysis: {
      ...analysis,
      ...(obligationAssessment !== undefined ? { obligationAssessment } : {}),
    },
    ...pdfInputs,
    ...(browser !== undefined ? { browser } : {}),
  });
  const { pdf, pageCount } = renderedVariants.dark;

  const pdfDigest = pdfDigestOf(pdf);
  const reportsDir = path.join(auditDir, 'reports');
  await fs.mkdir(reportsDir, { recursive: true });
  const reportPath = path.join(
    reportsDir,
    `${timestampForFilename(generatedAt)}-t${renderMetadata.templateVersion}-${filenameToken(rendererBuild)}-${reportId}-${analysis.language}.pdf`,
  );
  await fs.writeFile(reportPath, pdf);

  const lightPath = lightReportPath(reportPath);
  const lightPdfDigest =
    renderedVariants.light === undefined ? undefined : pdfDigestOf(renderedVariants.light.pdf);
  if (renderedVariants.light !== undefined) {
    await fs.writeFile(lightPath, renderedVariants.light.pdf);
  }
  const lightVariantWarning =
    renderedVariants.lightError === undefined
      ? undefined
      : {
          code: 'light-render-failed' as const,
          message: renderedVariants.lightError.message,
        };

  const provenancePath = `${reportPath}.provenance.json`;
  const reportProvenance = {
    reportId,
    analysisId: analysis.analysisId,
    findingsProvenance: resolvedFindingsProvenance,
    rendererVersion: REPORT_TEMPLATE_VERSION,
    rendererBuild,
    reportTemplateVersion: REPORT_TEMPLATE_VERSION,
    pdfDigest,
    pageCount,
    // Issue #62: the artifacts root is per-machine while the database is
    // shared, so a row whose file is missing on one machine usually
    // points at the machine named here. Recorded on the sidecar and the
    // row alike, via the spread below.
    renderedOnHost: hostname(),
    ...(renderedVariants.light === undefined
      ? {}
      : {
          variants: {
            light: {
              fileRef: path.relative(auditDir, lightPath),
              pdfDigest: lightPdfDigest!,
              pageCount: renderedVariants.light.pageCount,
            },
          },
        }),
    ...(lightVariantWarning === undefined ? {} : { lightVariantWarning }),
  };
  await fs.writeFile(
    provenancePath,
    JSON.stringify({ ...reportProvenance, generatedAt: generatedAt.toISOString() }, null, 2),
  );

  await persistReport(connection, {
    ...reportProvenance,
    auditId: manifest.auditId,
    language: analysis.language,
    analysisGeneratedAt: analysis.generatedAt,
    fileRef: path.relative(auditDir, reportPath),
    generatedAt,
    ...(renderedVariants.light === undefined
      ? {}
      : {
          variants: {
            light: {
              fileRef: path.relative(auditDir, lightPath),
              pdfDigest: lightPdfDigest!,
              pageCount: renderedVariants.light.pageCount,
            },
          },
        }),
  });

  // Issue #63: after the local write and the DB row both succeeded, same
  // ordering rule as audit-stage.ts's own sync call.
  await syncArtifactFilesToBucket(
    artifactStore,
    auditDir,
    new URL(manifest.siteUrl).hostname,
    new Date(manifest.startedAt),
    [reportPath, provenancePath, ...(renderedVariants.light === undefined ? [] : [lightPath])],
  );

  const pageCountWarning = reportPageCountWarning(pageCount);
  return {
    reportId,
    reportPath,
    provenancePath,
    pdfDigest,
    generatedAt,
    pageCount,
    ...(renderedVariants.light === undefined ? {} : { lightReportPath: lightPath }),
    ...(lightPdfDigest === undefined ? {} : { lightPdfDigest }),
    ...(renderedVariants.light === undefined
      ? {}
      : { lightPageCount: renderedVariants.light.pageCount }),
    ...(lightVariantWarning === undefined ? {} : { lightVariantWarning }),
    ...(pageCountWarning !== undefined ? { pageCountWarning } : {}),
  };
}

export interface AllReportsStageResult {
  language: ReportLanguage;
  reportPath: string;
  lightReportPath?: string;
  lightPdfDigest?: string;
  lightPageCount?: number;
  lightVariantWarning?: ReportStageResult['lightVariantWarning'];
  generatedAt: Date;
  /** Same measured page count and warning semantics as ReportStageResult. */
  pageCount: number;
  pageCountWarning?: ReportPageCountWarning;
}

/**
 * Commercial-planning addendum, 2026-08-10, superseded 2026-08-16
 * (docs/rules/offer-positioning.md): this used to render four (language, tier)
 * combinations for the two-tier commercial model. The paid screening
 * tier is dropped; every completed audit already has one StoredAnalysis
 * per language (analysis-stage.ts runs once per language), so this now
 * Plan 067 makes French the canonical deliverable. This helper always
 * renders French and renders English only when an explicit English analysis
 * is supplied. No re-scan and no LLM call happen here.
 *
 * Sequential, matching runFullAuditJob's own report-fr-then-report-en
 * ordering, rather than Promise.all: bounds concurrent Chromium PDF
 * renders to one at a time, and keeps a mid-run failure's error
 * attributable to a single language instead of an aggregated rejection.
 *
 * Issue #6: one Chromium instance is launched here and passed to both
 * language passes instead of runReportStage/generateReportPdf each
 * launching and closing their own - launch overhead was paid twice per
 * audit for no reason, since nothing about the browser process itself is
 * language-specific. Pagination still runs once per language inside that
 * shared browser: French and English text lengths differ enough that page
 * breaks genuinely differ, so only the launch is shared, not the layout.
 */
export async function runAllReportsStage(
  auditDir: string,
  manifest: AuditManifest,
  findings: Finding[],
  analyses: { fr: StoredAnalysis; en?: StoredAnalysis },
  connection: Connection,
  /** Threaded through to each runReportStage call so the fr and en passes
   *  share one provenance computation instead of hashing the same findings
   *  array twice. Omitted means each pass computes its own, exactly as
   *  before. */
  findingsProvenance?: FindingsProvenance,
): Promise<AllReportsStageResult[]> {
  const results: AllReportsStageResult[] = [];

  const { browser } = await launchBrowser({ extraArgs: REPORT_PDF_CHROMIUM_ARGS });
  try {
    const languages: ReportLanguage[] = analyses.en === undefined ? ['fr'] : ['fr', 'en'];
    for (const language of languages) {
      const analysis = language === 'fr' ? analyses.fr : analyses.en!;
      const {
        reportPath,
        lightReportPath,
        lightPdfDigest,
        lightPageCount,
        lightVariantWarning,
        generatedAt,
        pageCount,
        pageCountWarning,
      } = await runReportStage(
        auditDir,
        manifest,
        findings,
        analysis,
        connection,
        browser,
        findingsProvenance,
      );
      results.push({
        language,
        reportPath,
        ...(lightReportPath === undefined ? {} : { lightReportPath }),
        ...(lightPdfDigest === undefined ? {} : { lightPdfDigest }),
        ...(lightPageCount === undefined ? {} : { lightPageCount }),
        ...(lightVariantWarning === undefined ? {} : { lightVariantWarning }),
        generatedAt,
        pageCount,
        ...(pageCountWarning !== undefined ? { pageCountWarning } : {}),
      });
    }
  } finally {
    await browser.close();
  }

  return results;
}
