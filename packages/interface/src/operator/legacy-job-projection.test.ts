import { describe, expect, it } from 'vitest';
import type { JobDocument, JobStatus, JobType } from '@odysseus/store';
import { operatorWorkViewSchema } from './contract.js';
import { projectLegacyJob } from './legacy-job-projection.js';

const STATUSES: JobStatus[] = [
  'queued',
  'running',
  'cancel-requested',
  'complete',
  'failed',
  'cancelled',
  'needs-input',
];
const TYPES: JobType[] = [
  'full-audit',
  'quick-check',
  'prospecting-audit',
  'prospecting',
  'outreach-draft-batch',
  'outreach-followup-batch',
  'outreach-full-scan',
];

function job(fields: Partial<JobDocument> = {}): JobDocument {
  return {
    jobId: 'job-1',
    type: 'full-audit',
    status: 'running',
    phase: 'scan',
    options: {},
    createdAt: new Date('2026-09-18T10:00:00Z'),
    progress: {},
    ...fields,
  };
}

describe('projectLegacyJob', () => {
  it('maps every legacy status and type to a valid operator view', () => {
    for (const status of STATUSES) {
      for (const type of TYPES) {
        const view = projectLegacyJob(job({ status, type }));
        expect(operatorWorkViewSchema.safeParse(view).success, `${type}/${status}`).toBe(true);
      }
    }
  });

  it('maps statuses without inventing richer history', () => {
    const states = STATUSES.map((status) => projectLegacyJob(job({ status })).state);
    expect(states).toEqual([
      'queued',
      'running',
      'cancel-requested',
      'completed',
      'failed',
      'cancelled',
      'needs-attention',
    ]);
    // A legacy running row has no durable wait/retry metadata.
    const running = projectLegacyJob(job({ status: 'running' }));
    expect(running.wait).toBeUndefined();
    expect(running.attempt).toBeUndefined();
  });

  it('keeps a legacy failure cause unknown and names only the phase it stored', () => {
    expect(projectLegacyJob(job({ status: 'failed', failedPhase: 'crawl' })).issue).toEqual({
      category: 'unknown',
      reason: 'crawl-failed',
      stage: 'crawl',
      retryable: true,
    });
    expect(projectLegacyJob(job({ status: 'failed' })).issue?.reason).toBe('unclassified-failure');
  });

  it('routes an identity hold to operator input, not to a failure', () => {
    expect(projectLegacyJob(job({ status: 'needs-input' })).issue).toMatchObject({
      category: 'operator-input',
      reason: 'identity-confirmation-required',
    });
  });

  it('reports a real denominator only where the producer owns one', () => {
    expect(
      projectLegacyJob(job({ phase: 'crawl', progress: { crawl: { visited: 5, target: 50 } } }))
        .progress,
    ).toEqual({ kind: 'indeterminate', activityCode: 'discovering-pages' });
    expect(
      projectLegacyJob(job({ phase: 'scan', progress: { scan: { scanned: 7, target: 20 } } }))
        .progress,
    ).toEqual({ kind: 'bounded-count', current: 7, total: 20, unit: 'pages' });
    expect(projectLegacyJob(job({ phase: 'analyze-fr' })).progress).toEqual({
      kind: 'indeterminate',
      activityCode: 'writing',
    });
    expect(projectLegacyJob(job({ status: 'complete', phase: 'complete' })).progress).toBe(
      undefined,
    );
  });

  it('names what a stopped or failed run preserved', () => {
    const view = projectLegacyJob(
      job({
        status: 'cancelled',
        auditId: 'audit-1',
        runIdentity: { startedAt: new Date(), auditId: 'audit-1' },
      }),
    );
    expect(view.preserved).toEqual({ auditIds: ['audit-1'], checkpoint: true });
  });

  it('gives only queued work a queue position', () => {
    expect(projectLegacyJob(job({ status: 'queued' }), { queuePosition: 2 }).queuePosition).toBe(2);
    expect(
      projectLegacyJob(job({ status: 'running' }), { queuePosition: 2 }).queuePosition,
    ).toBeUndefined();
  });
});
