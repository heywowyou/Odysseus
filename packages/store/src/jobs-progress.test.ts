import { afterAll, describe, expect, it } from 'vitest';
import { cancelJob, createJob, getJob, updateJobProgress } from './jobs.js';
import { probeMongoAvailability, scopedMongoTestUri } from './test-support.js';

const { available, connection } = await probeMongoAvailability(scopedMongoTestUri('jobs_progress'));

afterAll(async () => {
  if (!connection) return;
  await connection.dropDatabase();
  await connection.close();
});

describe.skipIf(!available)('updateJobProgress on a stopped job', () => {
  it('still records the audit link but not the progress', async () => {
    const job = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://example.com/',
      options: {},
    });
    await cancelJob(connection!, job.jobId, 'cancelled by operator');

    await updateJobProgress(connection!, job.jobId, { phase: 'analyze-fr', auditId: 'audit-1' });

    const stored = await getJob(connection!, job.jobId);
    expect(stored?.auditId).toBe('audit-1');
    expect(stored?.status).toBe('cancelled');
    expect(stored?.phase).toBe('cancelled');
  });
});
