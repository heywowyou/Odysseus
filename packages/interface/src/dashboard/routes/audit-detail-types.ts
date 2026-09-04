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

export interface ReportStatusResponse {
  language: ReportLanguage;
  status: ReportFreshness;
  /** Measured Paged.js page count of the stored PDF (plan 018); absent on
   *  legacy reports generated before it was recorded. */
  pageCount?: number;
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

/** The whole GET /api/audits/:auditId body. */
export interface AuditDetailResponse {
  auditId: string;
  siteUrl: string;
  startedAt: string;
  finishedAt: string;
  pagesVisited: number;
  severityRollup: SeverityRollup;
  findings: FindingResponse[];
  reportLanguages: ReportLanguage[];
  reports: ReportStatusResponse[];
  lifecycle: AuditLifecycle;
  approval: ReportApprovalResponse | null;
  manualFields: ManualFieldsResponse | null;
  /** The scan's original signal, before a possible operator correction. */
  detectedTransactionalFlow?: boolean;
}

/** POST /api/audits/:auditId/manual-fields/siren-preview. 200 even when
 *  the SIREN is valid but the Sirene lookup did not resolve it. */
export interface SirenPreviewResponse {
  resolved: boolean;
  denomination?: string;
}
