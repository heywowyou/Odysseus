/**
 * Response types of GET /api/audits/:auditId and its action sub-routes
 * (packages/interface/src/routes/audits.ts). Field names are the API's
 * persisted contract, not UI vocabulary; never respell them.
 *
 * Declared by value rather than imported from @odysseus/core and
 * @odysseus/store: this file describes what crosses the HTTP boundary
 * (dates arrive as ISO strings, storage internals do not exist here), and
 * the dashboard typescript project reads no workspace packages, the same
 * discipline as lib/api-types.ts.
 */

export type Severity = 'critical' | 'serious' | 'moderate' | 'minor';

export type FindingCategory =
  'accessibility' | 'seo' | 'geo' | 'performance' | 'rendering' | 'privacy';

export type FindingSource = 'axe' | 'lighthouse' | 'custom' | 'renderdiff';

export type ReportLanguage = 'fr' | 'en';

/** classifyReportFreshness (packages/report) as the client sees it. */
export type ReportFreshness = 'fresh' | 'stale' | 'unverified';

export type AuditLifecycle = 'scanned' | 'analysed' | 'rendered' | 'approved';

/** The report's A-D scorecard scale (packages/report/src/template/grade.ts).
 *  No F: an outreach or report document telling a client their site
 *  "failed" reads as an insult, not an opportunity - D is the floor. */
export type Grade = 'A' | 'B' | 'C' | 'D';

export type FieldProvenance = 'detected' | 'operator';

/** The two fields D8's cover-identity gate cares about
 *  (packages/report/src/template/unconfirmed-fields.ts's IDENTITY_FIELDS),
 *  mirrored here so the client can name them without importing a report
 *  package it has no other reason to depend on. */
export type IdentityField = 'nomCommercial' | 'raisonSociale';

export interface SeverityRollup {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
}

/** One stored occurrence (packages/core FindingElement), dates aside. */
export interface FindingElementResponse {
  pageUrl: string;
  selector: string;
  snippet: string;
  screenshotRef?: string;
  resourceUrl?: string;
}

/** A row of the findings collection (packages/core Finding) over JSON:
 *  every field the locked findings contract persists, with timestamps as
 *  ISO strings. */
export interface FindingResponse {
  findingId: string;
  auditId: string;
  schemaVersion: number;
  source: FindingSource;
  ruleId: string;
  category: FindingCategory;
  severity: Severity;
  wcagCriteria: string[];
  title: string;
  description: string;
  helpUrl?: string;
  pageUrls: string[];
  occurrences: number;
  elements: FindingElementResponse[];
  rawEvidence: Record<string, unknown>;
  dedupeKey: string;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface ProvenancedFieldValue {
  value: string;
  provenance: FieldProvenance;
}

export interface ProvenancedSectorValue {
  value: 'general' | 'hospitality';
  provenance: FieldProvenance;
}

export interface TransactionalFlowOverrideValue {
  value: boolean;
  reason: string;
}

/** The audit's manual-field enrichment (packages/core AuditManualFields)
 *  over JSON: each field optional, each value carrying its provenance. */
export interface ManualFieldsResponse {
  siren?: ProvenancedFieldValue;
  sirenSourceUrl?: ProvenancedFieldValue;
  raisonSociale?: ProvenancedFieldValue;
  nomCommercial?: ProvenancedFieldValue;
  sector?: ProvenancedSectorValue;
  declarationContactEmail?: ProvenancedFieldValue;
  transactionalFlowOverride?: TransactionalFlowOverrideValue;
  updatedAt: string;
}

/** Issue #90: the job row of the pipeline run that produced this audit,
 *  present only when that run stopped at 'failed' or 'needs-input' after
 *  the audit was persisted. `error` is the stored pipeline message, which
 *  is only ever English; the pages pair it with bilingual remediation copy
 *  keyed on the typed case (needsInputFields means the identity gate). */
export interface AuditFailureResponse {
  jobId: string;
  status: 'failed' | 'needs-input';
  error: string;
  needsInputFields?: { field: string; value: string }[];
}

export interface ReportStatusResponse {
  language: ReportLanguage;
  status: ReportFreshness;
  /** Measured Paged.js page count of the stored PDF (plan 018); absent on
   *  legacy reports generated before it was recorded. */
  pageCount?: number;
  /** Issue #91: whether the machine serving the dashboard can resolve the
   *  PDF bytes (file ref plus bucket/artifact fallback and the stored
   *  digest check, the exact read the preview and download endpoints
   *  run). False also when no report document exists for the language. */
  pdfAvailable: boolean;
  /** Plan 050: rendered by an older report template. Advisory only; the
   *  report stays previewable and deliverable. */
  olderTemplate?: boolean;
}

export interface ApprovedReportRefResponse {
  reportId: string;
  pdfDigest: string;
}

export interface ReportApprovalResponse {
  approvalId: string;
  auditId: string;
  fr: ApprovedReportRefResponse;
  /** Plan 067: English is attached and approved only when explicitly generated. */
  en?: ApprovedReportRefResponse;
  approvedAt: string;
}

/** Issue #93: the reviewed copy for one detector rule (trade-off 71),
 *  keyed by ruleId in AuditDetailResponse.ruleCopy. Every field is absent
 *  when the report package's reviewed tables have no entry for the rule;
 *  the page then falls back to the finding's raw title and shows no
 *  remediation rather than a guess. */
export interface RuleCopyResponse {
  /** Reviewed French title (the report's rule-translation table);
   *  English reports use the finding's own title verbatim. */
  titleFr?: string;
  /** Short plain-language French gloss under the rule code. */
  glossFr?: string;
  remediationFr?: string;
  remediationEn?: string;
}

/** The audit's prospect link and current preview state. */
export interface AuditOutreachStatusResponse {
  prospectId: string | null;
  hasLivePreview: boolean;
}

/** The prospect this audit is attached to, when any. */
export interface AuditProspectResponse {
  prospectId: string;
  name: string;
}

/** Issue: operator-reviewed overall grade override. Present whenever the
 *  operator has saved one; absent means the report renders automaticGrade
 *  unchanged. */
export interface GradeOverrideResponse {
  grade: Grade;
  reason: string;
  reviewedAt: string;
  reviewedBy: 'operator';
}

/** Plan 068 scoped evidence diagnostics. They describe claim limitations;
 *  they are not a report approval state. */
export type EvidenceDiagnosticStatusResponse = 'complete' | 'limited' | 'unavailable';

export interface EvidenceLimitationResponse {
  limitationId: string;
  code: string;
  summary: Record<ReportLanguage, string>;
  reportDestination: string;
  evidenceRefs: string[];
}

export interface AuditEvidenceQualityResponse {
  status: EvidenceDiagnosticStatusResponse;
  clientLimitations: EvidenceLimitationResponse[];
  operationalWarnings: { code: string; referenceCount: number }[];
}

/** The whole GET /api/audits/:auditId body. */
export interface AuditDetailResponse {
  auditId: string;
  prospectId?: string;
  /** Null for audits stored before the intent was recorded; those keep the
   * client-report treatment they always had. */
  scanIntent?: 'quick-check' | 'prospecting-audit' | 'full-audit' | null;
  siteUrl: string;
  startedAt: string;
  finishedAt: string;
  pagesVisited: number;
  severityRollup: SeverityRollup;
  /** Issue #392: the part of severityRollup confined to third-party markup. */
  thirdPartySeverityRollup?: SeverityRollup;
  findings: FindingResponse[];
  /** Issue #392: findings wholly inside third-party markup, by finding id. */
  thirdPartyFindings?: Record<string, { vendor: string | null }>;
  /** Issue #93: reviewed copy per rule id referenced by `findings`. */
  ruleCopy?: Record<string, RuleCopyResponse>;
  reportLanguages: ReportLanguage[];
  reports: ReportStatusResponse[];
  lifecycle: AuditLifecycle;
  /** Plan 045 slice 1.2: whether a selected/canonical analysis resolves.
   *  Plan 067 keeps the legacy field name/value vocabulary for API
   *  compatibility even though French alone is now a complete selection. */
  analysisPair: 'selected' | 'legacy-latest' | 'none';
  /** Plan 067: languages carried by that resolved selection. The server
   *  always sends this on current responses; optional only so a stale cached
   *  payload from before Plan 067 remains conservatively renderable. */
  analysisLanguages?: ReportLanguage[];
  /** Plan 045 slice 1.2: whether the audit's findings were normalized
   *  under a schema version or fingerprint the current code no longer
   *  produces (trade-off 40). True here means the produce step's own
   *  request will refresh findings before rendering, not that the button
   *  is disabled. */
  findingsStale: boolean;
  /** Plan 032 (issue #162): the selected analysis pair was produced by the
   *  audit fallback gate, so its reports carry no model-written analysis.
   *  False also when no analysis pair exists at all. */
  analysisIsStaticFallback: boolean;
  approval: ReportApprovalResponse | null;
  manualFields: ManualFieldsResponse | null;
  /** Issue: operator-reviewed overall grade override. The server always
   *  sends both; optional here for the same stale-cached-page tolerance
   *  as `outreach` below. */
  automaticGrade?: Grade;
  effectiveGrade?: Grade;
  gradeOverride?: GradeOverrideResponse | null;
  /** Plan 037 slice 5: prospecting provenance and current preview state.
   *  The server always sends it; optional here so an older cached page
   *  tolerates a payload from before the field existed. */
  outreach?: AuditOutreachStatusResponse;
  /** The attached prospect, if any. */
  prospect?: AuditProspectResponse | null;
  /** Whether the attach/detach control is available on this audit. */
  canAttachProspect?: boolean;
  /** The scan's original signal, before a possible operator correction. */
  detectedTransactionalFlow?: boolean;
  /** Issue #90: the failed pipeline run behind this audit, when there was
   *  one. Absent while the run is healthy. */
  failure?: AuditFailureResponse;
  /** Plan 068 scan-data-quality diagnostics. Optional only because quick
   *  checks/prospecting scans do not produce this diagnostic layer. */
  evidence?: AuditEvidenceQualityResponse;
}

/** POST /api/audits/:auditId/manual-fields/siren-preview. 200 even when
 *  the SIREN is valid but the Sirene lookup did not resolve it. */
export interface SirenPreviewResponse {
  resolved: boolean;
  denomination?: string;
}

/** MakeReportReadyOutcome's refusal union (packages/interface's
 *  pipeline/make-report-ready.ts) as it crosses the HTTP boundary. */
export type MakeReportReadyRefusalResponse =
  | { kind: 'audit-not-found' }
  | { kind: 'scan-data-missing' }
  | { kind: 'no-analysis' }
  | { kind: 'identity-unconfirmed'; fields: { field: string; value: string }[] };

/** POST /api/audits/:auditId/manual-fields/confirm. The field is stamped
 *  operator-confirmed unconditionally (manualFields always reflects the
 *  write); pdfs then reports what, if anything, that unblocked:
 *  'waiting-other-field' when a second detected identity field still
 *  awaits confirmation, 'generated' when makeReportReady produced both
 *  PDFs, or the exact refusal it returned otherwise. */
export interface ManualFieldsConfirmResponse {
  manualFields: ManualFieldsResponse;
  pdfs: 'generated' | 'waiting-other-field' | MakeReportReadyRefusalResponse;
}
