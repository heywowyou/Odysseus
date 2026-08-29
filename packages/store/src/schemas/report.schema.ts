/**
 * Mongoose schema for the `reports` collection. Follows analyses' exact
 * pattern (insert-only, no unique index on auditId): a report regenerated
 * after a template change, or re-run in a second language, is a distinct
 * artifact worth keeping, not an overwrite of an earlier one.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type { FindingsProvenance, ReportLanguage } from '@odysseus/core';

/** Milestone 8 addendum introduced a paid screening tier alongside the
 *  full audit, and a stored report recorded which of the two it was.
 *  Dropped 2026-08-16 (docs/offer-positioning.md): the commercial model
 *  is single-tier now, so there is nothing left to disambiguate.
 *  Historical documents in the `reports` collection still carry a
 *  `tier` field from before this change; it is simply no longer read or
 *  written, not migrated, since old values remain valid history and
 *  nothing here needs them. */
export interface ReportDocumentFields {
  reportId: string;
  auditId: string;
  analysisId: string;
  findingsProvenance: FindingsProvenance;
  rendererVersion: number;
  pdfDigest: string;
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
  /** Path relative to the audit directory, e.g. "reports/2026-...-full-fr.pdf". */
  fileRef: string;
  generatedAt: Date;
}

type LegacyOptionalFields =
  'reportId' | 'analysisId' | 'findingsProvenance' | 'rendererVersion' | 'pdfDigest';
export type ReportDocument = Omit<ReportDocumentFields, LegacyOptionalFields> &
  Partial<Pick<ReportDocumentFields, LegacyOptionalFields>>;

const reportSchema = new Schema<ReportDocument>(
  {
    reportId: { type: String, required: true },
    auditId: { type: String, required: true },
    analysisId: { type: String, required: true },
    findingsProvenance: {
      _id: false,
      type: {
        findingsSchemaVersion: { type: Number, required: true },
        normalizationFingerprint: { type: String, required: true },
        findingsDigest: { type: String, required: true },
      },
      required: true,
    },
    rendererVersion: { type: Number, required: true },
    pdfDigest: { type: String, required: true },
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
reportSchema.index({ reportId: 1 }, { unique: true, sparse: true });

export function createReportModel(connection: Connection): Model<ReportDocument> {
  return connection.models['Report'] ?? connection.model<ReportDocument>('Report', reportSchema);
}
