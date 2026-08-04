/**
 * Renders a stored analysis and the findings appendix into a bilingual
 * PDF, exactly as the `odysseus report` CLI command does today -
 * extracted so `cli` and the queued pipeline share one implementation.
 * See audit-stage.ts's header for why this was extracted.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Connection } from 'mongoose';
import type { AuditManifest, Finding } from '@odysseus/core';
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
