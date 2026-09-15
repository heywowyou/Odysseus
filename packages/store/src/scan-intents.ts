import type { ScanIntent } from '@odysseus/core';
import type { JobOptionsSnapshot, JobType } from './schemas/job.schema.js';

export const CANONICAL_SINGLE_SITE_JOB_TYPES = [
  'quick-check',
  'prospecting-audit',
  'full-audit',
] as const satisfies readonly JobType[];

export type CanonicalSingleSiteJobType = (typeof CANONICAL_SINGLE_SITE_JOB_TYPES)[number];

/** The queue type for a public intent is intentionally identity-preserving.
 * This tiny function makes the boundary explicit and keeps a future route
 * from silently sending Prepare outreach to the generic batch runner. */
export function canonicalJobTypeForScanIntent(intent: ScanIntent): CanonicalSingleSiteJobType {
  return intent;
}

/** One compatibility adapter for display and historical job reads. New
 * canonical rows always win over a stale options.scanType field. */
export function displayJobIntent(
  type: JobType,
  scanType: JobOptionsSnapshot['scanType'] | undefined,
): JobType | ScanIntent {
  if (type === 'quick-check' || type === 'prospecting-audit' || type === 'full-audit') {
    return type;
  }
  if (type === 'outreach-full-scan') return 'prospecting-audit';
  if (type === 'prospecting' && scanType !== undefined) return scanType;
  return type;
}
