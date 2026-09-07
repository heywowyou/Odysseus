/**
 * Milestone 9c plan 030: first-touch drafts for up to `options.limit`
 * contactable cohort members, the dashboard-triggered equivalent of
 * `odysseus prospect draft batch`. A sequential loop, not a worker pool
 * like run-prospecting-job.ts: each item is one LLM call and one Gmail
 * draft call, not a site scan, so there is no origin to parallelize across
 * and no reason to add new Gmail-rate-limit exposure.
 */

import {
  completeJob,
  listContactableCohortMembers,
  updateJobProgress,
  type JobDocument,
  type OutreachBatchResult,
} from '@odysseus/store';
import { createTouchOneDraft } from '../../outreach/draft-runtime.js';
import { CURRENT_CONTACT_VERSION } from '../../prospecting/hotel-contacts/discover-contacts.js';
import type { PipelineContext } from '../job-queue.js';
import { JobCancelledError } from '../cancellation.js';

export async function runOutreachDraftBatchJob(
  job: JobDocument,
  ctx: PipelineContext,
): Promise<void> {
  const { connection, cancellation } = ctx;
  const limit = job.options.limit ?? 0;
  if (limit <= 0) {
    throw new Error(`odysseus interface: outreach-draft-batch job ${job.jobId} has no limit`);
  }
  const language = job.options.language ?? 'fr';

  const members = await listContactableCohortMembers(connection, {
    contactVersion: CURRENT_CONTACT_VERSION,
    limit,
  });

  await updateJobProgress(connection, job.jobId, {
    phase: 'drafting',
    progress: { message: `0 of ${members.length} drafted` },
    outreachBatchResults: [],
  });

  const results: OutreachBatchResult[] = [];
  for (const member of members) {
    if (cancellation.isRequested(job.jobId)) throw new JobCancelledError(job.jobId);

    const outcome = await createTouchOneDraft(connection, member.candidateId, { language });
    if (!outcome.configured) {
      throw new Error(`no mailbox is configured (${outcome.refusal})`);
    }
    results.push({
      id: member.candidateId,
      created: outcome.created,
      ...(outcome.refusal === undefined ? {} : { refusal: outcome.refusal }),
    });

    await updateJobProgress(connection, job.jobId, {
      progress: { message: `${results.length} of ${members.length} drafted` },
      outreachBatchResults: results,
    });
  }

  await completeJob(connection, job.jobId, { outreachBatchResults: results });
}
