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

export type FieldProvenance = 'detected' | 'operator';

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
  revenueBand?: ProvenancedFieldValue;
  declarationContactEmail?: ProvenancedFieldValue;
  recipientName?: ProvenancedFieldValue;
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
}

export interface ApprovedReportRefResponse {
  reportId: string;
  pdfDigest: string;
}

export interface ReportApprovalResponse {
  approvalId: string;
  auditId: string;
  fr: ApprovedReportRefResponse;
  en: ApprovedReportRefResponse;
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

/** Plan 037 slice 5: the audit's prospecting provenance and current v2
 *  preview state, present on every audit detail response. A non-candidate
 *  audit reads as candidateId null and hasLiveV2Preview false. */
export interface AuditOutreachStatusResponse {
  candidateId: string | null;
  hasLiveV2Preview: boolean;
}

/** The whole GET /api/audits/:auditId body. */
export interface AuditDetailResponse {
  auditId: string;
  siteUrl: string;
  startedAt: string;
  finishedAt: string;
  pagesVisited: number;
  severityRollup: SeverityRollup;
  findings: FindingResponse[];
  /** Issue #93: reviewed copy per rule id referenced by `findings`. */
  ruleCopy?: Record<string, RuleCopyResponse>;
  reportLanguages: ReportLanguage[];
  reports: ReportStatusResponse[];
  lifecycle: AuditLifecycle;
  /** Plan 032 (issue #162): the selected analysis pair was produced by the
   *  audit fallback gate, so its reports carry no model-written analysis.
   *  False also when no analysis pair exists at all. */
  analysisIsStaticFallback: boolean;
  approval: ReportApprovalResponse | null;
  manualFields: ManualFieldsResponse | null;
  /** Plan 037 slice 5: prospecting provenance and current preview state.
   *  The server always sends it; optional here so an older cached page
   *  tolerates a payload from before the field existed. */
  outreach?: AuditOutreachStatusResponse;
  /** The scan's original signal, before a possible operator correction. */
  detectedTransactionalFlow?: boolean;
  /** Issue #90: the failed pipeline run behind this audit, when there was
   *  one. Absent while the run is healthy. */
  failure?: AuditFailureResponse;
}

/** POST /api/audits/:auditId/manual-fields/siren-preview. 200 even when
 *  the SIREN is valid but the Sirene lookup did not resolve it. */
export interface SirenPreviewResponse {
  resolved: boolean;
  denomination?: string;
}
