/** Pure audit-purpose and outreach-qualification rules shared by scan
 * finalization, prospect work, guards, and manual audit attachment. */

import {
  assessCrawlCoverage,
  NORMALIZATION_FINGERPRINT,
  type ScanIntent,
  type SitemapCoverageSummary,
} from '@odysseus/core';
import type { JobOptionsSnapshot, JobType } from './schemas/job.schema.js';

export type ProspectAuditScanIntent = ScanIntent;

export const OUTREACH_ELIGIBLE_SCAN_INTENTS: readonly ProspectAuditScanIntent[] = [
  'prospecting-audit',
  'full-audit',
];

export interface AuditQualificationInput {
  scanIntent?: ProspectAuditScanIntent;
  pages: readonly { status: string; httpStatus?: number }[];
  crawl?: { sitemapCoverage?: SitemapCoverageSummary };
  findingsProvenance?: { normalizationFingerprint?: string };
}

export function hasCurrentFindingsProvenance(input: AuditQualificationInput): boolean {
  return input.findingsProvenance?.normalizationFingerprint === NORMALIZATION_FINGERPRINT;
}

export function hasOutreachEligibleScanIntent(input: AuditQualificationInput): boolean {
  return (
    input.scanIntent !== undefined && OUTREACH_ELIGIBLE_SCAN_INTENTS.includes(input.scanIntent)
  );
}

export function isOutreachQualifyingAudit(input: AuditQualificationInput): boolean {
  if (!hasOutreachEligibleScanIntent(input) || !hasCurrentFindingsProvenance(input)) return false;
  const coverage = assessCrawlCoverage({
    pages: input.pages,
    ...(input.crawl?.sitemapCoverage === undefined
      ? {}
      : { sitemapCoverage: input.crawl.sitemapCoverage }),
  });
  return coverage.reasonCodes.length === 0;
}

export interface AuditIntentSourceJob {
  auditId?: string;
  auditIds?: readonly string[];
  type: JobType;
  options?: Pick<JobOptionsSnapshot, 'scanType'>;
}

function jobProducedAudit(job: AuditIntentSourceJob, auditId: string): boolean {
  return job.auditId === auditId || job.auditIds?.includes(auditId) === true;
}

/** Classifies an audit created before the persisted scanIntent field existed.
 * Only an unambiguous producing-job relation is accepted. Missing, mixed, or
 * bounded-batch evidence returns undefined so outreach readiness fails closed. */
export function classifyLegacyAuditScanIntent(
  auditId: string,
  jobs: readonly AuditIntentSourceJob[],
): ProspectAuditScanIntent | undefined {
  const matchingJobs = jobs.filter((job) => jobProducedAudit(job, auditId));
  if (matchingJobs.length === 0) return undefined;

  const intents = new Set<ProspectAuditScanIntent>();
  for (const job of matchingJobs) {
    if (job.type === 'quick-check') {
      intents.add('quick-check');
      continue;
    }
    if (job.type === 'prospecting-audit' || job.type === 'outreach-full-scan') {
      intents.add('prospecting-audit');
      continue;
    }
    if (job.type === 'full-audit') {
      intents.add('full-audit');
      continue;
    }
    if (job.type === 'prospecting' && job.options?.scanType === 'quick-check') {
      intents.add('quick-check');
      continue;
    }

    // A bounded generic prospecting row, including the old row that was
    // mislabeled prospecting-audit, is known but never outreach-grade.
    return undefined;
  }

  return intents.size === 1 ? [...intents][0] : undefined;
}

export function effectiveAuditScanIntent(
  audit: { auditId: string; scanIntent?: ProspectAuditScanIntent },
  jobs: readonly AuditIntentSourceJob[],
): ProspectAuditScanIntent | undefined {
  return audit.scanIntent ?? classifyLegacyAuditScanIntent(audit.auditId, jobs);
}
