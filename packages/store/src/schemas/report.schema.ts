/**
 * Mongoose schema for the `reports` collection. Follows analyses' exact
 * pattern (insert-only, no unique index on auditId): a report regenerated
 * after a template change, or re-run in a second language, is a distinct
 * artifact, not an overwrite of an earlier one. Retention removes it once a
 * newer one has superseded it for a week (plan 077, trade-off 117).
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type { FindingsProvenance, ReportLanguage } from '@odysseus/core';

export interface ReportVariantDocument {
  /** Path relative to the audit directory, next to the canonical PDF. */
  fileRef: string;
  pdfDigest: string;
  pageCount?: number;
}

export interface ReportVariantsDocument {
  /** Optional by design: older rows and light-render failures are dark-only. */
  light?: ReportVariantDocument;
}

/** Milestone 8 addendum introduced a paid screening tier alongside the
 *  full audit, and a stored report recorded which of the two it was.
 *  Dropped 2026-08-16 (docs/rules/offer-positioning.md): the commercial model
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
  rendererBuild: string;
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
  /** Issue #62: os.hostname() of the machine that rendered the PDF. Each
   *  machine now has its own database (the VPS `test`, the workstation
   *  `odysseus-local`), but rows written while the database was shared can
   *  name another machine, so a fileRef that resolves to nothing here
   *  usually means the file lives on the machine named here, not that it
   *  was lost. Optional: documents rendered before it was recorded simply
   *  lack it. */
  renderedOnHost?: string;
  /** Plan 072: which of the two ways this PDF came to exist. A `finalized`
   *  row is the operator's own render, corrected after reading the pipeline's
   *  and uploaded back. Optional and absent on every row written before the
   *  finalizer existed, which are all pipeline renders - so absent reads as
   *  `pipeline`, never as unknown. */
  origin?: 'pipeline' | 'finalized';
  /** What the operator changed, present only on a `finalized` row. The
   *  stored analysis keeps the prose the model wrote; this plus the override
   *  file kept beside the PDF is the link between that text and the text the
   *  client received. */
  finalization?: {
    /** SHA-256 of the override file exactly as uploaded. */
    overridesDigest: string;
    overrideCount: number;
    uploadedAt: Date;
    /** The pipeline report this one corrects. Recorded rather than inferred
     *  from timestamps: which render the operator actually read is a fact,
     *  and a regeneration in between would make a guess at it wrong. */
    supersedesReportId: string;
  };
  /** Measured Paged.js page count recorded at generation time (plan 018).
   *  Optional: documents generated before it was recorded simply lack it,
   *  and the length warning must never infer a value for them. */
  pageCount?: number;
  /** Presentation siblings of the canonical dark PDF. The dark artifact
   * remains the row's canonical identity and is never replaced by a light
   * fallback. */
  variants?: ReportVariantsDocument;
}

type LegacyOptionalFields =
  | 'reportId'
  | 'analysisId'
  | 'findingsProvenance'
  | 'rendererVersion'
  | 'rendererBuild'
  | 'pdfDigest'
  | 'pageCount'
  | 'origin'
  | 'finalization';
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
    rendererBuild: { type: String, required: true },
    pdfDigest: { type: String, required: true },
    language: { type: String, required: true, enum: ['fr', 'en'] },
    reportTemplateVersion: { type: Number, required: true },
    analysisGeneratedAt: { type: Date, required: true },
    fileRef: { type: String, required: true },
    generatedAt: { type: Date, required: true },
    renderedOnHost: { type: String },
    // Absent on every legacy row, and read as 'pipeline' by
    // reportOrigin() rather than defaulted here, so a row's stored shape
    // keeps saying which era it came from.
    origin: { type: String, enum: ['pipeline', 'finalized'] },
    finalization: {
      _id: false,
      type: {
        overridesDigest: { type: String, required: true },
        overrideCount: { type: Number, required: true },
        uploadedAt: { type: Date, required: true },
        supersedesReportId: { type: String, required: true },
      },
      required: false,
    },
    // Not required: legacy documents predate the measured page count and
    // strict mode strips the key on write when it is absent, so a lean
    // read simply returns undefined for them.
    pageCount: { type: Number },
    variants: {
      _id: false,
      type: {
        light: {
          _id: false,
          type: {
            fileRef: { type: String, required: true },
            pdfDigest: { type: String, required: true },
            pageCount: { type: Number },
          },
        },
      },
    },
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
