/**
 * Read helpers over the `reports` collection, for the interface's PDF
 * download endpoint and the "which languages exist" line on the audit
 * detail view.
 */

import type { Connection } from 'mongoose';
import type { ReportLanguage } from '@odysseus/core';
import { createReportModel, type ReportDocument } from './schemas/report.schema.js';

/** Latest report for a given audit and language, using the
 *  {auditId, language, generatedAt: -1} index - a regenerated report
 *  after a template change is the one that should be served. */
export async function getLatestReport(
  connection: Connection,
  auditId: string,
  language: ReportLanguage,
): Promise<ReportDocument | null> {
  const ReportModel = createReportModel(connection);
  return ReportModel.findOne({ auditId, language }).sort({ generatedAt: -1 }).lean<ReportDocument>();
}

export async function listReportLanguages(connection: Connection, auditId: string): Promise<ReportLanguage[]> {
  const ReportModel = createReportModel(connection);
  const languages = await ReportModel.distinct('language', { auditId });
  return languages as ReportLanguage[];
}
