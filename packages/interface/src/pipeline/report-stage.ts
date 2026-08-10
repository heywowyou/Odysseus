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
import { generateReportPdf, REPORT_TEMPLATE_VERSION, type ReportTier, type StoredAnalysis } from '@odysseus/report';
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
  /** Milestone 8 addendum section 1.6. Defaults to 'full', matching this
   *  stage's behavior before the tier split existed. */
  tier: ReportTier = 'full',
): Promise<ReportStageResult> {
  const pdf = await generateReportPdf({ auditDir, manifest, findings, analysis, tier });

  const generatedAt = new Date();
  const reportsDir = path.join(auditDir, 'reports');
  await fs.mkdir(reportsDir, { recursive: true });
  const reportPath = path.join(reportsDir, `${timestampForFilename(generatedAt)}-${tier}-${analysis.language}.pdf`);
  await fs.writeFile(reportPath, pdf);

  await persistReport(connection, {
    auditId: manifest.auditId,
    language: analysis.language,
    tier,
    reportTemplateVersion: REPORT_TEMPLATE_VERSION,
    analysisGeneratedAt: analysis.generatedAt,
    fileRef: path.relative(auditDir, reportPath),
    generatedAt,
  });

  return { reportPath, generatedAt };
}

export interface AllReportsStageResult {
  language: ReportLanguage;
  tier: ReportTier;
  reportPath: string;
  generatedAt: Date;
}

/** Every (language, tier) combination this command produces, in a fixed
 *  order so a caller's log/output is stable across runs. */
const ALL_REPORT_COMBOS: ReadonlyArray<{ language: ReportLanguage; tier: ReportTier }> = [
  { language: 'fr', tier: 'screening' },
  { language: 'fr', tier: 'full' },
  { language: 'en', tier: 'screening' },
  { language: 'en', tier: 'full' },
];

/**
 * Commercial-planning addendum, 2026-08-10: any completed audit already
 * has one StoredAnalysis per language (analysis-stage.ts runs once per
 * language, unrelated to tier - see @odysseus/report's ReportTier doc
 * comment, tier is purely a report-rendering decision). This generates
 * the four (language, tier) report renders from those two analyses in
 * one call, reusing runReportStage per combo rather than duplicating its
 * PDF-generation and persistReport logic. No re-scan, no second LLM
 * call: one set of findings, one structure/writing pass per language,
 * now four report renders instead of two.
 *
 * Sequential, matching runFullAuditJob's own report-fr-then-report-en
 * ordering, rather than Promise.all: bounds concurrent Chromium PDF
 * renders to one at a time, and keeps a mid-run failure's error
 * attributable to a single combo instead of an aggregated rejection.
 */
export async function runAllReportsStage(
  auditDir: string,
  manifest: AuditManifest,
  findings: Finding[],
  analyses: { fr: StoredAnalysis; en: StoredAnalysis },
  connection: Connection,
): Promise<AllReportsStageResult[]> {
  const results: AllReportsStageResult[] = [];

  for (const combo of ALL_REPORT_COMBOS) {
    const { reportPath, generatedAt } = await runReportStage(
      auditDir,
      manifest,
      findings,
      analyses[combo.language],
      connection,
      combo.tier,
    );
    results.push({ language: combo.language, tier: combo.tier, reportPath, generatedAt });
  }

  return results;
}
