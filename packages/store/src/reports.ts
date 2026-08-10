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

export interface ReportCombo {
  language: ReportLanguage;
  tier: StoredReportTier;
}

/** Every distinct (language, tier) pair with at least one generated
 *  report for this audit, so the dashboard can show and link to tier
 *  alongside language per report instead of only the plain language list
 *  listReportLanguages returns (kept as-is for its existing callers).
 *  A find-and-dedupe rather than an aggregation pipeline: at most a
 *  handful of report documents exist per audit (one per language per
 *  tier, occasionally more after a template regeneration), so there is
 *  no dataset size this needs to scale to. */
export async function listReportCombos(connection: Connection, auditId: string): Promise<ReportCombo[]> {
  const ReportModel = createReportModel(connection);
  const docs = await ReportModel.find({ auditId }, 'language tier').lean<
    Pick<ReportDocument, 'language' | 'tier'>[]
  >();

  const seen = new Set<string>();
  const combos: ReportCombo[] = [];
  for (const doc of docs) {
    const key = `${doc.language}:${doc.tier}`;
    if (seen.has(key)) continue;
    seen.add(key);
    combos.push({ language: doc.language, tier: doc.tier });
  }
  return combos;
}
