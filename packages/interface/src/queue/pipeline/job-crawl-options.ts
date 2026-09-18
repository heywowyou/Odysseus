import type { Connection } from 'mongoose';
import { isJobClaimCurrent, type JobDocument, type JobOptionsSnapshot } from '@odysseus/store';
import type { RunAuditStageOptions } from '../../pipeline/audit-stage.js';

/** The operator's advanced crawl options, as every single-site runner
 *  forwards them to runAuditStage. One mapping for Quick Check, Full scan,
 *  and the historical prospecting-audit runner, so the intents cannot drift
 *  apart on what "pause between page loads" or "pages at once" means; the
 *  clamps that keep these options from speeding a crawl up stay in
 *  runAuditStage. Absent keys stay absent: the stage's defaults apply. */
export function crawlOptionsFromJob(
  options: JobOptionsSnapshot,
): Pick<
  RunAuditStageOptions,
  | 'maxPages'
  | 'maxDepth'
  | 'delayMs'
  | 'scanConcurrency'
  | 'seeds'
  | 'exclusions'
  | 'bookingEngineUrl'
> {
  return {
    ...(options.maxPages !== undefined ? { maxPages: options.maxPages } : {}),
    ...(options.maxDepth !== undefined ? { maxDepth: options.maxDepth } : {}),
    ...(options.delayMs !== undefined ? { delayMs: options.delayMs } : {}),
    ...(options.scanConcurrency !== undefined ? { scanConcurrency: options.scanConcurrency } : {}),
    ...(options.seeds !== undefined ? { seeds: options.seeds } : {}),
    ...(options.exclusions !== undefined ? { exclusions: options.exclusions } : {}),
    ...(options.bookingEngineUrl !== undefined
      ? { bookingEngineUrl: options.bookingEngineUrl }
      : {}),
  };
}

/** Plan 059 step 22: the claim a full-scan runner holds on its job, as the
 *  audit stage checks it before each evidence write. A job claimed by a
 *  build that predates claim ids has none, and runs unfenced as before. */
export function acquisitionClaimFor(
  connection: Connection,
  job: Pick<JobDocument, 'jobId' | 'claimId'>,
): Pick<RunAuditStageOptions, 'acquisitionClaim'> {
  const claimId = job.claimId;
  if (claimId === undefined) return {};
  return {
    acquisitionClaim: {
      claimId,
      isCurrent: () => isJobClaimCurrent(connection, job.jobId, claimId),
    },
  };
}
