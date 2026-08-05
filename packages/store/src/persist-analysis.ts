/**
 * Persists one analysis as a plain insert, never an upsert. Contrast
 * with persistAudit's upsert-by-auditId: an audit re-run under the same
 * auditId is a retry of the same work and should be idempotent, but an
 * analysis re-run is not a retry of the same work - the same audit is
 * legitimately analysed more than once (once per language, again after
 * a prompt change), and each run is a distinct document worth keeping.
 * Upserting here would silently overwrite an earlier language's or an
 * earlier prompt version's analysis.
 */

import type { Connection } from 'mongoose';
import type { LlmOutput, ReportLanguage } from '@odysseus/core';
import { createAnalysisModel, type AnalysisDocumentFields } from './schemas/analysis.schema.js';

export async function persistAnalysis(
  connection: Connection,
  auditId: string,
  language: ReportLanguage,
  model: string,
  temperature: number,
  generatedAt: Date,
  output: LlmOutput,
): Promise<void> {
  const AnalysisModel = createAnalysisModel(connection);
  const fields: AnalysisDocumentFields = {
    auditId,
    language,
    model,
    temperature,
    generatedAt,
    executiveSummary: output.executiveSummary,
    overallRisk: output.overallRisk,
    themes: output.themes,
    quickWins: output.quickWins,
    notes: output.notes,
  };
  await AnalysisModel.create(fields);
}
