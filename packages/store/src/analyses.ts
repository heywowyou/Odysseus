import type { Connection } from 'mongoose';
import type { ReportLanguage } from '@odysseus/core';
import { createAnalysisModel, type AnalysisDocument } from './schemas/analysis.schema.js';

export async function getLatestAnalysis(
  connection: Connection,
  auditId: string,
  language: ReportLanguage,
): Promise<AnalysisDocument | null> {
  return createAnalysisModel(connection)
    .findOne({ auditId, language })
    .sort({ generatedAt: -1 })
    .lean<AnalysisDocument>();
}
