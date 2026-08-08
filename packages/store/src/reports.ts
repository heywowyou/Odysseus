/**
 * Read helpers over the `reports` collection, for the interface's PDF
 * download endpoint and the "which languages exist" line on the audit
 * detail view.
 */

import type { Connection } from 'mongoose';
import type { ReportLanguage } from '@odysseus/core';
import { createReportModel, type ReportDocument, type StoredReportTier } from './schemas/report.schema.js';

/** Latest report for a given audit and language, using the
 *  {auditId, language, tier, generatedAt: -1} index - a regenerated
 *  report after a template change is the one that should be served.
 *  tier defaults to 'full', matching every caller from before the
 *  milestone 8 tier split, none of which need to change. */
export async function getLatestReport(
  connection: Connection,
  auditId: string,
  language: ReportLanguage,
  tier: StoredReportTier = 'full',
): Promise<ReportDocument | null> {
  const ReportModel = createReportModel(connection);
  return ReportModel.findOne({ auditId, language, tier }).sort({ generatedAt: -1 }).lean<ReportDocument>();
}

export async function listReportLanguages(connection: Connection, auditId: string): Promise<ReportLanguage[]> {
  const ReportModel = createReportModel(connection);
  const languages = await ReportModel.distinct('language', { auditId });
  return languages as ReportLanguage[];
}
