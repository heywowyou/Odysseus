import { findingsProvenanceMatches, type FindingsProvenance } from '@odysseus/core';
import { REPORT_TEMPLATE_VERSION } from './constants.js';

export type ReportFreshness = 'fresh' | 'stale' | 'unverified';

export interface ReportFreshnessMetadata {
  reportId?: string;
  analysisId?: string;
  findingsProvenance?: FindingsProvenance;
  rendererVersion?: number;
  pdfDigest?: string;
  reportTemplateVersion?: number;
}

/** Whether a report describes the audit's stored findings: the report's
 *  findings provenance (schema, fingerprint, digest) must match the audit's
 *  own stamped provenance. The renderer/template version is deliberately
 *  not part of this verdict (Plan 050): a newer Odysseus release must not
 *  make an existing digest-verified report undeliverable. Template age is
 *  reported separately by reportUsesCurrentTemplate as advice. */
export function classifyReportFreshness(
  report: ReportFreshnessMetadata,
  currentFindings: FindingsProvenance | undefined,
): ReportFreshness {
  if (
    currentFindings === undefined ||
    report.reportId === undefined ||
    report.analysisId === undefined ||
    report.findingsProvenance === undefined ||
    report.rendererVersion === undefined ||
    report.pdfDigest === undefined
  ) {
    return 'unverified';
  }

  return findingsProvenanceMatches(report.findingsProvenance, currentFindings) ? 'fresh' : 'stale';
}

/** Advisory: false when the report was rendered by an older template than
 *  this release ships. Regenerating is the operator's choice. */
export function reportUsesCurrentTemplate(report: ReportFreshnessMetadata): boolean {
  return (
    report.rendererVersion === REPORT_TEMPLATE_VERSION &&
    report.reportTemplateVersion === REPORT_TEMPLATE_VERSION
  );
}
