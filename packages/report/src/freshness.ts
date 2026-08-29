import type { FindingsProvenance } from '@odysseus/core';
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

  const provenance = report.findingsProvenance;
  return provenance.findingsSchemaVersion === currentFindings.findingsSchemaVersion &&
    provenance.normalizationFingerprint === currentFindings.normalizationFingerprint &&
    provenance.findingsDigest === currentFindings.findingsDigest &&
    report.rendererVersion === REPORT_TEMPLATE_VERSION &&
    report.reportTemplateVersion === REPORT_TEMPLATE_VERSION
    ? 'fresh'
    : 'stale';
}
