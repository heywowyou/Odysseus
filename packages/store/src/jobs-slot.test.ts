import { afterAll, describe, expect, it } from 'vitest';
import { ActiveJobSlotTakenError, completeJob, createJob } from './jobs.js';
import { createJobModel } from './schemas/job.schema.js';
import { probeMongoAvailability, scopedMongoTestUri } from './test-support.js';

const { available, connection } = await probeMongoAvailability(scopedMongoTestUri('jobs_slot'));

afterAll(async () => {
  if (!connection) return;
  await connection.dropDatabase();
  await connection.close();
});

describe.skipIf(!available)('createJob prospect scan slot', () => {
  const fullScan = (prospectId: string) =>
    ({ type: 'full-audit', siteUrl: 'https://slot.example/', options: { prospectId } }) as const;

  it('creates exactly one job when launches for the same prospect race', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => createJob(connection!, fullScan('p-race'))),
    );
    const created = results.filter((result) => result.status === 'fulfilled');
    const refused = results.filter(
      (result) => result.status === 'rejected' && result.reason instanceof ActiveJobSlotTakenError,
    );
    expect(created).toHaveLength(1);
    expect(refused).toHaveLength(4);
    expect(
      await createJobModel(connection!).countDocuments({ 'options.prospectId': 'p-race' }),
    ).toBe(1);
  });

  it('lets a new job take the slot once the holder has finished', async () => {
    const first = await createJob(connection!, fullScan('p-reuse'));
    await expect(createJob(connection!, fullScan('p-reuse'))).rejects.toBeInstanceOf(
      ActiveJobSlotTakenError,
    );
    await completeJob(connection!, first.jobId);

    const second = await createJob(connection!, fullScan('p-reuse'));
    expect(second.activeSlot).toBe('p-reuse:complete-crawl');
    const firstStored = await createJobModel(connection!).findOne({ jobId: first.jobId }).lean();
    expect(firstStored?.activeSlot).toBeUndefined();
  });

  it('keeps Quick Check and complete crawl slots apart and leaves unattached jobs unslotted', async () => {
    await createJob(connection!, fullScan('p-kinds'));
    const quick = await createJob(connection!, {
      type: 'quick-check',
      siteUrl: 'https://slot.example/',
      options: { prospectId: 'p-kinds', maxPages: 1 },
    });
    expect(quick.activeSlot).toBe('p-kinds:quick-check');

    const unattached = await Promise.all([
      createJob(connection!, { type: 'full-audit', siteUrl: 'https://slot.example/', options: {} }),
      createJob(connection!, { type: 'full-audit', siteUrl: 'https://slot.example/', options: {} }),
    ]);
    expect(unattached.every((job) => job.activeSlot === undefined)).toBe(true);
  });
});
