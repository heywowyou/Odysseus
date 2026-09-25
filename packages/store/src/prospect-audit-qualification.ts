/** Pure audit-purpose and outreach-qualification rules shared by scan
 * finalization, prospect work, guards, and manual audit attachment.
 *
 * Plan 050: two separate questions. Qualification asks whether the website
 * evidence is complete enough for outreach (eligible purpose AND complete
 * coverage). The data version asks whether the derived findings were
 * produced by today's normalization code. The second is advisory only: an
 * older version never makes captured evidence unusable or asks for a
 * rescan. */

import {
  assessCrawlCoverage,
  NORMALIZATION_FINGERPRINT,
  type ScanIntent,
  type SitemapCoverageSummary,
} from '@odysseus/core';
import type { JobOptionsSnapshot, JobType } from './schemas/job.schema.js';

export type ProspectAuditScanIntent = ScanIntent;

/** Full scans, plus historical complete prospecting audits (including the
 *  older outreach-full-scan rows classified as such below). */
const OUTREACH_ELIGIBLE_SCAN_INTENTS: readonly ProspectAuditScanIntent[] = [
  'prospecting-audit',
  'full-audit',
];

export interface AuditQualificationInput {
  scanIntent?: ProspectAuditScanIntent;
  pages: readonly { status: string; httpStatus?: number }[];
  crawl?: { sitemapCoverage?: SitemapCoverageSummary };
  findingsProvenance?: { normalizationFingerprint?: string };
}

/** Advisory provenance of an audit's derived findings. `older` means the
 *  findings were normalized by earlier code; the stored results remain
 *  usable. `unknown` means no fingerprint was ever stamped. */
export type AuditDataVersionState = 'current' | 'older' | 'unknown';

export function auditDataVersionState(input: AuditQualificationInput): AuditDataVersionState {
  const fingerprint = input.findingsProvenance?.normalizationFingerprint;
  if (fingerprint === undefined) return 'unknown';
  return fingerprint === NORMALIZATION_FINGERPRINT ? 'current' : 'older';
}

export function hasOutreachEligibleScanIntent(input: AuditQualificationInput): boolean {
  return (
    input.scanIntent !== undefined && OUTREACH_ELIGIBLE_SCAN_INTENTS.includes(input.scanIntent)
  );
}

function hasCompleteCoverage(input: AuditQualificationInput): boolean {
  const coverage = assessCrawlCoverage({
    pages: input.pages,
    ...(input.crawl?.sitemapCoverage === undefined
      ? {}
      : { sitemapCoverage: input.crawl.sitemapCoverage }),
  });
  return coverage.reasonCodes.length === 0;
}

/** Purpose + coverage. The data version is deliberately absent. */
export function isOutreachQualifyingAudit(input: AuditQualificationInput): boolean {
  return hasOutreachEligibleScanIntent(input) && hasCompleteCoverage(input);
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
