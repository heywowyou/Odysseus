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
  return ReportModel.findOne({ auditId, language })
    .sort({ generatedAt: -1 })
    .lean<ReportDocument>();
}

export async function listReportLanguages(
  connection: Connection,
  auditId: string,
): Promise<ReportLanguage[]> {
  const ReportModel = createReportModel(connection);
  const languages = await ReportModel.distinct('language', { auditId });
  return languages as ReportLanguage[];
}

/**
 * Plan 072: how this PDF came to exist.
 *
 * `origin` is absent on every row written before the finalizer, and those
 * are all pipeline renders, so absence is read here rather than defaulted in
 * the schema - a row keeps saying which era it was written in, and nothing
 * has to be migrated for a legacy row to answer this question correctly.
 */
export function reportOrigin(report: Pick<ReportDocument, 'origin'>): 'pipeline' | 'finalized' {
  return report.origin === 'finalized' ? 'finalized' : 'pipeline';
}

/** Latest pipeline-generated report for an audit and language, ignoring any
 *  finalization layered on top of it. Backs the dashboard's link to the
 *  original generated PDF. */
export async function getLatestGeneratedReport(
  connection: Connection,
  auditId: string,
  language: ReportLanguage,
): Promise<ReportDocument | null> {
  return createReportModel(connection)
    .findOne({ auditId, language, origin: { $ne: 'finalized' } })
    .sort({ generatedAt: -1 })
    .lean<ReportDocument>();
}

/** Latest operator-finalized report for an audit and language, whether or
 *  not a later regeneration has overtaken it. That "overtaken" case is the
 *  one the dashboard has to show rather than hide: the client's delivered
 *  wording silently reverting to the model's is exactly the surprise this
 *  whole mechanism exists to prevent. */
export async function getLatestFinalizedReport(
  connection: Connection,
  auditId: string,
  language: ReportLanguage,
): Promise<ReportDocument | null> {
  return createReportModel(connection)
    .findOne({ auditId, language, origin: 'finalized' })
    .sort({ generatedAt: -1 })
    .lean<ReportDocument>();
}
