/** Prospect-native first-email batch runner. */

import {
  completeJob,
  updateJobProgress,
  type JobDocument,
  type OutreachBatchResult,
} from '@odysseus/store';
import { createTouchOneDraft } from '../../outreach/draft-runtime.js';
import type { PipelineContext } from '../job-queue.js';
import { JobCancelledError } from '../cancellation.js';

export async function runOutreachDraftBatchJob(
  job: JobDocument,
  ctx: PipelineContext,
): Promise<void> {
  const { connection, cancellation } = ctx;
  const prospectId = job.options.prospectId;
  if (prospectId === undefined) {
    throw new Error(`odysseus interface: outreach-draft-batch job ${job.jobId} has no prospectId`);
  }
  if (cancellation.isRequested(job.jobId)) throw new JobCancelledError(job.jobId);

  const outcome = await createTouchOneDraft(connection, prospectId, {
    language: job.options.language ?? 'fr',
    previewToken: '',
  });
  if (!outcome.configured) throw new Error(`no mailbox is configured (${outcome.refusal})`);
  const result: OutreachBatchResult = {
    id: prospectId,
    created: outcome.created,
    ...(outcome.refusal === undefined ? {} : { refusal: outcome.refusal }),
  };
  await updateJobProgress(connection, job.jobId, {
    phase: 'drafting',
    progress: { message: '1 of 1 drafted' },
    outreachBatchResults: [result],
  });
  await completeJob(connection, job.jobId, { outreachBatchResults: [result] });
}
