/**
 * Renders a stored analysis and the findings appendix into a bilingual
 * PDF, exactly as the `odysseus report` CLI command does today -
 * extracted so `cli` and the queued pipeline share one implementation.
 * See audit-stage.ts's header for why this was extracted.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Connection } from 'mongoose';
import type { AuditManifest, Finding, ReportLanguage } from '@odysseus/core';
import { generateReportPdf, REPORT_TEMPLATE_VERSION, type StoredAnalysis } from '@odysseus/report';
import { persistReport } from '@odysseus/store';

export interface ReportStageResult {
  reportPath: string;
  generatedAt: Date;
}

function timestampForFilename(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-');
}

export async function runReportStage(
  auditDir: string,
  manifest: AuditManifest,
  findings: Finding[],
  analysis: StoredAnalysis,
  connection: Connection,
): Promise<ReportStageResult> {
  const pdf = await generateReportPdf({ auditDir, manifest, findings, analysis });

  const generatedAt = new Date();
  const reportsDir = path.join(auditDir, 'reports');
  await fs.mkdir(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `${timestampForFilename(generatedAt)}-${analysis.language}.pdf`);
  await fs.writeFile(reportPath, pdf);

  await persistReport(connection, {
    auditId: manifest.auditId,
    language: analysis.language,
    reportTemplateVersion: REPORT_TEMPLATE_VERSION,
    analysisGeneratedAt: analysis.generatedAt,
    fileRef: path.relative(auditDir, reportPath),
    generatedAt,
  });

  return { reportPath, generatedAt };
}

export interface AllReportsStageResult {
  language: ReportLanguage;
  reportPath: string;
  generatedAt: Date;
}

/**
 * Commercial-planning addendum, 2026-08-10, superseded 2026-08-16
 * (docs/offer-positioning.md): this used to render four (language, tier)
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
