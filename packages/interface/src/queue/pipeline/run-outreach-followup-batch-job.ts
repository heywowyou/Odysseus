/**
 * Milestone 9c plan 030: follow-up drafts (touch 2 or 3) for up to
 * `options.limit` threads currently due, the dashboard-triggered
 * equivalent of `odysseus prospect outreach draft-due`'s drafting half.
 * Mailbox sync stays a CLI/cron concern (see plan 030's own scope note);
 * this job only reads thread state as `listThreadsDueForFollowUp` already
 * finds it, exactly like the CLI command does after its own sync step.
 */

import {
  completeJob,
  listThreadsDueForFollowUp,
  updateJobProgress,
  type JobDocument,
  type OutreachBatchResult,
} from '@odysseus/store';
import { createFollowUpForCandidate } from '../../outreach/draft-runtime.js';
import type { PipelineContext } from '../job-queue.js';
import { JobCancelledError } from '../cancellation.js';

export async function runOutreachFollowupBatchJob(
  job: JobDocument,
  ctx: PipelineContext,
): Promise<void> {
  const { connection, cancellation } = ctx;
  const limit = job.options.limit ?? 0;
  if (limit <= 0) {
    throw new Error(`odysseus interface: outreach-followup-batch job ${job.jobId} has no limit`);
  }

  const due = await listThreadsDueForFollowUp(connection, { now: new Date(), limit });

  await updateJobProgress(connection, job.jobId, {
    phase: 'drafting',
    progress: { message: `0 of ${due.length} drafted` },
    outreachBatchResults: [],
  });

  const results: OutreachBatchResult[] = [];
  for (const thread of due) {
    if (cancellation.isRequested(job.jobId)) throw new JobCancelledError(job.jobId);

    const outcome = await createFollowUpForCandidate(connection, thread.threadId);
    if (!outcome.configured) {
      throw new Error(`no mailbox is configured (${outcome.refusal})`);
    }
    results.push({
      id: thread.threadId,
      created: outcome.created,
      ...(outcome.refusal === undefined ? {} : { refusal: outcome.refusal }),
    });

    await updateJobProgress(connection, job.jobId, {
      progress: { message: `${results.length} of ${due.length} drafted` },
      outreachBatchResults: results,
    });
  }

  await completeJob(connection, job.jobId, { outreachBatchResults: results });
}
