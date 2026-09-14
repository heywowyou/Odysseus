/**
 * Issue #253 pilot scope: wraps store's updateJobProgress so a full-audit
 * (and outreach-full-scan, which shares the same crawl pipeline) job's
 * real phase transitions - already the single choke point every runner
 * reports progress through, per issue #243's finding that a hand-threaded
 * per-runner logger wasn't worth the churn - also produce job telemetry.
 * Other job types are not yet wired to this; see docs/rules/telemetry-rules.md
 * for the pilot's stated scope.
 */

import type { Connection } from 'mongoose';
import { updateJobProgress, type JobProgressPatch, type JobType } from '@odysseus/store';
import { readOdysseusBuildId } from '@odysseus/scanner';
import { captureJobTelemetry } from '../../telemetry/job-telemetry.js';
import type { JobTelemetryStage } from '../../telemetry/events.js';

/** Maps the job document's own phase vocabulary (packages/store/src/schemas
 *  /job.schema.ts) onto the coarser, closed telemetry stage set. A phase
 *  with no entry here (e.g. a job type this pilot doesn't cover) produces
 *  no telemetry rather than an invented stage name. */
const PHASE_TO_STAGE: Partial<Record<string, JobTelemetryStage>> = {
  queued: 'queue-wait',
  crawl: 'crawl',
  scan: 'page-work',
  'content-scan': 'axe',
  'select-performance': 'page-work',
  lighthouse: 'lighthouse',
  normalize: 'normalize',
  'analyze-fr': 'model-analysis',
  'analyze-en': 'model-analysis',
  'report-fr': 'report-render',
  'report-en': 'report-render',
  complete: 'persistence',
};

const lastStageByJobId = new Map<string, { stage: JobTelemetryStage; atMs: number }>();

/** Called from job-queue.ts's runJob finally block, mirroring
 *  CancellationRegistry.forget - the in-memory map must not leak an entry
 *  per job forever. */
export function forgetJobPhaseTelemetry(jobId: string): void {
  lastStageByJobId.delete(jobId);
}

/** The last stage this pilot observed the job transition into, for a
 *  job-failed event to report where in the pipeline it died instead of
 *  an uninformative 'unknown'. Must be read before forgetJobPhaseTelemetry
 *  clears the entry. */
export function lastKnownJobStage(jobId: string): JobTelemetryStage | undefined {
  return lastStageByJobId.get(jobId)?.stage;
}

export async function reportJobPhase(
  connection: Connection,
  jobId: string,
  jobType: JobType,
  patch: JobProgressPatch,
): Promise<void> {
  await updateJobProgress(connection, jobId, patch);
  if (patch.phase === undefined) return;
  const stage = PHASE_TO_STAGE[patch.phase];
  if (stage === undefined) return;

  const previous = lastStageByJobId.get(jobId);
  if (previous?.stage === stage) return;
  const now = Date.now();
  captureJobTelemetry({
    kind: 'stage-transition',
    jobId,
    jobType,
    buildId: readOdysseusBuildId(),
    stage,
    ...(previous !== undefined
      ? { previousStage: previous.stage, previousStageDurationMs: now - previous.atMs }
      : {}),
  });
  lastStageByJobId.set(jobId, { stage, atMs: now });
}
