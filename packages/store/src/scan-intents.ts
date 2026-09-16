import type { ScanIntent } from '@odysseus/core';
import type { JobOptionsSnapshot, JobType } from './schemas/job.schema.js';

/** The scans an operator can launch today: a bounded informational Quick
 *  check, or a Full scan that captures complete reusable evidence. The
 *  wider core ScanIntent union stays the historical read contract: stored
 *  audits and jobs may still carry `prospecting-audit`, which is readable
 *  but never newly launchable. */
export const CURRENT_SCAN_INTENTS = ['quick-check', 'full-audit'] as const satisfies readonly (
  ScanIntent | JobType
)[];

export type CurrentScanIntent = (typeof CURRENT_SCAN_INTENTS)[number];

export function isCurrentScanIntent(value: unknown): value is CurrentScanIntent {
  return typeof value === 'string' && (CURRENT_SCAN_INTENTS as readonly string[]).includes(value);
}

/** The queue type for a current intent is intentionally identity-preserving.
 * This tiny function makes the boundary explicit and keeps a future route
 * from silently sending a scan to the generic batch runner. */
export function canonicalJobTypeForScanIntent(intent: CurrentScanIntent): CurrentScanIntent {
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
