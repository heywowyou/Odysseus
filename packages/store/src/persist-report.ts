/**
 * Persists one report as a plain insert, never an upsert, for the same
 * reason as persist-analysis.ts: a report re-run (a second language, or a
 * regeneration after a template change) is not a retry of the same work,
 * it is a distinct document, kept until retention supersedes it (plan 077,
 * trade-off 117).
 */

import type { Connection } from 'mongoose';
import { createReportModel, type ReportDocumentFields } from './schemas/report.schema.js';

export async function persistReport(
  connection: Connection,
  fields: ReportDocumentFields,
): Promise<void> {
  const ReportModel = createReportModel(connection);
  await ReportModel.create(fields);
}
