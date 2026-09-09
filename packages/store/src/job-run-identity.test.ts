import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { completeJob, createJob, ensureJobRunIdentity } from './jobs.js';
import { createJobModel } from './schemas/job.schema.js';
import { probeMongoAvailability } from './test-support.js';

const { available: mongoAvailable, connection } = await probeMongoAvailability();

// Same no-dropDatabase discipline as jobs.test.ts: this file never owns the
// shared odysseus_test database's lifecycle. Every job it creates is
// completed before its test ends so no leftover queued document can break
// another suite's FIFO-ordering assertions.
afterAll(async () => {
  if (connection) await connection.close();
});

describe.skipIf(!mongoAvailable)('ensureJobRunIdentity', () => {
  it('mints one identity, and a second call returns the identical one', async () => {
    const job = await createJob(connection!, {
      type: 'full-audit',
      siteUrl: 'https://example.com/',
      options: {},
    });

    const first = await ensureJobRunIdentity(connection!, job.jobId);
    const second = await ensureJobRunIdentity(connection!, job.jobId);

    expect(first.auditId).toBeTruthy();
    expect(first.startedAt).toBeInstanceOf(Date);
    expect(second).toEqual(first);

    await completeJob(connection!, job.jobId);
  });

  it('returns the existing identity of a job that already had one, without re-minting', async () => {
    const JobModel = createJobModel(connection!);
    const jobId = randomUUID();
    await JobModel.create({
      jobId,
      type: 'full-audit',
      status: 'running',
      phase: 'crawl',
      options: {},
      createdAt: new Date(),
      progress: {},
      runIdentity: { startedAt: new Date('2026-09-09T00:00:00.000Z'), auditId: 'run-audit-42' },
    });

    const identity = await ensureJobRunIdentity(connection!, jobId);

    expect(identity.auditId).toBe('run-audit-42');
    expect(identity.startedAt.toISOString()).toBe('2026-09-09T00:00:00.000Z');
  });

  it('throws for a job that has no document', async () => {
    await expect(ensureJobRunIdentity(connection!, 'no-such-job')).rejects.toThrow(/no document/);
  });
});
