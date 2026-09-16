/**
 * Renders a stored analysis and the findings appendix into a bilingual
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
  buildReportPreparationPreview,
  computeFindingsDelta,
  type AuditManifest,
  type Finding,
  type FindingsProvenance,
  type ReportLanguage,
} from '@odysseus/core';
import {
  generateReportPdf,
  reportPageCountWarning,
  REPORT_PDF_CHROMIUM_ARGS,
  REPORT_TEMPLATE_VERSION,
  type ReportPageCountWarning,
  type StoredAnalysis,
} from '@odysseus/report';
import { launchBrowser, readOdysseusBuildId } from '@odysseus/scanner';
import {
  findDeltaBaseline,
  getAuditGradeOverride,
  getAuditManualFields,
  getReportPreparation,
  persistReport,
} from '@odysseus/store';
import { runObligationStage } from './obligation-stage.js';
import { pdfDigestOf } from './pdf-digest.js';
import { createConfiguredArtifactStore } from '../artifacts/configured-artifact-store.js';
import { syncArtifactFilesToBucket } from '../artifacts/sync-audit-artifacts.js';

export interface ReportStageResult {
  reportId: string;
  reportPath: string;
  provenancePath: string;
  pdfDigest: string;
  generatedAt: Date;
  /** Measured Paged.js page count of the generated PDF (plan 018); read
   *  off the post-pagination DOM, never parsed back out of the PDF. */
  pageCount: number;
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
  // Manual-input-layer milestone: manual fields are read fresh from the
  // store here, at render time, rather than trusted from whatever was
  // baked into `analysis` when it was generated - this is what lets the
  // operator edit them after the fact with no rescan and no new analysis
  // document (see AuditManualFields's own doc comment in @odysseus/core
  // and CLAUDE.md's manual-input-layer milestone). The obligation
  // assessment specifically is recomputed fresh too: it is not fed to the
  // LLM (only spliced into the report's legal section), so recomputing it
  // here costs nothing and picks up a manualFields.siren saved after the
  // scan - resolveEffectiveSiren's existing extracted-vs-manual precedence
  // is reused unchanged, "manual" now just means "freshest at render
  // time" instead of "given at job creation."
  const manualFields = await getAuditManualFields(connection, manifest.auditId);
  // Issue: operator-reviewed overall grade override, read fresh at render
  // time exactly like manualFields above - the operator can review the
  // grade after the fact with no rescan and no new analysis document.
  const gradeOverride = await getAuditGradeOverride(connection, manifest.auditId);
  const obligationAssessment = manualFields?.transactionalFlowOverride
    ? await runObligationStage(
        manifest,
        connection,
        manualFields?.siren?.value,
        manualFields.transactionalFlowOverride
          ? { hasTransactionalFlow: manualFields.transactionalFlowOverride }
          : undefined,
      )
    : analysis.obligationAssessment;

  // Plan 019: resolve the bounded preparation preview here, at the
  // orchestration boundary, so render-html.ts never queries storage or
  // derives preparation policy. Evidence-unavailable artifacts degrade the
  // preview inside core instead of failing the render.
  const preparationAggregate = await getReportPreparation(connection, manifest.auditId);
  const preparationPreview = buildReportPreparationPreview({
    preparation: preparationAggregate,
    commercialName: manualFields?.nomCommercial?.value,
    findings,
  });

  // Plan 051: a new audit of a site whose earlier audit was delivered is a
  // re-audit, and its report compares the two runs finding by finding. The
  // delta is computed here from stored data and passed in verbatim; the
  // template never reads a second findings set itself.
  const baseline = await findDeltaBaseline(connection, {
    siteUrl: manifest.siteUrl,
    startedAt: new Date(manifest.startedAt),
  });
  const delta =
    baseline === null
      ? undefined
      : computeFindingsDelta(baseline, {
          auditId: manifest.auditId,
          siteUrl: manifest.siteUrl,
          startedAt: manifest.startedAt,
          tool: manifest.tool,
          config: manifest.config,
          findingsProvenance: resolvedFindingsProvenance,
          findings,
        });

  const { pdf, pageCount } = await generateReportPdf({
    auditDir,
    manifest,
    findings,
    renderMetadata,
    analysis: {
      ...analysis,
      ...(obligationAssessment !== undefined ? { obligationAssessment } : {}),
    },
    ...(manualFields !== undefined ? { manualFields } : {}),
    preparation: preparationPreview[analysis.language],
    ...(gradeOverride !== undefined ? { gradeOverride } : {}),
    ...(delta !== undefined ? { delta } : {}),
    ...(browser !== undefined ? { browser } : {}),
  });

  const pdfDigest = pdfDigestOf(pdf);
  const reportsDir = path.join(auditDir, 'reports');
  await fs.mkdir(reportsDir, { recursive: true });
  const reportPath = path.join(
    reportsDir,
    `${timestampForFilename(generatedAt)}-t${renderMetadata.templateVersion}-${filenameToken(rendererBuild)}-${reportId}-${analysis.language}.pdf`,
  );
  await fs.writeFile(reportPath, pdf);

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
  });

  // Issue #63: after the local write and the DB row both succeeded, same
  // ordering rule as audit-stage.ts's own sync call.
  await syncArtifactFilesToBucket(
    createConfiguredArtifactStore(),
    auditDir,
    new URL(manifest.siteUrl).hostname,
    new Date(manifest.startedAt),
    [reportPath, provenancePath],
  );

  const pageCountWarning = reportPageCountWarning(pageCount);
  return {
    reportId,
    reportPath,
    provenancePath,
    pdfDigest,
    generatedAt,
    pageCount,
    ...(pageCountWarning !== undefined ? { pageCountWarning } : {}),
  };
}

export interface AllReportsStageResult {
  language: ReportLanguage;
  reportPath: string;
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
 * generates exactly the two full-audit report renders, one per language,
 * reusing runReportStage per language rather than duplicating its
 * PDF-generation and persistReport logic. No re-scan, no second LLM
 * call.
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
  analyses: { fr: StoredAnalysis; en: StoredAnalysis },
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
    for (const language of ['fr', 'en'] as const) {
      const { reportPath, generatedAt, pageCount, pageCountWarning } = await runReportStage(
        auditDir,
        manifest,
        findings,
        analyses[language],
        connection,
        browser,
        findingsProvenance,
      );
      results.push({
        language,
        reportPath,
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
