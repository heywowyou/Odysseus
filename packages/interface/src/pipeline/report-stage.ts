/**
 * Renders a stored analysis and the findings appendix into a bilingual
 * PDF, exactly as the `odysseus report` CLI command does today -
 * extracted so `cli` and the queued pipeline share one implementation.
 * See audit-stage.ts's header for why this was extracted.
 */

import { promises as fs } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Connection } from 'mongoose';
import {
  assertFindingsProvenance,
  buildFindingsProvenance,
  type AuditManifest,
  type Finding,
  type ReportLanguage,
} from '@odysseus/core';
import { generateReportPdf, REPORT_TEMPLATE_VERSION, type StoredAnalysis } from '@odysseus/report';
import { readOdysseusBuildId } from '@odysseus/scanner';
import { getAuditManualFields, persistReport } from '@odysseus/store';
import { runObligationStage } from './obligation-stage.js';

export interface ReportStageResult {
  reportId: string;
  reportPath: string;
  provenancePath: string;
  pdfDigest: string;
  generatedAt: Date;
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
): Promise<ReportStageResult> {
  const findingsProvenance = buildFindingsProvenance(findings);
  assertFindingsProvenance(manifest.findingsProvenance, findingsProvenance, 'manifest');
  assertFindingsProvenance(analysis.findingsProvenance, findingsProvenance, 'analysis');
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
  const obligationAssessment = manualFields?.siren
    ? await runObligationStage(manifest, connection, manualFields.siren.value)
    : analysis.obligationAssessment;

  const pdf = await generateReportPdf({
    auditDir,
    manifest,
    findings,
    renderMetadata,
    analysis: {
      ...analysis,
      ...(obligationAssessment !== undefined ? { obligationAssessment } : {}),
    },
    ...(manualFields !== undefined ? { manualFields } : {}),
  });

  const pdfDigest = `sha256:${createHash('sha256').update(pdf).digest('hex')}`;
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
    findingsProvenance,
    rendererVersion: REPORT_TEMPLATE_VERSION,
    rendererBuild,
    reportTemplateVersion: REPORT_TEMPLATE_VERSION,
    pdfDigest,
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

  return { reportId, reportPath, provenancePath, pdfDigest, generatedAt };
}

export interface AllReportsStageResult {
  language: ReportLanguage;
  reportPath: string;
  generatedAt: Date;
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
 */
export async function runAllReportsStage(
  auditDir: string,
  manifest: AuditManifest,
  findings: Finding[],
  analyses: { fr: StoredAnalysis; en: StoredAnalysis },
  connection: Connection,
): Promise<AllReportsStageResult[]> {
  const results: AllReportsStageResult[] = [];

  for (const language of ['fr', 'en'] as const) {
    const { reportPath, generatedAt } = await runReportStage(
      auditDir,
      manifest,
      findings,
      analyses[language],
      connection,
    );
    results.push({ language, reportPath, generatedAt });
  }

  return results;
}
