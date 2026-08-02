/**
 * Mongoose schema for the `reports` collection. Follows analyses' exact
 * pattern (insert-only, no unique index on auditId): a report regenerated
 * after a template change, or re-run in a second language, is a distinct
 * artifact worth keeping, not an overwrite of an earlier one.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type { ReportLanguage } from '@odysseus/core';

export interface ReportDocumentFields {
  auditId: string;
  language: ReportLanguage;
  /** REPORT_TEMPLATE_VERSION from @odysseus/report at generation time,
   *  the same provenance reason the manifest records tool versions: a
   *  template change between two monitoring reports must never read as
   *  the client's site having changed. */
  reportTemplateVersion: number;
  /** Which specific analysis this report was built from. Not redundant
   *  with generatedAt below: multiple analyses can exist per language
   *  (re-runs after a prompt change), so without this there is no way to
   *  trace which one a stored report reflects. */
  analysisGeneratedAt: Date;
  /** Path relative to the audit directory, e.g. "reports/2026-...-fr.pdf". */
  fileRef: string;
  generatedAt: Date;
}

export type ReportDocument = ReportDocumentFields;

const reportSchema = new Schema<ReportDocument>(
  {
    auditId: { type: String, required: true },
    language: { type: String, required: true, enum: ['fr', 'en'] },
    reportTemplateVersion: { type: Number, required: true },
    analysisGeneratedAt: { type: Date, required: true },
    fileRef: { type: String, required: true },
    generatedAt: { type: Date, required: true },
  },
  { collection: 'reports' },
);

// Deliberately no unique index on auditId, matching analyses: multiple
// reports per audit (once per language, again after a template change)
// is the intended common case.
reportSchema.index({ auditId: 1 });
reportSchema.index({ auditId: 1, language: 1, generatedAt: -1 });

export function createReportModel(connection: Connection): Model<ReportDocument> {
  return connection.models['Report'] ?? connection.model<ReportDocument>('Report', reportSchema);
}
