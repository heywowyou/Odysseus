/**
 * Mongoose schema for the `audits` collection. Mirrors AuditManifest
 * field-for-field, with one deliberate deviation: manifest.json stores
 * startedAt/finishedAt/renormalizedAt as ISO strings (disk JSON has no
 * native Date), but Mongo stores them as native Date so range queries
 * (the {siteUrl, startedAt: -1} index) work. persist-audit.ts converts at
 * the boundary; AuditDocument reflects the stored, Date-typed shape
 * rather than reusing AuditManifest directly.
 */

import { Schema, type Connection, type Model } from 'mongoose';
import type { AuditManifest, AuditManualFields, ReportPreparation } from '@odysseus/core';

export interface AuditDocumentFields extends Omit<
  AuditManifest,
  'startedAt' | 'finishedAt' | 'renormalizedAt'
> {
  startedAt: Date;
  finishedAt: Date;
  renormalizedAt?: Date;
  /** Manual-input-layer milestone: operator-supplied pre-report
   *  enrichment, DB-only (not part of manifest.json - see
   *  AuditManualFields's own doc comment in @odysseus/core). Absent for
   *  every audit until the operator saves at least one field. */
  manualFields?: AuditManualFields;
  /** Plan 019: bounded report-preparation aggregate, DB-only like
   *  manualFields. The stored shape is core's ReportPreparation verbatim
   *  (all timestamps ISO strings, no Date conversion needed because
   *  nothing queries preparation by time). Absent until the operator
   *  first saves preparation input. All writes go through the store
   *  service functions; handlers never issue raw updates. */
  reportPreparation?: ReportPreparation;
}

export type AuditDocument = AuditDocumentFields;

const toolVersionsSchema = new Schema(
  {
    odysseusVersion: { type: String, required: true },
    findingsSchemaVersion: { type: Number, required: true },
    axeCoreVersion: { type: String, default: null },
    lighthouseVersion: { type: String, default: null },
    playwrightVersion: { type: String, required: true },
    chromiumVersion: { type: String, required: true },
  },
  { _id: false },
);

const configSnapshotSchema = new Schema(
  {
    maxPages: { type: Number, required: true },
    maxDepth: { type: Number, required: true },
    crawlDelayMs: { type: Number, required: true },
    pageTimeoutMs: { type: Number, required: true },
    lighthouseTimeoutMs: { type: Number, required: true },
    userAgent: { type: String, required: true },
    scanConcurrency: { type: Number, required: true },
    sitemapMode: { type: String, enum: ['none', 'inspect', 'supplement'] },
  },
  { _id: false },
);

const crawlStatsSchema = new Schema(
  {
    startUrl: { type: String, required: true },
    visitedCount: { type: Number, required: true },
    maxPages: { type: Number, required: true },
    maxDepth: { type: Number, required: true },
    robotsTxtFound: { type: Boolean, required: true },
    effectiveDelayMs: { type: Number, required: true },
    sitemapCoverage: {
      _id: false,
      type: {
        declaredPageCount: { type: Number, required: true },
        eligiblePageCount: { type: Number, required: true },
        scannedPageCount: { type: Number, required: true },
        filteredPageCount: { type: Number, required: true },
        capOmittedPageCount: { type: Number, required: true },
        failedSitemapCount: { type: Number, required: true },
      },
    },
  },
  { _id: false },
);

const lighthouseExcludedCategoryScoresSchema = new Schema(
  {
    accessibility: { type: Number, default: null },
    bestPractices: { type: Number, default: null },
  },
  { _id: false },
);

const coreWebVitalMeasurementSchema = new Schema(
  {
    score: { type: Number, default: null },
    numericValue: { type: Number, default: null },
    displayValue: { type: String, default: null },
  },
  { _id: false },
);

const coreWebVitalsSchema = new Schema(
  {
    lcp: { type: coreWebVitalMeasurementSchema, required: true },
    cls: { type: coreWebVitalMeasurementSchema, required: true },
    tbt: { type: coreWebVitalMeasurementSchema, required: true },
    fcp: { type: coreWebVitalMeasurementSchema, required: true },
    speedIndex: { type: coreWebVitalMeasurementSchema, required: true },
  },
  { _id: false },
);

const auditPassCoverageSchema = new Schema(
  {
    outcome: {
      type: String,
      required: true,
      enum: ['completed', 'partial', 'failed', 'not-planned'],
    },
    failedCheckIds: { type: [String], default: undefined },
  },
  { _id: false },
);

const pageAnalysisCoverageSchema = new Schema(
  {
    plannerVersion: { type: String, required: true, enum: ['v1'] },
    role: {
      type: String,
      required: true,
      enum: ['content', 'transactional', 'listing', 'utility', 'unknown'],
    },
    confidence: { type: String, required: true, enum: ['high', 'fallback'] },
    templateFamilyId: { type: String },
    reasonCodes: { type: [String], required: true },
    passes: {
      _id: false,
      type: {
        rendered: { type: auditPassCoverageSchema, required: true },
        axe: { type: auditPassCoverageSchema, required: true },
        extended: { type: auditPassCoverageSchema, required: true },
        lighthouse: { type: auditPassCoverageSchema, required: true },
      },
      required: true,
    },
  },
  { _id: false },
);

const manifestPageEntrySchema = new Schema(
  {
    url: { type: String, required: true },
    pageDir: { type: String },
    depth: { type: Number, required: true },
    discoveryMethod: { type: String, enum: ['link', 'seed', 'sitemap-only'] },
    status: {
      type: String,
      required: true,
      enum: [
        'visited',
        'discovered-not-scanned',
        'skipped-robots',
        'skipped-non-html',
        'skipped-external-redirect',
        'error',
      ],
    },
    httpStatus: { type: Number },
    renderDiffMissingPercent: { type: Number },
    lighthouseExcludedCategoryScores: { type: lighthouseExcludedCategoryScoresSchema },
    coreWebVitals: { type: coreWebVitalsSchema },
    crawlError: { type: String },
    discoveredFrom: { type: String },
    analysisCoverage: { type: pageAnalysisCoverageSchema },
    errors: {
      _id: false,
      type: {
        renderDiff: { type: String },
        axe: { type: String },
        lighthouse: { type: String },
      },
      default: {},
    },
  },
  // "errors" is a Mongoose-reserved schema pathname; it's an intentional
  // field name matching ManifestPageEntry.errors, not an accident.
  { _id: false, suppressReservedKeysWarning: true },
);

const continuationFamilyOmissionSchema = new Schema(
  {
    familyKey: { type: String, required: true },
    basis: {
      type: String,
      required: true,
      enum: ['rel-next', 'numbered-pagination-control', 'query-key-family'],
    },
    enqueuedCount: { type: Number, required: true },
    omittedCount: { type: Number, required: true },
    omittedExampleUrls: { type: [String], required: true },
  },
  { _id: false },
);

const continuationGuardSummarySchema = new Schema(
  {
    guardVersion: { type: String, required: true, enum: ['v1'] },
    familyMaxEnqueued: { type: Number, required: true },
    families: { type: [continuationFamilyOmissionSchema], required: true },
    additionalFamiliesOmittedCount: { type: Number, required: true },
    totalOmittedUrlCount: { type: Number, required: true },
  },
  { _id: false },
);

const provencedFieldSchema = new Schema(
  {
    value: { type: Schema.Types.Mixed, required: true },
    provenance: { type: String, required: true, enum: ['detected', 'operator'] },
  },
  { _id: false },
);

const manualFieldsSchema = new Schema(
  {
    siren: { type: provencedFieldSchema },
    sirenSourceUrl: { type: provencedFieldSchema },
    raisonSociale: { type: provencedFieldSchema },
    nomCommercial: { type: provencedFieldSchema },
    sector: { type: provencedFieldSchema },
    revenueBand: { type: provencedFieldSchema },
    declarationContactEmail: { type: provencedFieldSchema },
    recipientName: { type: provencedFieldSchema },
    updatedAt: { type: Date, required: true },
  },
  { _id: false },
);

const findingsProvenanceSchema = new Schema(
  {
    findingsSchemaVersion: { type: Number, required: true },
    normalizationFingerprint: { type: String, required: true },
    findingsDigest: { type: String, required: true },
  },
  { _id: false },
);

// Report preparation (plan 019). The enum validators mirror core's closed
// vocabularies the same way analysis.schema.ts mirrors Theme['category'].
const localizedOptionalTextSchema = new Schema(
  {
    fr: { type: String },
    en: { type: String },
  },
  { _id: false },
);

const analysisPairRefSchema = new Schema(
  {
    frAnalysisId: { type: String, required: true },
    enAnalysisId: { type: String, required: true },
    findingsProvenance: { type: findingsProvenanceSchema, required: true },
  },
  { _id: false },
);

const writingCandidateStateSchema = new Schema(
  {
    // Discriminated union in core; Mongoose stores the union's fields
    // flatly with only the ones the status requires populated.
    status: {
      type: String,
      required: true,
      enum: ['ready', 'failed', 'selected'],
    },
    pair: { type: analysisPairRefSchema },
    createdAt: { type: String },
    approvedAt: { type: String },
    reason: { type: String },
    // A failed run may have persisted one language before failing; the
    // selection fallback must be able to exclude those partials.
    partialFrAnalysisId: { type: String },
    partialEnAnalysisId: { type: String },
  },
  { _id: false },
);

const writingSelectionSchema = new Schema(
  {
    selected: { type: analysisPairRefSchema },
    candidate: { type: writingCandidateStateSchema },
  },
  { _id: false },
);

const journeyDecisionSchema = new Schema(
  {
    journeyId: {
      type: String,
      required: true,
      enum: ['discovery-navigation', 'transaction-booking'],
    },
    decision: {
      type: String,
      required: true,
      enum: ['confirmed', 'removed'],
    },
  },
  { _id: false },
);

const detectedTurnoverSchema = new Schema(
  {
    amountEur: { type: Number, required: true },
    year: { type: Number, required: true },
    source: { type: String, required: true, enum: ['sirene-api'] },
  },
  { _id: false },
);

const manualTurnoverSchema = new Schema(
  {
    kind: { type: String, required: true, enum: ['exact', 'range'] },
    amountEur: { type: Number },
    lowerEur: { type: Number },
    upperEur: { type: Number },
    year: { type: Number, required: true },
    source: {
      type: String,
      required: true,
      enum: ['official-annual-accounts', 'client-stated', 'other-documented'],
    },
    sourceNote: { type: String },
  },
  { _id: false },
);

const turnoverChoiceSchema = new Schema(
  {
    detected: { type: detectedTurnoverSchema },
    replacement: { type: manualTurnoverSchema },
    useReplacement: { type: Boolean, required: true },
  },
  { _id: false },
);

const reportPreparationSchema = new Schema(
  {
    context: {
      _id: false,
      type: {
        situation: {
          type: String,
          enum: [
            'no-work-started',
            'redesign-underway',
            'corrections-underway',
            'accessibility-programme',
            'periodic-review',
            'unknown',
          ],
        },
        trigger: {
          type: String,
          enum: [
            'legal-question',
            'customer-complaint',
            'booking-or-conversion',
            'search-visibility',
            'redesign',
            'procurement',
            'commercial-discussion',
            'proactive-review',
            'other',
          ],
        },
        triggerOther: { type: localizedOptionalTextSchema },
      },
      default: {},
    },
    customCoverQuestion: { type: localizedOptionalTextSchema },
    stakeholders: {
      _id: false,
      type: {
        management: { type: String },
        technical: { type: String },
        communications: { type: String },
        legal: { type: String },
      },
      default: {},
    },
    journeyDecisions: { type: [journeyDecisionSchema], default: [] },
    turnover: { type: turnoverChoiceSchema, default: { useReplacement: false } },
    warningAcknowledgement: {
      _id: false,
      type: {
        digest: { type: String, required: true },
        acknowledgedAt: { type: String, required: true },
      },
    },
    writingSelection: { type: writingSelectionSchema },
    updatedAt: { type: String, required: true },
  },
  { _id: false },
);

const auditSchema = new Schema<AuditDocument>(
  {
    auditId: { type: String, required: true, unique: true },
    kind: { type: String, required: true, enum: ['audit', 'render-diff'] },
    siteUrl: { type: String, required: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
    renormalizedAt: { type: Date },
    findingsProvenance: { type: findingsProvenanceSchema },
    tool: { type: toolVersionsSchema, required: true },
    config: { type: configSnapshotSchema, required: true },
    crawl: { type: crawlStatsSchema, required: true },
    pages: { type: [manifestPageEntrySchema], default: [] },
    continuationGuardSummary: { type: continuationGuardSummarySchema },
    manualFields: { type: manualFieldsSchema },
    reportPreparation: { type: reportPreparationSchema },
  },
  { collection: 'audits' },
);

auditSchema.index({ siteUrl: 1, startedAt: -1 });

export function createAuditModel(connection: Connection): Model<AuditDocument> {
  return connection.models['Audit'] ?? connection.model<AuditDocument>('Audit', auditSchema);
}
