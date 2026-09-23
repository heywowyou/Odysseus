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
import type {
  AuditManifest,
  AuditPacingRecoveryEvent,
  AuditManualFields,
  FindingsDeltaCoverage,
  GradeOverride,
  ReportPreparation,
} from '@odysseus/core';
import { WRITING_SANITIZATION_WARNING_CODES } from '@odysseus/core';

export interface AuditDocumentFields extends Omit<
  AuditManifest,
  'startedAt' | 'finishedAt' | 'renormalizedAt'
> {
  startedAt: Date;
  finishedAt: Date;
  /** Explicitly mirrors the new optional manifest timeline for Mongoose. */
  pacingRecoveryEvents?: AuditPacingRecoveryEvent[];
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
  /** Issue: operator-reviewed overall grade override, DB-only like
   *  manualFields above. The automatic grade itself is never stored - it
   *  is always recomputed fresh from findings/manifest
   *  (@odysseus/report's computeAutomaticGrade). Absent until the
   *  operator saves an override; cleared, not defaulted back to the
   *  automatic grade, when the operator removes it. */
  gradeOverride?: GradeOverride;
  /** Plan 059 step 35: this run's evidence coverage signature in the shape
   *  the findings delta compares, DB-only like manualFields above. The
   *  stored shape is core's FindingsDeltaCoverage verbatim. Absent for
   *  audits whose evidence graph was never assembled, which the delta
   *  then treats as unknown-legacy rather than as invented comparability. */
  evidenceCoverage?: FindingsDeltaCoverage;
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
        sitemapUrls: { type: [String] },
      },
    },
  },
  { _id: false },
);

const pushbackEventSchema = new Schema(
  {
    pageUrl: { type: String, required: true },
    kind: {
      type: String,
      enum: ['rate-limit', 'bot-challenge', 'origin-transient'],
      required: true,
    },
    fetcher: {
      type: String,
      enum: ['crawl', 'render', 'lighthouse', 'canonical'],
      required: true,
    },
    occurredAt: { type: String, required: true },
    status: { type: Number },
    retryAfterMs: { type: Number },
    delayMs: { type: Number },
    atMaxDelay: { type: Boolean },
  },
  { _id: false },
);

const pacingRecoveryEventSchema = new Schema(
  {
    delayMs: { type: Number, required: true },
    occurredAt: { type: String, required: true },
  },
  { _id: false },
);

const coverageLimitationSchema = new Schema(
  {
    ruleId: {
      type: String,
      required: true,
      enum: [
        'accessibility-statement-missing',
        'lcen-mentions-legales-missing',
        'consent-mechanism-absent',
        'hreflang-missing',
        'structured-data-entity-missing',
        'sitemap-orphan-page',
        'llms-txt-missing',
      ],
    },
    blockedCandidateCount: { type: Number, required: true },
    failedCandidateCount: { type: Number, required: true },
    capOmittedPageCount: { type: Number },
    candidateUrls: { type: [String] },
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

/** Issue #301. Mirrors RawDocumentSignals (core types/findings.ts). */
const rawDocumentSignalsSchema = new Schema(
  {
    markupLength: { type: Number, required: true },
    visibleTextLength: { type: Number },
    textSignature: { type: String, required: true },
    interstitialMarkers: { type: [String], default: [] },
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
    plannerVersion: { type: String, required: true, enum: ['v1', 'v2', 'v3'] },
    role: {
      type: String,
      required: true,
      enum: ['content', 'transactional', 'listing', 'utility', 'unknown'],
    },
    confidence: { type: String, required: true, enum: ['high', 'fallback'] },
    templateFamilyId: { type: String },
    reasonCodes: { type: [String], required: true },
    surfaceSample: {
      _id: false,
      type: {
        selected: { type: Boolean, required: true },
        reason: {
          type: String,
          required: true,
          enum: [
            'homepage',
            'mandatory',
            'family-representative',
            'unique-family',
            'family-sampled',
          ],
        },
      },
    },
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
        // Issue #39: navigated to a non-2xx response; inventoried with its
        // httpStatus, never scanned.
        'http-error-status',
        'blocked',
        // Issue #85: a 200 whose content belongs to the URL the browser
        // redirected to. Absent until issue #302 added its neighbour
        // below, which meant saving an audit containing one was rejected.
        'redirect-interstitial',
        // Issue #302: a 200 serving an error template.
        'soft-error-page',
        'error',
      ],
    },
    httpStatus: { type: Number },
    language: { type: String },
    noindex: { type: Boolean },
    pluginObject: {
      _id: false,
      type: {
        postType: { type: String, required: true },
        bodyClass: { type: String, required: true },
      },
    },
    renderDiffMissingPercent: { type: Number },
    // Issue #301: the raw fetch's own signals, so a stored audit can be
    // re-reported without re-reading the scan artifacts.
    renderDiffRawDocument: { type: rawDocumentSignalsSchema },
    lighthouseExcludedCategoryScores: { type: lighthouseExcludedCategoryScoresSchema },
    coreWebVitals: { type: coreWebVitalsSchema },
    unstableLabMetrics: { type: [String], default: undefined },
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
    transactionalFlowOverride: {
      _id: false,
      type: {
        value: { type: Boolean, required: true },
        reason: { type: String, required: true },
      },
    },
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

const privacySecurityCoverageSchema = new Schema(
  {
    securityHeaders: { type: String, required: true, enum: ['completed', 'unavailable'] },
    cookieConsent: { type: String, required: true, enum: ['completed', 'unavailable'] },
  },
  { _id: false },
);

// Issue #173: the four manifest fields below (siteSignals, cruxFieldData,
// translationClusters, benchmarkPercentile) were mirrored only in the
// docblock, so Mongoose v9 strict mode silently stripped them from
// persist-audit.ts's findOneAndUpdate $set and they never reached the
// audits collection. Each sub-schema mirrors its core type, the same way
// plan 037 declared outreach.

const transactionalFlowEvidenceSchema = new Schema(
  {
    kind: {
      type: String,
      required: true,
      enum: [
        'booking-engine-script',
        'checkout-form',
        'payment-embed',
        'delegated-booking-redirect',
        'booking-engine-domain-reference',
        'booking-iframe',
      ],
    },
    selector: { type: String, required: true },
    pageUrl: { type: String, required: true },
    detail: { type: String, required: true },
    providerUrl: { type: String },
  },
  { _id: false },
);

const transactionalFlowRedirectCheckSchema = new Schema(
  {
    pageUrl: { type: String, required: true },
    linkUrl: { type: String, required: true },
    destinationUrl: { type: String },
    resolution: {
      type: String,
      required: true,
      enum: ['single-property', 'marketplace', 'undetermined'],
    },
    detail: { type: String, required: true },
  },
  { _id: false },
);

const transactionalFlowAmbiguitySchema = new Schema(
  {
    selector: { type: String, required: true },
    pageUrl: { type: String, required: true },
    href: { type: String },
    matchedVia: { type: [String], required: true },
    detail: { type: String, required: true },
  },
  { _id: false },
);

const siteSignalsSchema = new Schema(
  {
    hasTransactionalFlow: { type: Boolean, required: true },
    transactionalFlowEvidence: { type: [transactionalFlowEvidenceSchema], required: true },
    transactionalFlowRedirectChecks: {
      type: [transactionalFlowRedirectCheckSchema],
      default: undefined,
    },
    transactionalFlowAmbiguities: { type: [transactionalFlowAmbiguitySchema], default: undefined },
    siren: { type: String },
    mentionsLegalesPageUrl: { type: String },
    siteName: { type: String },
    roleContact: { type: new Schema({ address: String, sourceUrl: String }, { _id: false }) },
  },
  { _id: false },
);

const cruxMetricResultSchema = new Schema(
  {
    p75: { type: Number, required: true },
  },
  { _id: false },
);

const cruxFieldDataSchema = new Schema(
  {
    available: { type: Boolean, required: true },
    lcp: { type: cruxMetricResultSchema },
    cls: { type: cruxMetricResultSchema },
    inp: { type: cruxMetricResultSchema },
    fetchError: { type: String },
  },
  { _id: false },
);

const translationClusterMemberSchema = new Schema(
  {
    pageUrl: { type: String, required: true },
    lang: { type: String },
  },
  { _id: false },
);

const translationClusterSchema = new Schema(
  {
    canonicalPageUrl: { type: String, required: true },
    members: { type: [translationClusterMemberSchema], required: true },
  },
  { _id: false },
);

const benchmarkScanDateRangeSchema = new Schema(
  {
    earliest: { type: String, required: true },
    latest: { type: String, required: true },
  },
  { _id: false },
);

// SiteBenchmarkPercentile is a discriminated union in core (kind 'scored'
// carries the site's standing against the cohort, kind 'too-small' the
// cohort floor). Mongoose stores the union's fields flatly with only the
// ones the kind requires, the same way writingCandidateStateSchema does.
const benchmarkPercentileSchema = new Schema(
  {
    kind: { type: String, required: true, enum: ['scored', 'too-small'] },
    siteId: { type: String },
    score: { type: Number },
    percentile: { type: Number },
    cohortSize: { type: Number, required: true },
    scanDateRange: { type: benchmarkScanDateRangeSchema },
    minimumCohortSize: { type: Number },
  },
  { _id: false },
);

// Report preparation (plan 019).
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
    enAnalysisId: { type: String },
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
    // selection fallback must be able to exclude those partials
    // (`resolveWritingSelection`, core). The field is the nested object the
    // core type declares: it was previously declared here as two flat
    // `partial*AnalysisId` keys nobody ever wrote, so strict mode silently
    // dropped every partial on its way to disk and the exclusion never fired
    // on stored data.
    partialPair: {
      _id: false,
      type: {
        frAnalysisId: { type: String },
        enAnalysisId: { type: String },
      },
    },
    // Issue #409: which guards rejected each attempt of the failed run, so
    // the audit page can say "attempt 2 of 3 rejected by the prose-register
    // guard" instead of only showing the last message. Guard names only; the
    // violating prose stays out of this aggregate.
    guardRejections: {
      // `default: undefined` so an ordinary failure stores no key at all:
      // Mongoose otherwise defaults every array path to `[]`, which would
      // put an empty list on every failed candidate ever written.
      default: undefined,
      type: [
        new Schema(
          {
            attempt: { type: Number, required: true },
            totalAttempts: { type: Number, required: true },
            guards: { type: [String], required: true },
          },
          { _id: false },
        ),
      ],
    },
    warnings: {
      default: undefined,
      type: [
        new Schema(
          {
            code: {
              type: String,
              required: true,
              enum: [...WRITING_SANITIZATION_WARNING_CODES],
            },
            field: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
    },
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

// Situation, trigger, stakeholder names, journeys, and turnover were
// retired from preparation; Mongoose's strict mode drops those keys from
// legacy documents on the next preparation write.
const reportPreparationSchema = new Schema(
  {
    customCoverQuestion: { type: localizedOptionalTextSchema },
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

// Issue: operator-reviewed overall grade override. DB-only, like the
// sub-schemas above (issue #173's lesson) - Mongoose would otherwise
// silently strip this undeclared top-level path.
const gradeOverrideSchema = new Schema(
  {
    grade: { type: String, required: true, enum: ['A', 'B', 'C', 'D'] },
    reason: { type: String, required: true },
    reviewedAt: { type: Date, required: true },
    reviewedBy: { type: String, required: true, enum: ['operator'] },
  },
  { _id: false },
);

// Exported for schemas/audit.schema.test.ts's AuditManifest-vs-paths diff
// guard; the rest of the package keeps going through createAuditModel.
export const auditSchema = new Schema<AuditDocument>(
  {
    auditId: { type: String, required: true, unique: true },
    prospectId: { type: String },
    scanIntent: { type: String, enum: ['quick-check', 'prospecting-audit', 'full-audit'] },
    kind: { type: String, required: true, enum: ['audit', 'render-diff'] },
    siteUrl: { type: String, required: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, required: true },
    renormalizedAt: { type: Date },
    findingsProvenance: { type: findingsProvenanceSchema },
    privacySecurityCoverage: { type: privacySecurityCoverageSchema },
    tool: { type: toolVersionsSchema, required: true },
    config: { type: configSnapshotSchema, required: true },
    crawl: { type: crawlStatsSchema, required: true },
    pushbackEvents: { type: [pushbackEventSchema] },
    pacingRecoveryEvents: { type: [pacingRecoveryEventSchema] },
    coverageLimitations: { type: [coverageLimitationSchema] },
    pages: { type: [manifestPageEntrySchema], default: [] },
    continuationGuardSummary: { type: continuationGuardSummarySchema },
    relativeLinkNestingSummary: {
      _id: false,
      type: {
        omittedUrlCount: { type: Number, required: true },
        omittedExampleUrls: { type: [String], required: true },
        repeatedSegments: { type: [String], required: true },
      },
    },
    siteSignals: { type: siteSignalsSchema },
    cruxFieldData: { type: cruxFieldDataSchema },
    translationClusters: { type: [translationClusterSchema], default: undefined },
    benchmarkPercentile: { type: benchmarkPercentileSchema },
    manualFields: { type: manualFieldsSchema },
    reportPreparation: { type: reportPreparationSchema },
    gradeOverride: { type: gradeOverrideSchema },
    // Mixed: the delta coverage record is a closed core contract re-read
    // verbatim by the findings delta, never queried by field (same
    // reasoning as report-quality.schema.ts's modelCalls).
    evidenceCoverage: { type: Schema.Types.Mixed } as never,
  },
  { collection: 'audits' },
);

auditSchema.index({ siteUrl: 1, startedAt: -1 });
auditSchema.index({ prospectId: 1, startedAt: -1 });
// Issue #218: the Prospect hub's durable-business audit list.

export function createAuditModel(connection: Connection): Model<AuditDocument> {
  return connection.models['Audit'] ?? connection.model<AuditDocument>('Audit', auditSchema);
}
